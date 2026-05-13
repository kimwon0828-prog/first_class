insert into organizations (id, name, branch_name)
values
  ('11111111-1111-1111-1111-111111111111', '첫수업 학원', '강남점')
on conflict (id) do nothing;

insert into profiles (id, role, name, phone, organization_id)
select
  au.id,
  'parent',
  '테스트 학부모',
  '010-0000-0001',
  null
from auth.users au
where au.email = 'parent@example.com'
on conflict (id) do nothing;

insert into profiles (id, role, name, phone, organization_id)
select
  au.id,
  'teacher',
  '테스트 선생님',
  '010-0000-0003',
  '11111111-1111-1111-1111-111111111111'
from auth.users au
where au.email = 'teacher@example.com'
on conflict (id) do nothing;

insert into teachers (id, profile_id, organization_id, intro, specialty, career_years)
select
  '22222222-2222-2222-2222-222222222221',
  p.id,
  '11111111-1111-1111-1111-111111111111',
  '아이들 눈높이에 맞춘 체험 수업을 진행합니다.',
  '초등 창의수업',
  5
from profiles p
where p.role = 'teacher'
  and p.name = '테스트 선생님'
on conflict (id) do nothing;

insert into classes (
  id,
  organization_id,
  teacher_id,
  title,
  subject,
  target_age,
  region,
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
    '강남',
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
    '강남',
    '안전한 키트로 실험 기반 체험을 제공합니다.',
    10000,
    true
  )
on conflict (id) do nothing;

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
select
  '44444444-4444-4444-4444-444444444441',
  p.id,
  '33333333-3333-3333-3333-333333333331',
  '22222222-2222-2222-2222-222222222221',
  '김민준',
  '초2',
  now() + interval '2 day',
  null,
  '오전 시간 선호',
  'new'
from profiles p
where p.role = 'parent'
  and p.name = '테스트 학부모'
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
select
  '66666666-6666-6666-6666-666666666661',
  '44444444-4444-4444-4444-444444444441',
  null,
  'new',
  p.id,
  '초기 신청 생성'
from profiles p
where p.role = 'parent'
  and p.name = '테스트 학부모'
on conflict (id) do nothing;
