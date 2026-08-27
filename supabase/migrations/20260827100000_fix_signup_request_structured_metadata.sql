-- Phase 3B-2: 최초 가입 시 structured location 이 유실되던 문제 수정.
--
-- 가입 폼과 studio-sign-up.ts 는 Kakao Postcode 결과를 auth metadata 로 이미 전부 보내고 있는데,
-- 이 트리거가 12개 컬럼만 insert 해서 postal_code / address_line1 / address_line2 /
-- sido / sigungu / bname / sigungu_code / bcode 와 사업자·연락처 정보가 전부 버려지고 있었다.
-- 그래서 teacher_signup_requests 8행 전부 sido 가 NULL 이고, 승인 후 organizations 도
-- 행정지역 없이 만들어졌다.
--
-- academy_area 는 더 이상 metadata 로 오지 않으므로 읽지도, 화이트리스트 검사하지도,
-- insert 컬럼 목록에 넣지도 않는다. 컬럼은 아직 NOT NULL DEFAULT '후곡학원가' 이므로
-- DB default 가 그대로 적용된다. 컬럼 / constraint / default 자체는 Phase 3C-2 에서 다룬다.
--
-- signature / RETURNS trigger / SECURITY DEFINER / search_path 는 그대로 두어
-- auth.users 의 기존 AFTER INSERT 트리거 연결이 유지된다.
--
-- 모든 값은 nullif(meta->>'key', '') 로 읽는다. 키가 없으면 ->> 가 NULL 을 돌려주고
-- 빈 문자열이면 nullif 가 NULL 로 만들므로, 대상 컬럼이 전부 nullable 인 현 schema 와 맞는다.
-- 별도의 검증 로직은 추가하지 않는다.

create or replace function public.create_teacher_signup_request_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
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

  teacher_name := coalesce(
    nullif(meta->>'teacher_name', ''),
    nullif(meta->>'name', ''),
    '학원 관리자'
  );
  organization_name := coalesce(nullif(meta->>'organization_name', ''), '미입력');

  insert into public.teacher_signup_requests (
    user_id,
    signup_email,
    status,
    teacher_name,
    teacher_phone,
    organization_name,
    branch_name,
    organization_phone,
    -- legacy 호환: address / address_detail 은 admin 승인 화면과 approve 함수가 아직 읽는다.
    -- 앱이 address = address_line1, address_detail = address_line2 로 이미 채워 보낸다.
    address,
    address_detail,
    postal_code,
    address_line1,
    address_line2,
    sido,
    sigungu,
    bname,
    sigungu_code,
    bcode,
    representative_name,
    business_registration_number,
    academy_phone,
    contact_phone,
    request_note
  ) values (
    new.id,
    new.email,
    'pending',
    teacher_name,
    nullif(meta->>'teacher_phone', ''),
    organization_name,
    nullif(meta->>'branch_name', ''),
    nullif(meta->>'organization_phone', ''),
    nullif(meta->>'address', ''),
    nullif(meta->>'address_detail', ''),
    nullif(meta->>'postal_code', ''),
    nullif(meta->>'address_line1', ''),
    nullif(meta->>'address_line2', ''),
    nullif(meta->>'sido', ''),
    nullif(meta->>'sigungu', ''),
    nullif(meta->>'bname', ''),
    nullif(meta->>'sigungu_code', ''),
    nullif(meta->>'bcode', ''),
    nullif(meta->>'representative_name', ''),
    nullif(meta->>'business_registration_number', ''),
    nullif(meta->>'academy_phone', ''),
    nullif(meta->>'contact_phone', ''),
    nullif(meta->>'request_note', '')
  );

  return new;
end;
$$;
