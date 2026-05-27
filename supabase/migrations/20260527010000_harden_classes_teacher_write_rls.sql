drop policy if exists classes_teacher_write_org on public.classes;

create policy classes_teacher_write_org
on public.classes
for all
to authenticated
using (
  app.current_role() = 'teacher'
  and organization_id = app.current_org_id()
)
with check (
  app.current_role() = 'teacher'
  and organization_id = app.current_org_id()
  and teacher_id is not null
  and exists (
    select 1
    from public.teachers t
    where t.id = classes.teacher_id
      and t.organization_id = classes.organization_id
  )
);
