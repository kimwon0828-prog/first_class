// Isolated test container ONLY. Exercises fresh feature apply, reapply, rollback,
// and reapply-after-rollback inside one transaction; restores all starting state.
const fs=require('fs'),cp=require('child_process')
const container=process.env.FEEDBACK_TEST_CONTAINER||'firstclass-rolling-feedback-v1-test'
if(!/^firstclass-rolling-[a-z0-9-]+-test$/.test(container))throw Error('isolated test container required')
const hardening=fs.readFileSync('supabase/migrations/20260929090000_harden_parent_application_insert.sql','utf8')
const feature=fs.readFileSync('supabase/migrations/20260929091000_parent_experience_feedback.sql','utf8')
const final=fs.readFileSync('supabase/migrations/20260929092000_finalize_parent_experience_submission.sql','utf8')
const reportFlow=fs.readFileSync("supabase/migrations/20260929093000_parent_report_feedback_flow.sql","utf8")
const reportRollback=fs.readFileSync("docs/sql/manual/rollback_parent_report_feedback_flow.sql","utf8").replace(/^begin;|^commit;/gm,"")
const safeRollback=fs.readFileSync('docs/sql/manual/rollback_parent_experience_final_submission.sql','utf8').replace(/^begin;|^commit;/gm,'')
const rollback=fs.readFileSync('docs/sql/manual/rollback_parent_experience_feedback.sql','utf8').replace(/^begin;|^commit;/gm,'')
const sql=`begin;
create temp table feedback_baseline as select id,to_jsonb(a) as snapshot from public.trial_applications a;
create temp table decision_baseline as select id,to_jsonb(d) as snapshot from public.parent_decisions d;
${rollback}
${hardening}
${feature}
${final}
${reportFlow}
${hardening}
${feature}
${final}
${reportFlow}
do $$ begin
 assert not has_function_privilege('authenticated','public.save_parent_experience_feedback(uuid,text[],text)','EXECUTE'),'old feedback path revoked';
 assert not has_function_privilege('authenticated','public.set_parent_decision(uuid,text)','EXECUTE'),'old decision path revoked';
 assert has_function_privilege('authenticated','public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text)','EXECUTE'),'new command available';
 assert has_function_privilege('service_role','app.valid_experience_feedback_chips(text[],text)','EXECUTE'),'service CHECK helper';
end $$;
${reportRollback}
do $$ begin
 assert to_regprocedure('public.mark_parent_report_viewed(uuid)') is null,'view mutation suspended';
 assert to_regprocedure('public.create_parent_feedback_reminders()') is null,'reminder job suspended';
 assert to_regclass('public.parent_report_engagement') is not null,'engagement data retained';
end $$;
${reportFlow}
${safeRollback}
do $$ begin
 assert to_regprocedure('public.submit_parent_experience(uuid,text[],text,text,text,text[],time,time,text)') is null,'safe rollback removes command';
 assert not has_function_privilege('authenticated','public.set_parent_decision(uuid,text)','EXECUTE'),'rollback stays fail closed';
end $$;
${final}
${reportFlow}
${rollback}
do $$ begin
 assert to_regclass('public.experience_feedback') is null,'feedback rollback';
 assert not has_column_privilege('authenticated','public.trial_applications','completed_at','INSERT'),'keep security boundary';
 assert not exists(select 1 from decision_baseline b full join public.parent_decisions d using(id) where b.snapshot is distinct from to_jsonb(d)), 'all existing decisions/history unchanged';
 assert not exists(select 1 from feedback_baseline b full join public.trial_applications a using(id) where b.snapshot is distinct from to_jsonb(a)), 'application rows unchanged';
end $$;
${feature}
${final}
${reportFlow}
rollback;`
const r=cp.spawnSync('docker',['exec','-e',`PGPASSWORD=${process.env.FEEDBACK_TEST_PASSWORD||'isolated-rolling-test'}`,'-i',container,'psql','-X','-q','-U','supabase_admin','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'})
if(r.status!==0){process.stderr.write(r.stderr);process.exitCode=1}else console.log('PASS clean feature apply, reapply, rollback keeps security/old data, reapply after rollback; all test changes rolled back')
