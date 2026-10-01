// Rehearsal ONLY: restore a schema-only Production snapshot to a NEW local database.
// No remote connection here, no Production data copied, no legacy local history repaired.
const cp=require('node:child_process'),fs=require('node:fs'),assert=require('node:assert/strict')
const root='/tmp/lifecycle-compat-rehearsal',container='supabase_db_first-class-mvp'
const database='lifecycle_compat_rehearsal_'+Date.now()
const schemaPath=process.env.LIFECYCLE_PRODUCTION_SCHEMA||root+'/production-schema.sql'
const exec=(args,input)=>cp.execFileSync('docker',['exec',...(input?['-i']:[]),container,'sh','-c','PGPASSWORD="$POSTGRES_PASSWORD" PGOPTIONS="-c session_preload_libraries=" exec "$@"','sh',...args],{input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']})
const sql=q=>exec(['psql','-X','-qAt','-U','supabase_admin','-d',database,'-v','ON_ERROR_STOP=1'],q)
const compat='supabase/migrations/20261001130000_class_lifecycle_v1_compat.sql',hardening='supabase/migrations/20261001131000_class_lifecycle_v1_hardening.sql'
fs.mkdirSync(root,{recursive:true})
let created=false
try {
 exec(['createdb','-U','supabase_admin','--template=template0',database]);created=true
 const schema=fs.readFileSync(schemaPath,'utf8');assert(!schema.match(/CREATE TABLE IF NOT EXISTS "public"\."classes"[\s\S]*?\n\);/)[0].includes('"archived_at"'),'classes snapshot must predate lifecycle')
 sql(schema)
 fs.writeFileSync(root+'/database.json',JSON.stringify({database,container,schemaPath,compat,hardening},null,2))
 console.log('PASS empty local database restored from Production schema only: '+database)
 const catalog=()=>JSON.parse(sql(`select jsonb_build_object(
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(pg_get_functiondef(p.oid),p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('app','public') and p.prokind='f'),
 'triggers',(select jsonb_object_agg(t.tgrelid::regclass::text||'.'||t.tgname,pg_get_triggerdef(t.oid)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal),
 'policies',(select jsonb_object_agg(tablename||'.'||policyname,to_jsonb(p)) from pg_policies p where schemaname='public'),
 'grants',(select jsonb_agg(to_jsonb(g) order by table_name,grantee,privilege_type) from information_schema.role_table_grants g where table_schema='public'));`))
 const before=catalog();fs.writeFileSync(root+'/baseline-catalog.json',JSON.stringify(before,null,2))
 const contract=fs.readFileSync('scripts/verify-class-lifecycle-compat.sql','utf8')
 const runPhase=phase=>{const output=sql(`select set_config('app.rehearsal_phase','${phase}',false);`+contract);fs.writeFileSync(root+'/'+phase+'-contract.log',output);return output.trim().split('\n').findLast(line=>line.startsWith('[['))}
 const baseline=runPhase('baseline');assert(baseline);console.log('PASS baseline private fixed_period generates 7 exact occurrences')
 const apply=path=>{sql(fs.readFileSync(path,'utf8'));const name=path.split('/').pop().replace('.sql','');sql(`create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);insert into supabase_migrations.schema_migrations values('${name.slice(0,14)}','${name.slice(15)}',array['${fs.readFileSync(path,'utf8').replaceAll("'","''")}']);`)}

 sql(`insert into public.organizations(id,name) values('42000000-0000-4000-8000-000000000001','Local UI fixture');
 insert into auth.users(id,email) values('42000000-0000-4000-8000-000000000010','local-ui@example.invalid');
 insert into public.profiles(id,role,name,organization_id) values('42000000-0000-4000-8000-000000000010','academy','Local UI','42000000-0000-4000-8000-000000000001') on conflict(id) do update set role=excluded.role,organization_id=excluded.organization_id;
 insert into public.classes(id,organization_id,title,subject,target_age,description,is_active,assignment_mode) values
 ('42000000-0000-4000-8000-000000000101','42000000-0000-4000-8000-000000000001','호환 검증 · 운영 중','piano','elem_3','Local fixture',true,'post_assign'),
 ('42000000-0000-4000-8000-000000000102','42000000-0000-4000-8000-000000000001','호환 검증 · 비공개','piano','elem_3','Local fixture',false,'post_assign'),
 ('42000000-0000-4000-8000-000000000103','42000000-0000-4000-8000-000000000001','호환 검증 · 종료 이력','piano','elem_3','Local fixture',true,'post_assign');
 insert into public.trial_applications(class_id,child_name,child_grade,requested_slot_at,status) values('42000000-0000-4000-8000-000000000103','Local child','elem_3',now()-interval '1 day','completed');`)
 const rowsBefore=sql('select jsonb_agg(to_jsonb(c) order by id) from public.classes c;')
 apply(compat)
 assert.equal(sql("select jsonb_agg(to_jsonb(c)-'archived_at' order by id) from public.classes c;"),rowsBefore)
 assert.equal(sql('select count(*) from public.classes where archived_at is not null;').trim(),'0')
 const after=catalog()
 for(const category of ['functions','triggers','policies'])for(const [name,definition] of Object.entries(before[category]))assert.deepEqual(after[category][name],definition,category+': '+name)
 assert.deepEqual(after.grants,before.grants)
 assert.equal(runPhase('compat'),baseline)
 console.log('PASS COMPAT: old function definitions/ACLs, triggers, RLS and table grants identical')
 console.log('PASS COMPAT A–D: legacy direct cleanup, private fixed_period unchanged, archived_at query, new lifecycle eligibility/delete/archive/restore RPCs')
 const identity="select set_config('request.jwt.claim.sub','42000000-0000-4000-8000-000000000010',false);set role authenticated;"
 sql(identity+"select public.mutate_studio_class_lifecycle('42000000-0000-4000-8000-000000000103','archive');")
 const adapterSource=fs.readFileSync('src/shared/lib/db/supabase-adapter.ts','utf8')
 const fields=adapterSource.match(/const LEGACY_STUDIO_CLASS_LIST_SELECT_FIELDS =\s*"([^"]+)"/)[1]+', assignment_mode, subject_category_id, subject_id'
 const rows=JSON.parse(sql(identity+`select jsonb_agg(to_jsonb(c) order by id) from (select ${fields} from public.classes where organization_id='42000000-0000-4000-8000-000000000001')c;`).trim().split('\n').at(-1))
 const eligibility=JSON.parse(sql(identity+'select jsonb_agg(to_jsonb(e)) from public.get_studio_class_delete_eligibility()e;').trim().split('\n').at(-1))
 assert.equal(rows.length,3);assert.equal(eligibility.length,3)
 fs.writeFileSync(root+'/compat-ui-data.json',JSON.stringify(rows.map(c=>({id:c.id,title:c.title,programType:c.program_type,assignmentMode:c.assignment_mode,subject:c.subject,targetAge:c.target_age,trialPrice:c.trial_price,teacherId:c.teacher_id,teacherDisplayName:c.teacher_display_name,teacherName:null,coverImageUrl:c.cover_image_url,isActive:c.is_active,archivedAt:c.archived_at,canPermanentlyDelete:eligibility.find(e=>e.class_id===c.id).can_permanently_delete,scheduleSummary:{kind:'none',primary:'일정 없음',secondary:null},operatingRuleState:{status:'loaded',rule:null}})),null,2))
 console.log('PASS COMPAT E query: actual adapter column projection + authenticated eligibility RPC; existing rows unchanged and archived_at initially NULL')
 fs.writeFileSync(root+'/compat-schema.sql',exec(['pg_dump','-U','supabase_admin','-d',database,'--schema-only','--no-owner','--no-comments']))
 apply(hardening)
 assert.equal(runPhase('hardening'),baseline)
 console.log('PASS HARDENING F–I: raw delete blocked, safe RPC delete, archived rolling/fixed/manual generation blocked, nonarchived private fixed_period identical')
 const rolling=sql(fs.readFileSync('scripts/verify-rolling-schedules.sql','utf8'));fs.writeFileSync(root+'/rolling-regression.log',rolling)
 console.log('PASS existing Rolling SQL A–N plus authenticated permissions after HARDENING')
 fs.writeFileSync(root+'/results.json',JSON.stringify({database,baselineOccurrences:JSON.parse(baseline),compatOldCatalogUnchanged:true,compatContracts:true,hardeningContracts:true,rollingRegression:true,history:sql('select version from supabase_migrations.schema_migrations order by version;').trim().split('\n')},null,2))

} catch(e){fs.writeFileSync(root+'/restore-error.log',String(e.stderr||e));console.error(String(e.stderr||e));console.error(e.message);if(created)exec(['dropdb','-U','supabase_admin',database]);process.exitCode=1}
