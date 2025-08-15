-- Maak (of behoud) private bucket voor analyses
insert into storage.buckets (id, name, public)
values ('mest-analyses','mest-analyses', false)
on conflict (id) do nothing;

-- Policies specifiek voor deze bucket
drop policy if exists "read_own_and_admin" on storage.objects;
create policy "read_own_and_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'mest-analyses'
  and (
    owner = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin')
  )
);

drop policy if exists "user_uploads_to_own_folder" on storage.objects;
create policy "user_uploads_to_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'mest-analyses'
  and owner = auth.uid()
);

drop policy if exists "update_own_or_admin" on storage.objects;
create policy "update_own_or_admin"
on storage.objects for update to authenticated
using (
  bucket_id = 'mest-analyses'
  and (owner = auth.uid()
       or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'))
)
with check (true);

drop policy if exists "delete_own_or_admin" on storage.objects;
create policy "delete_own_or_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'mest-analyses'
  and (owner = auth.uid()
       or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role='admin'))
);
