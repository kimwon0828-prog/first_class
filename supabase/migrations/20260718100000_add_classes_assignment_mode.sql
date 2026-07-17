alter table public.classes
  add column if not exists assignment_mode text;

update public.classes
set assignment_mode = case
  when teacher_id is not null then 'preassigned'
  else 'post_assign'
end
where assignment_mode is null;

alter table public.classes
  alter column assignment_mode set default 'post_assign';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'classes_assignment_mode_check'
      and conrelid = 'public.classes'::regclass
  ) then
    alter table public.classes
      add constraint classes_assignment_mode_check
      check (assignment_mode in ('post_assign', 'preassigned'));
  end if;
end
$$;

alter table public.classes
  alter column assignment_mode set not null;

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
  and assignment_mode in ('post_assign', 'preassigned')
  and (
    (
      assignment_mode = 'post_assign'
      and (
        teacher_id is null
        or exists (
          select 1
          from public.teachers t
          where t.id = classes.teacher_id
            and t.organization_id = classes.organization_id
        )
      )
    )
    or (
      assignment_mode = 'preassigned'
      and teacher_id is not null
      and exists (
        select 1
        from public.teachers t
        where t.id = classes.teacher_id
          and t.organization_id = classes.organization_id
      )
    )
  )
);
