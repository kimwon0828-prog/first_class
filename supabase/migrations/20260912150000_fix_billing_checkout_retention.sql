-- 최초 결제와 그 결제를 만든 checkout 세션의 연결을 지운 채로 남기지 않는다.
--
-- 지금 계약은 서로 모순이라 실행 자체가 불가능하다.
--
--   FK    organization_payments.checkout_session_id → billing_checkout_sessions(id)
--         ON DELETE SET NULL
--   CHECK attempt_kind = 'initial' ⇒ checkout_session_id IS NOT NULL
--
-- 세션을 지우면 FK 가 컬럼을 NULL 로 만들고 그 즉시 CHECK 가 터진다. 결과.
--   - checkout 세션을 어떤 방법으로도 삭제할 수 없다(정리 배치·보관기간 정리 실패)
--   - organizations 삭제가 세션으로 cascade 되면서 조직 삭제 자체가 실패한다
--
-- CHECK 를 없애는 방향은 택하지 않는다. "이 결제가 어느 checkout 에서 나왔는가" 는
-- 결제 감사(audit)의 핵심 연결이고, 그걸 잃으면 대사에서 최초 결제의 출처를 못 찾는다.
--
-- 대신 FK 를 SET NULL 이 아니라 NO ACTION DEFERRABLE INITIALLY DEFERRED 로 바꾼다.
-- organization_payments 와 billing_checkout_sessions 는 둘 다 organizations 에
-- ON DELETE CASCADE 로 매달려 있어, 조직 삭제 시 같은 transaction 에서 함께 사라진다.
-- 검사를 커밋 시점으로 미루면 두 경우가 각각 원하는 대로 갈린다.
--
--   세션만 삭제 + 참조하는 결제 존재  → 커밋 시 FK 위반으로 거절 (연결 보존)
--   조직 삭제로 둘 다 삭제           → 커밋 시 참조가 남지 않아 통과
--
-- 컬럼을 NULL 로 만들지 않으므로 CHECK 와 더 이상 충돌하지 않는다.

alter table public.organization_payments
  drop constraint if exists organization_payments_checkout_session_id_fkey;

alter table public.organization_payments
  add constraint organization_payments_checkout_session_id_fkey
  foreign key (checkout_session_id)
  references public.billing_checkout_sessions(id)
  on delete no action
  deferrable initially deferred;

comment on constraint organization_payments_checkout_session_id_fkey on public.organization_payments is
  '최초 결제 ↔ checkout 세션 연결. 세션 단독 삭제는 막고, 조직 삭제 cascade 는 통과시킨다.';
