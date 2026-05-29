alter table public.teachers
  alter column profile_id drop not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teachers'
      and column_name = 'display_name'
  ) then
    alter table public.teachers
      add column display_name text;
  end if;
end
$$;

update public.teachers t
set display_name = coalesce(nullif(trim(p.name), ''), '이름 미등록 선생님')
from public.profiles p
where t.profile_id = p.id
  and (t.display_name is null or trim(t.display_name) = '');

update public.teachers
set display_name = '이름 미등록 선생님'
where display_name is null
   or trim(display_name) = '';

alter table public.teachers
  alter column display_name set not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'teachers'
      and column_name = 'is_active'
  ) then
    alter table public.teachers
      add column is_active boolean not null default true;
  end if;
end
$$;

update public.teachers
set is_active = true
where is_active is null;

alter table public.teachers
  alter column is_active set default true;

create or replace view public.teacher_public_profiles
with (security_invoker = false)
as
select
  t.id as teacher_id,
  coalesce(nullif(trim(t.display_name), ''), nullif(trim(p.name), ''), '이름 미등록 선생님') as teacher_name,
  t.intro,
  t.specialty,
  t.career_years
from public.teachers t
left join public.profiles p on p.id = t.profile_id
where t.profile_id is null
   or p.role = 'teacher';

grant select on public.teacher_public_profiles to anon;
grant select on public.teacher_public_profiles to authenticated;

drop policy if exists teachers_select_self_or_teacher_same_org on public.teachers;
create policy teachers_select_self_or_teacher_same_org
on public.teachers
for select
to authenticated
using (
  profile_id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id = app.current_org_id()
  )
);

drop policy if exists teachers_insert_teacher_org on public.teachers;
create policy teachers_insert_teacher_org
on public.teachers
for insert
to authenticated
with check (
  app.current_role() = 'teacher'
  and organization_id = app.current_org_id()
  and profile_id is null
);

drop policy if exists teachers_update_self_or_teacher_same_org on public.teachers;
create policy teachers_update_self_or_teacher_same_org
on public.teachers
for update
to authenticated
using (
  profile_id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id = app.current_org_id()
  )
)
with check (
  profile_id = auth.uid()
  or (
    app.current_role() = 'teacher'
    and organization_id = app.current_org_id()
  )
);
