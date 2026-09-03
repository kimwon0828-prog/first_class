-- consultation_logs 의 희망 일정 스냅샷 컬럼에 UPDATE 권한을 준다.
--
-- 배경: authenticated 는 consultation_logs 에 table-level UPDATE 가 없다.
--   20260818103000_enable_consultation_log_updates.sql 이
--   `grant update (channel, note, next_contact_at)` 처럼 컬럼 단위로만 부여했다.
--   (sentiment 는 이후 migration 에서 같은 방식으로 추가되었다.)
--
--   그래서 20260903120000 에서 추가한 스냅샷 컬럼들은 UPDATE 권한을 상속받지 못한다.
--   "최신 상담을 수정하면 스냅샷도 함께 바뀐다"는 계약이 권한 부족으로 실패한다.
--
-- 여기서는 그 두 컬럼만 연다. table-level UPDATE 로 넓히지 않는다 —
-- id / application_id / created_by / occurred_at 처럼 바뀌면 안 되는 컬럼이
-- 함께 열리기 때문이다. RLS 정책은 건드리지 않는다.

grant update (
  regular_schedule_preference_snapshot,
  regular_schedule_preference_note_snapshot
) on public.consultation_logs to authenticated;
