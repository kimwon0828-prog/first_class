-- Applied in production with user authorization on 2026-11-04.
-- Project: first-class-mvp. No customer row writes.
-- Source: scripts/auth-linking-lab/google-link-guard.sql
-- CREATE (not CREATE OR REPLACE) avoids overwriting an existing function.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
create function public.guard_oauth_identity_link()
returns trigger language plpgsql set search_path = '' as $$
declare
  linking_email text := lower(new.identity_data->>'email');
  has_password boolean;
  has_identity boolean;
  has_proof boolean;
begin
  select coalesce(u.encrypted_password, '') <> '' into has_password from auth.users u where u.id = new.user_id;
  select count(*) > 0,
         coalesce(bool_or(i.provider <> 'email' and i.identity_data->>'email_verified' = 'true'
                          and lower(i.identity_data->>'email') = linking_email), false)
    into has_identity, has_proof
    from auth.identities i where i.user_id = new.user_id;

  if (new.provider = 'google' and (has_password or (has_identity and not has_proof)))
     or (has_identity and coalesce(new.identity_data->>'email_verified', '') <> 'true') then
    raise exception 'account_link_refused';
  end if;
  return new;
end $$;
revoke execute on function public.guard_oauth_identity_link() from public, anon, authenticated;
create trigger guard_oauth_identity_link before insert on auth.identities
  for each row when (new.provider <> 'email') execute function public.guard_oauth_identity_link();
commit;
