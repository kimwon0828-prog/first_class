create or replace function app.is_current_academy_for_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'academy'
      and p.organization_id = target_organization_id
  );
$$;

revoke all on function app.is_current_academy_for_org(uuid) from public;
revoke all on function app.is_current_academy_for_org(uuid) from anon;
grant execute on function app.is_current_academy_for_org(uuid) to authenticated;

drop policy if exists "academy_insert_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_insert_academy_profile_assets_in_org_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and app.is_current_academy_for_org(app.current_org_id())
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "academy_update_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_update_academy_profile_assets_in_org_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and app.is_current_academy_for_org(app.current_org_id())
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
)
with check (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and app.is_current_academy_for_org(app.current_org_id())
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "academy_delete_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_delete_academy_profile_assets_in_org_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and app.is_current_academy_for_org(app.current_org_id())
  and (storage.foldername(name))[1] = app.current_org_id()::text
  and (storage.foldername(name))[2] in ('logo', 'cover')
  and array_length(storage.foldername(name), 1) = 2
  and storage.filename(name) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$'
);
