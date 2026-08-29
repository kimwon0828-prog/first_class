-- Phase 2A: 학원 가입 승인에서 system teacher mapping row 자동 생성을 중단한다.
--
-- 배경
--   기존 approve_teacher_signup_request 는 승인 시 teachers 에
--   profile_id = 가입자 인 row 를 함께 만들었다. 이 row 는 학원의 실제 강사가 아니라
--   requireTeacherStudioAccess 가 Studio 접근을 허용하기 위해 찾던 mapping row 였다.
--   Phase 1 에서 Studio 접근 판단이 profiles + organization 기준으로 바뀌어
--   이 mapping row 는 더 이상 필요하지 않다.
--
-- 이 migration 이 바꾸는 것
--   1. teachers INSERT 제거
--   2. approved_teacher_id 에 새 teacher id 를 쓰지 않음 (nullable 이므로 NULL 로 남는다)
--
-- 이 migration 이 바꾸지 않는 것
--   admin 권한 검사 / row 잠금 / 상태 검사 / organizations INSERT / profiles upsert /
--   status·approved_organization_id·reviewed_at 갱신 / SECURITY DEFINER / search_path /
--   argument type / return type(void) / 기존 승인 데이터 / 기존 teachers row.
--   기존 조직 7건의 system teacher row 는 그대로 두고 Phase 3 에서 별도로 다룬다.
--
-- 참고: teacher_signup_requests.approved_teacher_id 는
--   `references public.teachers(id) on delete set null` 이며 NOT NULL 제약이 없다.
--   유일한 consumer 인 admin 승인 화면은 `if (approved_teacher_id)` 로 감싸 읽으므로
--   NULL 이면 해당 분기를 건너뛴다. 이 값으로 하던 teachers.phone 동기화는
--   새 정책에서 불필요하다 — 운영 멤버 연락처는 profiles.phone 에 이미 기록된다.

create or replace function public.approve_teacher_signup_request(request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  r public.teacher_signup_requests%rowtype;
  org_id uuid;
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  ) then
    raise exception 'forbidden';
  end if;

  select *
  into r
  from public.teacher_signup_requests
  where id = request_id
  for update;

  if not found then
    raise exception 'not_found';
  end if;

  if r.status <> 'pending' then
    raise exception 'already_reviewed';
  end if;

  insert into public.organizations (name, branch_name, address, address_detail)
  values (r.organization_name, r.branch_name, r.address, r.address_detail)
  returning id into org_id;

  insert into public.profiles (id, role, name, phone, organization_id)
  values (r.user_id, 'academy', r.teacher_name, r.teacher_phone, org_id)
  on conflict (id) do update
    set role = 'academy',
        name = excluded.name,
        phone = excluded.phone,
        organization_id = excluded.organization_id,
        updated_at = now();

  -- teachers INSERT 없음. 선생님 명부는 Studio 에서 직접 등록할 때만 만들어진다
  -- (createStudioTeacher: profile_id = NULL, 학부모 공개 OFF).

  update public.teacher_signup_requests
  set status = 'approved',
      approved_organization_id = org_id,
      approved_teacher_id = null,
      reviewed_at = now(),
      updated_at = now()
  where id = request_id;
end;
$$;

-- CREATE OR REPLACE 는 기존 ACL 을 보존하지만, 권한 상태를 명시적으로 고정해 둔다.
grant execute on function public.approve_teacher_signup_request(uuid) to authenticated;
