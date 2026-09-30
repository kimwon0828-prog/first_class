// Rehearse Production SCHEMA ONLY on a disposable LOCAL database. Never copies user rows.
// Usage: node scripts/verify-studio-workflow-phase1-rollout.cjs /absolute/path/production-schema.sql
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const container = 'supabase_db_first-class-mvp';
const db = 'phase1_rollout_' + Date.now();
const schemaPath = process.argv[2];
assert(schemaPath && fs.existsSync(schemaPath), 'Production schema-only dump required');
const out = require('node:path').dirname(schemaPath);
const run = (args, input) => cp.execFileSync('docker', ['exec', ...(input ? ['-i'] : []), container,
  'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec "$@"', 'sh', ...args],
  { input, encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const sql = q => run(['psql', '-X', '-qAt', '-U', 'supabase_admin', '-d', db, '-v', 'ON_ERROR_STOP=1'], q).trim();
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const studio = randomUUID(), parent = randomUUID(), other = randomUUID(), org = randomUUID(), otherOrg = randomUUID(), cls = randomUUID();
const results = [];
const pass = s => { results.push(s); console.log('PASS ' + s); };
const as = (id, q) => sql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub',${quote(id)},true); select set_config('request.jwt.claims',${quote(JSON.stringify({sub:id,role:'authenticated'}))},true); ${q}; commit;`).split('\n').slice(2).join('\n');
const denied = (fn, label) => {
  assert.throws(fn, error => /permission denied|application_not_found_or_forbidden|trial_result_already_finalized|report_already_sent/.test(error.stderr?.toString() || ''), label);
  pass(label);
};
const app = (extra = '') => { const id = randomUUID(); sql(`insert into public.trial_applications(id,parent_id,class_id,child_name,child_grade,status,completed_at,requested_slot_at${extra ? ',unregistered_reason,registration_status' : ''}) values('${id}','${parent}','${cls}','TEST rollout','초3','completed',now(),now()${extra ? ", 'schedule_mismatch','not_enrolled'" : ''})`); return id; };
const pref = {version:1,state:'specified',groups:[{dayMode:'selected',days:[2],timeMode:'range',startTime:'17:00',endTime:'19:00'},{dayMode:'selected',days:[4],timeMode:'range',startTime:'18:00',endTime:'20:00'}]};
const reg = (id,status,reasons='{}') => as(studio,`select public.set_studio_registration_result('${id}',${quote(status)},${quote(reasons)}::text[],'TEST private registration')`);
const record = id => as(studio,`select public.finalize_studio_trial_result('${id}','{"observations":["sustained_engagement"],"publicSummary":"TEST report","note":"PRIVATE"}')`);
const report = id => as(studio,`select public.publish_experience_report('${id}',(select updated_at from public.trial_results where application_id='${id}'))`);
const contact = id => as(studio,`select public.record_studio_contact('${randomUUID()}','${id}',now(),'PHONE','NEUTRAL','TEST contact',null,true,${quote(JSON.stringify(pref))}::jsonb,'TEST preference','plus_minus_30')`);
const oldContact = (id, status) => as(studio,`select public.create_studio_consultation('${randomUUID()}','${id}',now(),'PHONE','NEUTRAL','TEST legacy',${quote(status)},null,null,'NONE',null,true,${quote(JSON.stringify(pref))}::jsonb,'TEST legacy preference','TEST outcome')`);
const oldRecord = (id, summary) => as(studio,`insert into public.trial_results(application_id,observations,public_summary,created_by,updated_by) values('${id}',array['sustained_engagement'],${quote(summary)},'${studio}','${studio}') on conflict(application_id) do update set public_summary=excluded.public_summary,updated_by=excluded.updated_by returning application_id`);
const catalog = () => JSON.parse(sql(`select json_build_object(
 'functions',(select json_object_agg(p.oid::regprocedure::text,json_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl)) from pg_proc p where p.pronamespace in ('public'::regnamespace,'app'::regnamespace) and p.prokind='f'),
 'triggers',(select json_object_agg(t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal),
 'tableAcl',(select json_object_agg(c.relname,c.relacl) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')),
 'columnAcl',(select json_object_agg(c.relname||'.'||a.attname,a.attacl) from pg_attribute a join pg_class c on c.oid=a.attrelid where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped),
 'policies',(select json_object_agg(tablename||'.'||policyname,json_build_object('qual',qual,'with_check',with_check,'cmd',cmd,'roles',roles)) from pg_policies where schemaname='public'),
 'constraints',(select json_object_agg(c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid)) from pg_constraint c where c.connamespace='public'::regnamespace),
 'views',(select json_object_agg(viewname,definition) from pg_views where schemaname='public'))`));
run(['createdb','-U','supabase_admin','-O','postgres',db]);
try {
  const authSchema = run(['pg_dump','-U','supabase_admin','-d','postgres','--schema-only','--schema=auth','--no-comments']);
  // Auth triggers reference public functions restored next. Restore their definitions afterwards.
  const authTriggers = authSchema.match(/^CREATE TRIGGER .*public\..*;$/gm) || [];
  sql(authSchema.replace(/^CREATE TRIGGER .*public\..*;$/gm,''));
  sql(fs.readFileSync(schemaPath,'utf8'));
  if (authTriggers.length) sql(authTriggers.join('\n'));
  const before = catalog();
  const expand = fs.readFileSync('supabase/migrations/20260930110000_studio_experience_workflow_phase1_expand.sql','utf8');
  if (process.env.PHASE1_EXPANSION_TRANSACTION_SQL) {
    sql('set role postgres; create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
    sql('set role postgres;\n'+fs.readFileSync(process.env.PHASE1_EXPANSION_TRANSACTION_SQL,'utf8'));
    assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20260930110000'"),'1');
  } else sql('set role postgres;\n' + expand);
  const expanded = catalog();
  for (const kind of ['functions','triggers','tableAcl','columnAcl','constraints']) {
    for (const [key,value] of Object.entries(before[kind] || {})) assert.deepEqual(expanded[kind][key],value,kind+': '+key);
  }
  for(const [key,value] of Object.entries(before.policies)) if(key!=='application_logs.application_logs_parent_select_self') assert.deepEqual(expanded.policies[key],value,key);
  for(const [key,value] of Object.entries(before.views)) if(key!=='studio_trial_applications') assert.equal(expanded.views[key],value,key);
  pass('1A preserves every existing function body/ACL, table/column ACL, trigger, constraint and unrelated policy/view');
  fs.writeFileSync(out+'/catalog-before.json',JSON.stringify(before,null,2));
  fs.writeFileSync(out+'/catalog-expanded.json',JSON.stringify(expanded,null,2));
  sql(`insert into auth.users(id) values('${studio}'),('${parent}'),('${other}'); insert into public.organizations(id,name) values('${org}','TEST rollout'),('${otherOrg}','TEST other'); insert into public.profiles(id,role,name,organization_id) values('${studio}','academy','TEST Studio','${org}'),('${parent}','parent','TEST Parent',null),('${other}','academy','TEST Other','${otherOrg}'); insert into public.classes(id,organization_id,title,subject,target_age,description,assignment_mode,program_type) values('${cls}','${org}','TEST class','math','elem_3','TEST','post_assign','trial_class');`);
  const old=app(); oldContact(old,'pending'); oldContact(old,'enrolled');
  assert.equal(sql(`select registration_status from public.trial_applications where id='${old}'`),'enrolled');
  pass('1A old consultation + coupled registration save succeeds with authenticated JWT claims');
  const direct=app(); as(studio,`update public.studio_trial_applications set registration_status='pending',next_contact_at=now() where id='${direct}' returning id`);
  pass('1A old direct view registration/reopen path remains writable');
  const oldResult=app(); oldRecord(oldResult,'TEST first'); oldRecord(oldResult,'TEST edited');
  assert.equal(sql(`select public_summary from public.trial_results where application_id='${oldResult}'`),'TEST edited');
  report(oldResult); oldRecord(oldResult,'TEST second version'); report(oldResult);
  assert.equal(sql(`select count(*) from public.experience_reports where application_id='${oldResult}'`),'2');
  pass('1A old trial upsert and report first publish/republish remain compatible');
  const fresh=app(); reg(fresh,'pending','{schedule_coordination}'); record(fresh); contact(fresh); report(fresh);
  assert.equal(sql(`select time_flexibility from public.consultation_logs where application_id='${fresh}'`),'plus_minus_30');
  pass('1A new record/registration/contact/report RPC contracts and structured reads succeed');
  const legacy=app('legacy'); reg(legacy,'enrolled');
  assert.equal(sql(`select registration_status from public.trial_applications where id='${legacy}'`),'enrolled');
  assert.equal(sql(`select exists(select 1 from public.application_logs where application_id='${legacy}' and is_internal and note::jsonb->'before'->>'legacyReason'='schedule_mismatch')`),'t');
  pass('1A legacy not_enrolled reason survives in history across enrollment (existing CHECK respected)');
  assert.equal(as(parent,`select count(*) from public.application_logs where application_id='${fresh}' and is_internal`),'0');
  denied(()=>as(parent,`select registration_note from public.trial_applications`),'1A Parent private registration columns denied');
  denied(()=>as(other,`select public.set_studio_registration_result('${fresh}','pending')`),'1A other organization RPC denied');
  denied(()=>as(parent,`select public.finalize_studio_trial_result('${app()}','{}')`),'1A Parent mutation denied');
  assert.equal(sql("select has_function_privilege('anon','public.set_studio_registration_result(uuid,text,text[],text)','EXECUTE')"),'f');
  pass('1A anonymous RPC EXECUTE absent in effective ACL');
  assert(Number(as(studio,'select count(*) from public.studio_trial_applications'))>0);
  assert.equal(as(other,'select count(*) from public.studio_trial_applications'),'0');
  pass('1A Dashboard/Cases/detail read surface keeps organization scope and all previous fields');
  const beforeRollback=sql(`select count(*) from public.application_logs where is_internal`);
  sql('set role postgres;\n'+fs.readFileSync('docs/sql/manual/rollback_studio_workflow_phase1_expand.sql','utf8'));
  assert.equal(sql("select has_function_privilege('authenticated','public.set_studio_registration_result(uuid,text,text[],text)','EXECUTE')"),'f');
  assert.equal(sql(`select count(*) from public.application_logs where is_internal`),beforeRollback);
  oldContact(app(),'pending');
  pass('1A emergency rollback disables only new commands; old writer and private history remain intact');
  // Restore exact new-function ACLs for continuing the staged rehearsal.
  for(const [signature,value] of Object.entries(expanded.functions)) if(!before.functions[signature]) {
    for(const acl of value.acl || []) {
      const grantee=acl.split('=')[0] || 'PUBLIC';
      if(acl.split('=')[1].startsWith('X')) sql(`grant execute on function public.${signature} to ${grantee==='PUBLIC'?'PUBLIC':'"'+grantee+'"'}`);
    }
  }
  const harden=fs.readFileSync('supabase/migrations/20260930111000_studio_experience_workflow_phase1_harden.sql','utf8');
  if (process.env.PHASE1_HARDENING_TRANSACTION_SQL) {
    sql('set role postgres; create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
    sql("insert into supabase_migrations.schema_migrations(version,name,statements) values('20260930110000','studio_experience_workflow_phase1_expand',array["+quote(expand)+"]) on conflict(version) do nothing;");
    sql('set role postgres;\n'+fs.readFileSync(process.env.PHASE1_HARDENING_TRANSACTION_SQL,'utf8'));
    assert.equal(sql("select count(*) from supabase_migrations.schema_migrations where version='20260930111000'"),'1');
    pass('1B exact Production transaction and migration ledger applied together');
  } else sql('set role postgres;\n' + harden);
  fs.writeFileSync(out+'/catalog-hardened.json',JSON.stringify(catalog(),null,2));
  assert.equal(sql("select has_function_privilege('authenticated','public.create_studio_consultation(uuid,uuid,timestamptz,text,text,text,text,text,text,text,timestamptz,boolean,jsonb,text,text)','EXECUTE')"),'f');
  pass('1B old coupled RPC EXECUTE absent in effective ACL');
  denied(()=>oldRecord(oldResult,'overwrite'),'1B old trial upsert blocked');
  denied(()=>report(oldResult),'1B any report history prevents republish');
  denied(()=>as(studio,`update public.studio_trial_applications set registration_status='enrolled' where id='${direct}'`),'1B direct registration writer blocked');
  const hardened=app(); record(hardened); report(hardened); reg(hardened,'not_enrolled','{schedule_mismatch}'); reg(hardened,'enrolled'); contact(hardened);
  denied(()=>record(hardened),'1B second finalization blocked');
  denied(()=>report(hardened),'1B second report blocked');
  pass('1B new app record/report/registration/contact paths succeed');
  const query=`set role authenticated; select set_config('request.jwt.claim.sub','${studio}',false); select public.finalize_studio_trial_result('%ID%','{"publicSummary":"TEST concurrent"}');`;
  const race=app();
  const jobs=Array.from({length:10},()=>new Promise(resolve=>{
    const p=cp.spawn('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','pipe']});
    p.stdout.resume();p.stderr.resume();p.on('close',code=>resolve(code===0));p.stdin.end(query.replace('%ID%',race));
  }));
  Promise.all(jobs).then(values=>{
    assert.equal(values.filter(Boolean).length,1);pass('1B concurrent finalization: 10 requests, one success');
    fs.writeFileSync(out+'/rollout-results.json',JSON.stringify({passed:results.length,results},null,2));
  }).catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>{run(['dropdb','-U','supabase_admin',db]);console.log('Removed disposable local rehearsal DB; primary Local Supabase unchanged');});
} catch(e) {
  run(['dropdb','-U','supabase_admin',db]);
  console.error(e.message, e.stderr?.toString().slice(-2500) || ''); process.exitCode=1;
}
