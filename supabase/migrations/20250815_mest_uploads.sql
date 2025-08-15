-- ============================
-- RUN 1 (verbeterd): tabellen, triggers, RLS, policies
-- ============================

-- Extensies
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ----------------------------
-- PROFILES
-- ----------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nieuwe auth.users -> sync naar profiles
create or replace function public.handle_new_user()
returns trigger
as $fn$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$fn$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------
-- MEST_UPLOADS
-- ----------------------------
create table if not exists public.mest_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  naam text not null,
  mest_categorie text not null,   -- 'vaste_mest' | 'dikke_fractie' | 'drijfmest' | 'overig'
  mest_type text not null,        -- 'koe' | 'varken' | ...
  file_path text not null,
  file_mime text not null,
  postcode text not null,         -- '1234 AB'
  inkoopprijs_per_ton numeric not null,
  aantal_ton numeric not null,

  -- Analysevelden (read-only voor user; beheerder kan corrigeren)
  DS_percent numeric,
  N_kg_per_ton numeric,
  P_kg_per_ton numeric,
  K_kg_per_ton numeric,
  OS_percent numeric,
  Biogaspotentieel_m3_per_ton numeric,

  status text not null default 'in_behandeling'
    check (status in ('in_behandeling','gepubliceerd','afgewezen')),

  moderation_note text,
  last_moderated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at automatisch bijwerken
create or replace function public.set_updated_at()
returns trigger
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$ language plpgsql;

drop trigger if exists mest_uploads_set_updated_at on public.mest_uploads;
create trigger mest_uploads_set_updated_at
before update on public.mest_uploads
for each row execute function public.set_updated_at();

-- ----------------------------
-- RLS + helpers
-- ----------------------------
alter table public.mest_uploads enable row level security;

-- Helper: is huidige gebruiker admin?
create or replace function public.is_admin(uid uuid)
returns boolean
language sql stable
as $fn$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'admin'
  );
$fn$;

-- SELECT: eigenaar of admin
drop policy if exists "owner_select" on public.mest_uploads;
create policy "owner_select"
on public.mest_uploads
for select
to authenticated
using (auth.uid() = user_id or public.is_admin(auth.uid()));

-- INSERT: alleen voor zichzelf
drop policy if exists "owner_insert" on public.mest_uploads;
create policy "owner_insert"
on public.mest_uploads
for insert
to authenticated
with check (auth.uid() = user_id);

-- UPDATE (eigenaar): basis-toestemming; kolombeperkingen via trigger
drop policy if exists "owner_update" on public.mest_uploads;
create policy "owner_update"
on public.mest_uploads
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- DELETE: eigenaar mag verwijderen
drop policy if exists "owner_delete" on public.mest_uploads;
create policy "owner_delete"
on public.mest_uploads
for delete
to authenticated
using (auth.uid() = user_id);

-- ADMIN: volledige update/delete
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

-- ----------------------------
-- Trigger: kolom-beperkingen voor owners
-- ----------------------------
create or replace function public.enforce_owner_update_mask()
returns trigger
as $fn$
begin
  -- Admins mogen alles
  if public.is_admin(auth.uid()) then
    return NEW;
  end if;

  -- Alleen ingrijpen voor eigenaar
  if auth.uid() = OLD.user_id then
    -- Blokkeer wijzigingen aan read-only velden voor gebruikers
    if (NEW.DS_percent is distinct from OLD.DS_percent)
    or (NEW.N_kg_per_ton is distinct from OLD.N_kg_per_ton)
    or (NEW.P_kg_per_ton is distinct from OLD.P_kg_per_ton)
    or (NEW.K_kg_per_ton is distinct from OLD.K_kg_per_ton)
    or (NEW.OS_percent is distinct from OLD.OS_percent)
    or (NEW.Biogaspotentieel_m3_per_ton is distinct from OLD.Biogaspotentieel_m3_per_ton)
    or (NEW.status is distinct from OLD.status)
    or (NEW.user_id is distinct from OLD.user_id)
    or (NEW.mest_categorie is distinct from OLD.mest_categorie)
    or (NEW.mest_type is distinct from OLD.mest_type)
    or (NEW.file_path is distinct from OLD.file_path)
    or (NEW.file_mime is distinct from OLD.file_mime) then
      raise exception 'Update niet toegestaan: deze velden zijn read-only voor gebruikers';
    end if;
  end if;

  return NEW;
end;
$fn$ language plpgsql security definer set search_path = public;

drop trigger if exists mest_uploads_owner_mask on public.mest_uploads;
create trigger mest_uploads_owner_mask
before update on public.mest_uploads
for each row execute function public.enforce_owner_update_mask();
