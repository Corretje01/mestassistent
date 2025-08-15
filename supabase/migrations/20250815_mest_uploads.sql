-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- PROFILES (als nog niet bestaat)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep profiles in sync on signup (optional convenience)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- MEST_UPLOADS
create table if not exists public.mest_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null,
  mest_categorie text not null,  -- 'vaste_mest' | 'dikke_fractie' | 'drijfmest' | 'overig'
  mest_type text not null,       -- 'koe' | 'varken' | ...
  file_path text not null,
  file_mime text not null,
  postcode text not null,        -- '1234 AB' (met spatie)
  inkoopprijs_per_ton numeric not null, -- 2 dec. kun je afdwingen in UI/BE validatie
  aantal_ton numeric not null,          -- >0, max 2 dec.
  -- Analysevelden (read-only voor user)
  DS_percent numeric,                    -- required bij "publiek"? opgeslagen na extract
  N_kg_per_ton numeric,
  P_kg_per_ton numeric,
  K_kg_per_ton numeric,
  OS_percent numeric,                    -- optional
  Biogaspotentieel_m3_per_ton numeric,   -- optional
  status text not null default 'in_behandeling' check (status in ('in_behandeling','gepubliceerd','afgewezen')),
  moderation_note text,
  last_moderated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists mest_uploads_set_updated_at on public.mest_uploads;
create trigger mest_uploads_set_updated_at
before update on public.mest_uploads
for each row execute function public.set_updated_at();

-- RLS
alter table public.mest_uploads enable row level security;

-- Helpers
create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$$;

-- Policies: OWNER CRUD (with column restrictions on UPDATE)
drop policy if exists "owner_select" on public.mest_uploads;
create policy "owner_select"
on public.mest_uploads
for select
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

drop policy if exists "owner_insert" on public.mest_uploads;
create policy "owner_insert"
on public.mest_uploads
for insert
to authenticated
with check (auth.uid() = user_id);

-- OWNER may update ONLY allowed fields (naam, inkoopprijs_per_ton, aantal_ton, postcode)
drop policy if exists "owner_update_limited" on public.mest_uploads;
create policy "owner_update_limited"
on public.mest_uploads
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and row(
    -- enforce that immutable-by-user fields are unchanged
    DS_percent, N_kg_per_ton, P_kg_per_ton, K_kg_per_ton,
    OS_percent, Biogaspotentieel_m3_per_ton, status, user_id,
    mest_categorie, mest_type, file_path, file_mime
  ) is not distinct from row(
    old.DS_percent, old.N_kg_per_ton, old.P_kg_per_ton, old.K_kg_per_ton,
    old.OS_percent, old.Biogaspotentieel_m3_per_ton, old.status, old.user_id,
    old.mest_categorie, old.mest_type, old.file_path, old.file_mime
  )
);

drop policy if exists "owner_delete" on public.mest_uploads;
create policy "owner_delete"
on public.mest_uploads
for delete
to authenticated
using (auth.uid() = user_id);

-- ADMIN full update, incl. status/nutrients
drop policy if exists "admin_update" on public.mest_uploads;
create policy "admin_update"
on public.mest_uploads
for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admin_delete" on public.mest_uploads;
create policy "admin_delete"
on public.mest_uploads
for delete
to authenticated
using (public.is_admin(auth.uid()));

-- STORAGE: bucket 'mest-analyses' (private)
-- NB: Buckets maak je normaliter via dashboard of storage api.
-- Hieronder voorbeeld policies voor storage.objects:
-- Vereist: extension 'supabase_storage' bestaat in je project.
-- Maak bucket handmatig in dashboard: "mest-analyses" (public = off)

-- Policies on storage.objects
-- Select: owner or admin can read; (Admins may need full read)
drop policy if exists "read_own_and_admin" on storage.objects;
create policy "read_own_and_admin"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mest-analyses'
  and (
    (owner = auth.uid()) OR public.is_admin(auth.uid())
  )
);

-- Insert: only into bucket and path starting with user's uid/
drop policy if exists "user_uploads_to_own_folder" on storage.objects;
create policy "user_uploads_to_own_folder"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mest-analyses'
  and (owner = auth.uid())
);

-- Update/Delete: owner or admin
drop policy if exists "update_own_or_admin" on storage.objects;
create policy "update_own_or_admin"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'mest-analyses'
  and ((owner = auth.uid()) or public.is_admin(auth.uid()))
)
with check (true);

drop policy if exists "delete_own_or_admin" on storage.objects;
create policy "delete_own_or_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mest-analyses'
  and ((owner = auth.uid()) or public.is_admin(auth.uid()))
);
