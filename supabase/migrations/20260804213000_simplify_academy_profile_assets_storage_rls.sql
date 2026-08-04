drop policy if exists "academy_insert_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_insert_academy_profile_assets_in_org_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

drop policy if exists "academy_update_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_update_academy_profile_assets_in_org_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
)
with check (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

drop policy if exists "academy_delete_academy_profile_assets_in_org_path" on storage.objects;
create policy "academy_delete_academy_profile_assets_in_org_path"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'academy-profile-assets'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
);
