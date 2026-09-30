-- Emergency command shutdown for Phase 1A ONLY. Not automatically applied.
-- First stop the new localhost/app writer. The currently deployed old app is unchanged.
-- Keep all added columns, saved values, internal-event RLS, and schema migration history.
-- No business rows or historical reason values are deleted or rewritten.
begin;
set local lock_timeout = '5s';
revoke execute on function public.finalize_studio_trial_result(uuid,jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.set_studio_registration_result(uuid,text,text[],text) from public,anon,authenticated,service_role;
revoke execute on function public.record_studio_contact(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean,jsonb,text,text) from public,anon,authenticated,service_role;
revoke execute on function public.workflow_studio_application(uuid) from public,anon,authenticated,service_role;
revoke execute on function public.validate_contact_preference(jsonb) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
-- Old create_studio_consultation/publish_experience_report definitions, grants, trial_results
-- DML privileges and studio_trial_applications UPDATE privileges remain their original values.
-- Do not restore the old Parent log policy: it would expose newly saved private events.
-- Do not DROP columns/view or delete the migration ledger to simulate rollback.
