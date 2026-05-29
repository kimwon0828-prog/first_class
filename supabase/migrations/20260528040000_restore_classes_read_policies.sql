drop policy if exists classes_public_read_active on public.classes;

create policy classes_public_read_active
on public.classes
for select
to anon, authenticated
using (is_active = true);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'classes'
      and policyname = 'classes_operator_read_org'
  ) then
    execute $policy$
      create policy classes_operator_read_org
      on public.classes
      for select
      to authenticated
      using (
        app.current_role() = 'operator'
        and organization_id = app.current_org_id()
      );
    $policy$;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'classes'
      and policyname = 'classes_teacher_read_org'
  ) then
    execute $policy$
      create policy classes_teacher_read_org
      on public.classes
      for select
      to authenticated
      using (
        app.current_role() = 'teacher'
        and organization_id = app.current_org_id()
      );
    $policy$;
  end if;
end
$$;
