do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'class-covers'
  ) then
    insert into storage.buckets (id, name, public)
    values ('class-covers', 'class-covers', true);
  else
    update storage.buckets
      set name = 'class-covers',
          public = true
    where id = 'class-covers';
  end if;
end
$$;

drop policy if exists "public_read_class_covers" on storage.objects;
create policy "public_read_class_covers"
on storage.objects
for select
to anon, authenticated
using (
  bucket_id = 'class-covers'
);

drop policy if exists "teacher_upload_class_covers_in_org_path" on storage.objects;
create policy "teacher_upload_class_covers_in_org_path"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'class-covers'
  and app.current_role() = 'teacher'
  and app.current_org_id() is not null
  and (storage.foldername(name))[1] = app.current_org_id()::text
);
