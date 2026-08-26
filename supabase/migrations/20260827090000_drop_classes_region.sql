-- Phase 3C-1: legacy 학원가 컬럼 classes.region 제거.
--
-- /classes, /academies 공개 탐색은 organizations.sido / sigungu / bname 으로 전환됐고
-- Studio 저장 경로도 더 이상 region 값을 쓰지 않는다.
-- active class 4건은 소속 organization 의 academy_area 와 100% 일치했고,
-- 불일치 4건은 모두 inactive 테스트 데이터였으므로 고유 정보가 없다.
--
-- view / function / policy / trigger / index 어디에서도 classes.region 을 참조하지 않는다.
-- CHECK 제약은 컬럼과 함께 자동으로 사라지지만, 재실행 안전성을 위해 먼저 명시적으로 지운다.
--
-- organizations.academy_area 와 teacher_signup_requests.academy_area 는 이번 범위가 아니다.
-- 두 컬럼은 아직 일부 organization 의 유일한 위치 정보이므로 backfill 이후에 다룬다.

alter table public.classes
  drop constraint if exists classes_region_academy_area_check;

alter table public.classes
  drop column if exists region;
