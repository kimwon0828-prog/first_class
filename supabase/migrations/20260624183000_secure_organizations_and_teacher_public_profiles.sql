alter table public.organizations enable row level security;

revoke all on table public.organizations from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.organizations
  from authenticated;
grant select on table public.organizations to authenticated;

drop policy if exists organizations_authenticated_read_same_org on public.organizations;
create policy organizations_authenticated_read_same_org
on public.organizations
for select
to authenticated
using (
  app.current_org_id() is not null
  and id = app.current_org_id()
  and app.current_role() in ('teacher', 'operator')
);

revoke all on table public.teacher_public_profiles from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.teacher_public_profiles
  from authenticated;
grant select on table public.teacher_public_profiles to authenticated;

alter view public.teacher_public_profiles
  set (security_invoker = true);
