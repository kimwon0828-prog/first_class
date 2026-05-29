drop policy if exists classes_parent_read_applied on public.classes;

create policy classes_parent_read_applied
on public.classes
for select
to authenticated
using (
  app.current_role() = 'parent'
  and exists (
    select 1
    from public.trial_applications ta
    where ta.parent_id = auth.uid()
      and ta.class_id = classes.id
  )
);
