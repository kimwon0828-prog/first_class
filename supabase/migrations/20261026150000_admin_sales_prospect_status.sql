-- 대표 전용 영업 지도(/admin/sales-map)의 학원별 진행 상태.
-- 학원 목록은 코드(src/features/admin/sales-map/prospects.ts)에 있고, 이 표는 상태 · 메모만 담는다.
-- 서버가 관리자 확인 뒤 service role 로만 읽고 쓴다. 학원 · 학부모 세션은 읽을 수 없다.
create table public.admin_sales_prospect_status (
  prospect_id text primary key,
  state text not null check (state in ('미접촉', '연락함', '미팅', '확정', '거절')),
  memo text not null default '' check (char_length(memo) <= 500),
  visited_on date,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.admin_sales_prospect_status enable row level security;

revoke all on public.admin_sales_prospect_status from public, anon, authenticated, service_role;
grant select, insert, update on public.admin_sales_prospect_status to service_role;
