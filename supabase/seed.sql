-- 로컬 dev fixture 전용 seed. `supabase db reset` 이 수동 개입 없이 끝까지 통과해야 한다.
-- Remote/production 에는 적용하지 않는다.
--
-- 로그인 fixture 계정 (로컬 전용):
--   parent@example.com  / password123
--   teacher@example.com / password123

-- 1. auth fixture
-- profiles.id 는 auth.users(id) 를 참조하므로 seed 가 auth user 를 직접 만들어야 한다.
-- raw_user_meta_data 를 비워 두면 create_teacher_signup_request_from_auth_user 트리거가
-- signup_intent 검사에서 바로 return 하므로 teacher_signup_requests 가 생기지 않는다.
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'authenticated',
    'authenticated',
    'parent@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{}'::jsonb,
    '',
    '',
    '',
    ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'authenticated',
    'authenticated',
    'teacher@example.com',
    extensions.crypt('password123', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{}'::jsonb,
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

-- 이메일/비밀번호 로그인은 auth.identities 행이 있어야 성립한다.
insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "email": "parent@example.com", "email_verified": true, "phone_verified": false}'::jsonb,
    'email',
    now(),
    now()
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    '{"sub": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "email": "teacher@example.com", "email_verified": true, "phone_verified": false}'::jsonb,
    'email',
    now(),
    now()
  )
on conflict (provider, provider_id) do nothing;

-- 2. organization
insert into organizations (id, name, branch_name)
values
  ('11111111-1111-1111-1111-111111111111', '첫수업 학원', '강남점')
on conflict (id) do nothing;

-- 3. profiles
-- auth fixture 가 고정 UUID 라서 email 로 되짚지 않고 그대로 참조한다.
-- profiles_role_org_check: parent 는 organization_id 가 null, academy 는 not null 이어야 한다.
insert into profiles (id, role, name, phone, organization_id)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    'parent',
    '테스트 학부모',
    '010-0000-0001',
    null
  ),
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
    'academy',
    '테스트 선생님',
    '010-0000-0003',
    '11111111-1111-1111-1111-111111111111'
  )
on conflict (id) do nothing;

-- 4. teacher
-- display_name 은 NOT NULL 이고 default 가 없다.
-- profile_id 는 NULL 이다. 로그인 계정(profiles)과 강사 명부(teachers)는 별개 개념이고,
-- 강사 셀프 로그인 기능이 없는 현재는 연결하지 않는 것이 정상 명부 형태다.
insert into teachers (
  id,
  profile_id,
  organization_id,
  display_name,
  intro,
  specialty,
  career_years
)
values
  (
    '22222222-2222-2222-2222-222222222221',
    null,
    '11111111-1111-1111-1111-111111111111',
    '테스트 선생님',
    '아이들 눈높이에 맞춘 체험 수업을 진행합니다.',
    '초등 창의수업',
    5
  )
on conflict (id) do nothing;

-- 5. classes
insert into classes (
  id,
  organization_id,
  teacher_id,
  title,
  subject,
  target_age,
  description,
  trial_price,
  is_active
)
values
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    '초등 저학년 창의 미술 체험',
    '미술',
    '7-9',
    '기초 드로잉과 색채 표현을 체험합니다.',
    0,
    true
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    '기초 과학 실험 체험',
    '과학',
    '9-11',
    '안전한 키트로 실험 기반 체험을 제공합니다.',
    10000,
    true
  )
on conflict (id) do nothing;

-- 6. application
insert into trial_applications (
  id,
  parent_id,
  class_id,
  assigned_teacher_id,
  child_name,
  child_grade,
  requested_slot_at,
  confirmed_slot_at,
  memo,
  status
)
values
  (
    '44444444-4444-4444-4444-444444444441',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '33333333-3333-3333-3333-333333333331',
    '22222222-2222-2222-2222-222222222221',
    '김민준',
    '초2',
    now() + interval '2 day',
    null,
    '오전 시간 선호',
    'new'
  )
on conflict (id) do nothing;

insert into schedule_blocks (
  id,
  teacher_id,
  type,
  start_at,
  end_at,
  related_application_id
)
values
  (
    '55555555-5555-5555-5555-555555555551',
    '22222222-2222-2222-2222-222222222221',
    'available',
    now() + interval '1 day',
    now() + interval '1 day 1 hour',
    null
  ),
  (
    '55555555-5555-5555-5555-555555555552',
    '22222222-2222-2222-2222-222222222221',
    'blocked',
    now() + interval '3 day',
    now() + interval '3 day 1 hour',
    null
  )
on conflict (id) do nothing;

insert into application_logs (
  id,
  application_id,
  from_status,
  to_status,
  actor_id,
  note
)
values
  (
    '66666666-6666-6666-6666-666666666661',
    '44444444-4444-4444-4444-444444444441',
    null,
    'new',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
    '초기 신청 생성'
  )
on conflict (id) do nothing;
