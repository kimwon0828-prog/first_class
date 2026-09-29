-- SAFE local/approved-operation rollback: read-only maintenance, never reopen mutable paths.
-- Keep published reports, both responses, engagement events and notification receipts.
begin;
drop function if exists public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text);
drop function if exists public.mark_parent_report_viewed(uuid);
drop function if exists public.create_parent_feedback_reminders();
notify pgrst,'reload schema';
commit;
-- Restore by reapplying 20260929093000 after its 0900/0910/0920 prerequisites.
-- Do NOT restore the 0920 RPC alone: that would remove the Published Report gate.
