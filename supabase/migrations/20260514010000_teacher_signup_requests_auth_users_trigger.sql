-- Phase 3: Create teacher_signup_requests rows via auth.users trigger.
-- This avoids relying on session-dependent RLS inserts and works even when email confirmation is ON.

-- Ensure no direct insert policy is required for pending requests.
drop policy if exists teacher_signup_requests_insert_self on public.teacher_signup_requests;

create or replace function public.create_teacher_signup_request_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  signup_intent text;
  teacher_name text;
  organization_name text;
begin
  meta := new.raw_user_meta_data;
  signup_intent := coalesce(meta->>'signup_intent', '');

  if signup_intent <> 'teacher_public' then
    return new;
  end if;

  if exists (
    select 1
    from public.teacher_signup_requests r
    where r.user_id = new.id
      and r.status in ('pending', 'approved')
  ) then
    return new;
  end if;

  teacher_name := coalesce(nullif(meta->>'teacher_name', ''), nullif(meta->>'name', ''), '미입력');
  organization_name := coalesce(nullif(meta->>'organization_name', ''), '미입력');

  insert into public.teacher_signup_requests (
    user_id,
    status,
    teacher_name,
    teacher_phone,
    organization_name,
    branch_name,
    organization_phone,
    request_note
  ) values (
    new.id,
    'pending',
    teacher_name,
    nullif(meta->>'teacher_phone', ''),
    organization_name,
    nullif(meta->>'branch_name', ''),
    nullif(meta->>'organization_phone', ''),
    nullif(meta->>'request_note', '')
  );

  return new;
end;
$$;

drop trigger if exists create_teacher_signup_request_from_auth_user on auth.users;
create trigger create_teacher_signup_request_from_auth_user
after insert on auth.users
for each row
execute function public.create_teacher_signup_request_from_auth_user();

