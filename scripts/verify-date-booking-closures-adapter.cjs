// Real Supabase adapter against an isolated PostgREST instance and fixture JWTs.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),{execFileSync}=require('child_process')
const esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild'),{createClient}=require('@supabase/supabase-js')
const f=JSON.parse(fs.readFileSync(process.env.CLOSURES_DB_FIXTURE,'utf8'));assert(/^closures_test_v\d+$/.test(f.database))
const host=execFileSync('docker',['port','firstsuup-closures-rest-isolated','3000/tcp'],{encoding:'utf8'}).trim();assert(/^127\.0\.0\.1:\d+$/.test(host))
const url='http://'+host,secret='isolated_date_closures_test_secret_2026',enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
const token=(role,sub)=>{const raw=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role,sub,exp:Math.floor(Date.now()/1000)+3600});return raw+'.'+crypto.createHmac('sha256',secret).update(raw).digest('base64url')}
const make=(role,sub)=>createClient(url,token('anon'),{global:{headers:{Authorization:'Bearer '+token(role,sub)},fetch:(input,init)=>fetch(String(input).replace(url+'/rest/v1',url),init)},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
const studio=make('authenticated',f.studio),parent=make('authenticated',f.parent),service=make('service_role'),anon=make('anon')
const out=process.env.CLOSURES_QA_OUTPUT||fs.mkdtempSync('/tmp/closure-adapter-');fs.mkdirSync(out,{recursive:true})
;(async()=>{
 global.__client=parent;global.__service=service
 await esbuild.build({stdin:{contents:`export {supabaseDataAdapter,listAvailableScheduleSlotsByClassIdWithClient} from './src/shared/lib/db/supabase-adapter'`,resolveDir:process.cwd(),loader:'ts'},outfile:path.join(out,'adapter.cjs'),bundle:true,platform:'node',format:'cjs',tsconfig:'tsconfig.json',plugins:[{name:'isolated-clients',setup(b){b.onResolve({filter:/^(server-only|next\/cache|@\/integrations\/supabase\/(server|service-role))$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path==='server-only'?'':a.path==='next/cache'?'export const unstable_cache=fn=>fn;export const unstable_noStore=()=>{}':a.path.endsWith('/service-role')?'export const getSupabaseServiceRoleClient=()=>global.__service':'export const getSupabaseServerClient=async()=>global.__client',loader:'js'}))}}]})
 const {supabaseDataAdapter:adapter}=require(path.resolve(out,'adapter.cjs'))
 const targetDate=new Date(Date.parse(f.day+'T00:00:00+09:00')+6*86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'})
 const before=await adapter.listAvailableScheduleSlotsByClassId(f.a),target=before.find(s=>s.startAt.startsWith(targetDate)&&new Date(s.startAt).getUTCHours()===4)
 assert(target,'13:00 source slot missing')
 global.__client=studio;const day=await adapter.getStudioBookingDay(f.org,targetDate),selected=day.occurrences.find(o=>o.id===target.classScheduleId)
 assert(selected);const selectedKeys=[selected.key],targets=day.occurrences.filter(o=>Date.parse(o.startAt)<Date.parse(selected.endAt)&&Date.parse(o.endAt)>Date.parse(selected.startAt)).map(o=>o.key)
 const mutation={organizationId:f.org,dateKey:targetDate,classId:null,mode:'close',slotKeys:selectedKeys,expectedTargets:targets,closureIds:[],reason:'INTERNAL_REASON_SENTINEL'}
 const applied=await adapter.mutateStudioBookingClosures(mutation);assert.equal(applied.changed,1)
 global.__client=parent;const closed=await adapter.listAvailableScheduleSlotsByClassId(f.a);assert(!closed.some(s=>s.optionId===target.optionId));assert(closed.some(s=>s.startAt.startsWith(targetDate)&&new Date(s.startAt).getUTCHours()===3));assert(closed.some(s=>s.startAt.startsWith(targetDate)&&new Date(s.startAt).getUTCHours()===6))
 assert(!JSON.stringify(closed).includes('INTERNAL_REASON_SENTINEL'))
 let error='';try{await adapter.createTrialApplication({classId:f.a,parentId:f.parent,selectedScheduleOptionId:target.optionId,childName:'Adapter stale fixture',childGrade:'elem_1',parentName:'Synthetic',parentPhone:'01011112222'})}catch(e){error=e.message}
 assert.equal(error,'schedule_date_booking_closed')
 const hidden=await parent.from('date_booking_closures').select('reason');assert.equal(hidden.error,null);assert.equal(hidden.data.length,0)
 const masked=await anon.rpc('get_closed_booking_slot_indexes',{p_class_id:f.a,p_starts:[target.startAt],p_ends:[target.endAt]});assert.equal(masked.error,null);assert.deepEqual(masked.data,[1]);assert(!JSON.stringify(masked).includes('INTERNAL_REASON_SENTINEL'))
 global.__client=studio;const held=await adapter.getStudioBookingDay(f.org,targetDate);await adapter.mutateStudioBookingClosures({...mutation,mode:'release',slotKeys:[],closureIds:held.closures.filter(c=>!c.classId).map(c=>c.id)})
 global.__client=parent;const reopened=await adapter.listAvailableScheduleSlotsByClassId(f.a);assert(reopened.some(s=>s.optionId===target.optionId))
 const created=await adapter.createTrialApplication({classId:f.a,parentId:f.parent,selectedScheduleOptionId:target.optionId,childName:'Adapter reopened '+Date.now(),childGrade:'elem_1',parentName:'Synthetic',parentPhone:'01011112222'})
 const check=await service.from('trial_applications').select('id,status').eq('id',created.id);assert.equal(check.error,null);assert.equal(check.data.length,1);assert.equal(check.data[0].status,'new')
 const outsider=make('authenticated','60000000-0000-4000-8000-000000000012');global.__client=outsider;let denied=false;try{await adapter.getStudioBookingDay(f.org,targetDate)}catch{denied=true}assert(denied)
 fs.writeFileSync(path.join(out,'adapter-results.json'),JSON.stringify({passed:true,realPostgrest:true,publicReasonAbsent:true,parentRowsHidden:true,staleCreateDenied:true,reopenedCreateSaved:true,otherOrgDenied:true}));console.log('PASS actual adapter + isolated JWT/PostgREST: Parent availability mask, stale final INSERT denial, private reason absence, reopening and real safe application save, Studio organization scope')
})().catch(e=>{console.error(e.stack);process.exitCode=1})
