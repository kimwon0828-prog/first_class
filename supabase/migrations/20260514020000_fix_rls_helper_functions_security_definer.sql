create or replace function app.current_role()
returns text
language sql
stable
security definer
set search_path = public, app
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function app.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function app.current_teacher_id()
returns uuid
language sql
stable
security definer
set search_path = public, app
as $$
  select id from public.teachers where profile_id = auth.uid()
$$;

