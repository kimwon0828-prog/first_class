do $$
begin
  if exists (
    select 1
    from storage.buckets
    where id = 'class-covers'
  ) then
    update storage.buckets
      set public = true
    where id = 'class-covers';
  end if;
end
$$;

drop policy if exists "authenticated_upload_class_covers_in_org_path" on storage.objects;
create policy "authenticated_upload_class_covers_in_org_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'class-covers'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

drop policy if exists "authenticated_update_class_covers_in_org_path" on storage.objects;
create policy "authenticated_update_class_covers_in_org_path"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'class-covers'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
)
with check (
  bucket_id = 'class-covers'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
);

