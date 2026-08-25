-- 행정지역 metadata canonical source 는 Kakao Postcode 다.
-- 주소(postal/address_line1/address_line2)와 항상 같은 write payload 로 움직인다.
-- Naver Geocoding 은 좌표(latitude/longitude/map_updated_at) 전용이며 이 컬럼들을 채우지 않는다.
--
-- 기존 row 는 전부 NULL 로 남는다. migration 에서 추측/backfill 하지 않는다.
-- academy_area / classes.region 은 이 migration 에서 변경하지 않는다.

alter table public.organizations
  add column if not exists sido text,
  add column if not exists sigungu text,
  add column if not exists bname text,
  add column if not exists sigungu_code text,
  add column if not exists bcode text;

alter table public.teacher_signup_requests
  add column if not exists sido text,
  add column if not exists sigungu text,
  add column if not exists bname text,
  add column if not exists sigungu_code text,
  add column if not exists bcode text;

alter table public.academy_update_requests
  add column if not exists requested_sido text,
  add column if not exists requested_sigungu text,
  add column if not exists requested_bname text,
  add column if not exists requested_sigungu_code text,
  add column if not exists requested_bcode text;

-- 좌측 prefix 규칙상 이 복합 index 하나가
-- (sido), (sido, sigungu), (sido, sigungu, bname) 조회를 모두 커버한다.
create index if not exists organizations_administrative_region_idx
  on public.organizations (sido, sigungu, bname);

comment on column public.organizations.sido is 'Kakao Postcode sido. Administrative region canonical source is Kakao, not Naver.';
comment on column public.organizations.bcode is 'Kakao Postcode legal dong code. Text to preserve leading zeros.';
