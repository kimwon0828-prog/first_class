do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'class_schedules'
      and policyname = 'class_schedules_parent_read_visible_class'
  ) then
    create policy class_schedules_parent_read_visible_class
    on public.class_schedules
    for select
    to authenticated
    using (
      app.current_role() = 'parent'
      and exists (
        select 1
        from public.classes c
        where c.id = class_schedules.class_id
          and c.is_active = true
      )
    );
  end if;
end
$$;
