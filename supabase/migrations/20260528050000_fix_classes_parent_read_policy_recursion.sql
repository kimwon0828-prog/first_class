create or replace function app.parent_has_applied_class(class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, app
as $$
  select exists (
    select 1
    from public.trial_applications ta
    where ta.parent_id = auth.uid()
      and ta.class_id = parent_has_applied_class.class_id
  )
$$;

drop policy if exists classes_parent_read_applied on public.classes;

create policy classes_parent_read_applied
on public.classes
for select
to authenticated
using (
  app.current_role() = 'parent'
  and app.parent_has_applied_class(classes.id)
);
