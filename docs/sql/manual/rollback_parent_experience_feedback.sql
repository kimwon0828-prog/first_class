-- Prefer rollback_parent_experience_final_submission.sql for a non-destructive policy rollback.
-- This full feature removal requires an explicit data-export/removal approval.
-- Destructive FEATURE rollback: export experience_feedback first if rows must be retained.
-- Deliberately KEEP the Parent INSERT security fix; do not reopen completed-row spoofing.
-- No application/report/decision/registration rows are modified.
begin;
drop function if exists public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text);
drop function if exists public.get_public_class_feedback_summary(uuid);
drop function if exists public.get_public_academy_feedback_summary(uuid);
drop function if exists app.public_experience_feedback_summary(text,uuid);
drop function if exists public.save_parent_experience_feedback(uuid,text[],text);
drop function if exists public.get_parent_experience_feedback_context(uuid);
drop table if exists public.experience_feedback;
drop function if exists app.guard_experience_feedback_snapshot();
drop function if exists app.can_read_experience_feedback(uuid,uuid,uuid,uuid);
drop function if exists app.valid_experience_feedback_chips(text[],text);
drop function if exists app.experience_feedback_taxonomy();
drop function if exists app.normalize_experience_feedback_note(text);
notify pgrst,'reload schema';
commit;
