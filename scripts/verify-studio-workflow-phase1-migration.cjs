// Rehearse the complete migration against a disposable schema clone of LOCAL DB only.
const cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict')
const container='supabase_db_first-class-mvp',db='workflow_phase1_rehearsal_'+Date.now()
const run=(args,input)=>cp.execFileSync('docker',['exec',...(input?['-i']:[]),container,'sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"','sh',...args],{input,encoding:'utf8',maxBuffer:20*1024*1024,stdio:['pipe','pipe','pipe']})
const sql=q=>run(['psql','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],q)
const migration=fs.readFileSync('supabase/migrations/20260930110000_studio_experience_workflow_phase1_expand.sql','utf8')+'\n'+fs.readFileSync('supabase/migrations/20260930111000_studio_experience_workflow_phase1_harden.sql','utf8')
run(['createdb','-U','supabase_admin',db])
try {
 const schema=run(['pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--no-comments','--no-owner','--no-privileges'])
 sql(schema)
 // Remove only Phase 1's additive schema from the empty clone. No real fixtures/data copied.
 sql(`drop trigger trial_result_final on public.trial_results;
 drop trigger experience_report_send_once on public.experience_reports;
 drop trigger contact_preference_validation on public.consultation_logs;
 drop function public.lock_final_trial_result(); drop function public.report_send_once();
 drop function public.validate_new_contact_snapshot(); drop function public.validate_contact_preference(jsonb);
 drop function public.finalize_studio_trial_result(uuid,jsonb);
 drop function public.set_studio_registration_result(uuid,text,text[],text);
 drop function public.record_studio_contact(uuid,uuid,timestamptz,text,text,text,timestamptz,boolean,jsonb,text,text);
 drop function public.workflow_studio_application(uuid);
 alter policy application_logs_parent_select_self on public.application_logs using(public.is_own_trial_application(application_id));
 alter table public.application_logs drop column is_internal;
 alter table public.consultation_logs drop column time_flexibility;
 drop view public.studio_trial_applications;
 alter table public.trial_applications drop column registration_reason_ids,drop column registration_note;
 create view public.studio_trial_applications as select ta.* from public.trial_applications ta where app.current_role()='teacher'
 and ta.class_id in(select id from public.classes where organization_id=app.current_org_id()) with check option;
 grant select,update on public.studio_trial_applications to authenticated;`)
 const r=sql(migration);assert(r.includes('COMMIT'));console.log('PASS complete migration applied atomically to disposable local schema clone')
 const guard=sql("select has_table_privilege('authenticated','public.trial_results','UPDATE') as trial_update,has_column_privilege('authenticated','public.studio_trial_applications','registration_status','UPDATE') as registration_update;")
 assert(/f\s*\|\s*f/.test(guard));console.log('PASS finalization and registration direct-write privileges closed')
} finally {run(['dropdb','-U','supabase_admin',db]);console.log('PASS disposable rehearsal database removed')}
