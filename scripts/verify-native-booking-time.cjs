// Offline checks: booking end time (same rule as app.booking_application_end) and academy class card enrichment.
const fs=require('fs'),assert=require('node:assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
function load(file,dependencies){const m={exports:{}};const code=ts.transpileModule(fs.readFileSync(root+'/'+file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(!(name in dependencies))throw Error('unmocked '+name);return dependencies[name]},m,m.exports);return m.exports}
const {resolveBookingTime,loadBookingTimes}=load('src/features/native/server/booking-time.ts',{});
const app=(over={})=>({id:'a',class_id:'c',class_schedule_id:null,requested_schedule_block_id:null,confirmed_schedule_block_id:null,requested_slot_at:'2026-10-16T06:00:00.000Z',confirmed_slot_at:null,...over});
const schedule=(start_time,end_time,class_id='c')=>({id:'s',class_id,start_time,end_time});
const none={slot_end_at:null,duration_minutes:null};
(async()=>{
 // Class schedule length applied to the booked start (15:00 KST + 50m).
 assert.deepEqual(resolveBookingTime(app(),schedule('15:00:00','15:50:00')),{slot_end_at:'2026-10-16T06:50:00.000Z',duration_minutes:50});
 // A confirmed time wins over the requested one, as in the DB rule.
 assert.deepEqual(resolveBookingTime(app({confirmed_slot_at:'2026-10-17T01:30:00.000Z'}),schedule('15:00','16:00')),{slot_end_at:'2026-10-17T02:30:00.000Z',duration_minutes:60});
 // Overnight schedule (23:00-01:00 KST) ends on the next Seoul day.
 assert.deepEqual(resolveBookingTime(app({requested_slot_at:'2026-10-16T14:00:00.000Z'}),schedule('23:00','01:00')),{slot_end_at:'2026-10-16T16:00:00.000Z',duration_minutes:120});
 // Schedule of another class is ignored; the matching block is used instead.
 const block={id:'b',start_at:'2026-10-16T06:00:00+00:00',end_at:'2026-10-16T06:40:00+00:00'};
 assert.deepEqual(resolveBookingTime(app({requested_schedule_block_id:'b'}),schedule('15:00','16:00','other'),block),{slot_end_at:'2026-10-16T06:40:00.000Z',duration_minutes:40});
 // A block for a different start is not stretched onto a moved booking.
 assert.deepEqual(resolveBookingTime(app({confirmed_slot_at:'2026-10-16T08:00:00.000Z'}),null,block),none);
 // No source, invalid start, zero or day-long length: no guessed duration.
 assert.deepEqual(resolveBookingTime(app()),none);
 assert.deepEqual(resolveBookingTime(app({requested_slot_at:'not-a-date'}),schedule('15:00','16:00')),none);
 assert.deepEqual(resolveBookingTime(app(),schedule('15:00','15:00')),none);
 assert.deepEqual(resolveBookingTime(app(),schedule('xx','16:00')),none);
 // Loader reads only the given ids and the referenced schedule/block rows; read errors throw (caller keeps other fields).
 const calls=[];const rows={trial_applications:[app({id:'a',class_schedule_id:'s'}),app({id:'b2',requested_schedule_block_id:'b'})],class_schedules:[schedule('15:00','15:50')],schedule_blocks:[block]};
 const client=(fail)=>({from(table){const q={select(fields){calls.push([table,fields]);return q},in(key,ids){calls.push([table,key,ids]);return Promise.resolve(fail===table?{data:null,error:{message:'x'}}:{data:rows[table],error:null})}};return q}});
 const times=await loadBookingTimes(client(),['a','b2']);
 assert.deepEqual(times,{a:{slot_end_at:'2026-10-16T06:50:00.000Z',duration_minutes:50},b2:{slot_end_at:'2026-10-16T06:40:00.000Z',duration_minutes:40}});
 assert.deepEqual(calls.filter(c=>c[1]==='id').map(c=>[c[0],c[2]]),[['trial_applications',['a','b2']],['class_schedules',['s']],['schedule_blocks',['b']]]);
 assert.deepEqual(await loadBookingTimes(client(),[]),{});
 await assert.rejects(loadBookingTimes(client('class_schedules'),['a']));

 // Academy page: existing card fields stay; one batched class read adds price/image/format/confirmation; cards get only the slots they show.
 const now=Date.now(),at=(days,h=0)=>new Date(now+days*864e5+h*36e5).toISOString(),slot=(id,days,extra={})=>({optionId:id,startAt:at(days),endAt:at(days,1),isClosed:false,remainingCount:1,label:'x',hidden:false,...extra});
 const rowsById={paid:{id:'paid',program_type:'trial_class',trial_price:15000,cover_image_url:'https://x/p.jpg',class_format:'1:1'},free:{id:'free',program_type:'level_test',trial_price:0,cover_image_url:null,class_format:null},unconfirmed:{id:'unconfirmed',program_type:'trial_class',trial_price:0,cover_image_url:null,class_format:null},later:{id:'later',program_type:'trial_class',trial_price:5000,cover_image_url:null,class_format:null},broken:{id:'broken',program_type:'trial_class',trial_price:1000,cover_image_url:null,class_format:null}};
 const confirmedAt={paid:'2026-10-16T00:00:00Z',free:'2026-10-16T00:00:00Z'};
 const slotRows={paid:[slot('o1',2),slot('o2',3),slot('soon',0.5),slot('full',4,{remainingCount:0}),slot('closed',4,{isClosed:true}),slot('h',2,{hidden:true}),slot('far',20)],free:[slot('c1',3,{isClosed:true})],unconfirmed:[],later:[slot('l1',12),slot('l2',15)]};
 const card=id=>({id,title:id,subjectLabel:'수학',targetAgeLabel:'초3',programTypeLabel:'체험수업',periodLabel:'상시 운영',periodTone:'ongoing',scheduleLabel:'월 15:00-15:50'});
 const queries=[];let migrated=true;
 const serviceRole={from(table){const q={table,fields:'',ids:[]};queries.push(q);const self={select(f){q.fields=f;return self},in(k,ids){q.ids=ids;return self},eq(){return self},is(){return self},then(r){const withConfirmation=q.fields.includes('trial_price_confirmed_at');if(withConfirmation&&!migrated)return Promise.resolve({data:null,error:{code:'42703',message:'column classes.trial_price_confirmed_at does not exist'}}).then(r);const data=q.ids.filter(id=>rowsById[id]).map(id=>withConfirmation?{...rowsById[id],trial_price_confirmed_at:confirmedAt[id]??null}:rowsById[id]);return Promise.resolve({data,error:null}).then(r)}};return self}};
 const stub={
  '@/features/academies/queries/get-public-academy-page':{getPublicAcademyPageByHandle:async()=>({organizationId:'org',slug:'s',name:'학원',branchName:null,address:null,phone:null,regionLabel:null,logoImageUrl:null,coverImageUrl:null,shortDescription:null,description:null,operatingHours:null,parkingInfo:null,directions:null})},
  '@/features/academies/queries/get-public-academy-classes':{getPublicAcademyClasses:async()=>['paid','free','unconfirmed','later','gone','broken'].map(card)},
  '@/features/classes/queries/get-public-classes':{getAllPublicClasses:async()=>({data:[],error:null})},
  '@/features/feedback/queries/get-public-feedback':{getPublicAcademyFeedback:async()=>({chips:[]}),getPublicClassFeedback:async()=>({chips:[]})},
  '@/features/feedback/lib/experience-feedback':{feedbackChipLabel:id=>id},
  '@/shared/lib/regular-price':{formatRegularPrice:()=>null},
  '@/features/applications/queries/get-public-class-available-slots':{getPublicClassAvailableSlots:async id=>id==='broken'?{data:[],error:'slots_offline'}:{data:slotRows[id]??[],error:null}},
  '@/features/applications/lib/public-class-slots':{isHiddenPublicSlot:s=>s.hidden===true},
  '@/shared/constants/education-taxonomy':{LEARNER_GRADES:[]},
  '@/features/classes/queries/resolve-class-discovery-context':{resolveClassDiscoveryContext:async()=>({})},
  '@/features/classes/queries/get-home-academies':{getHomeAcademies:async()=>({data:[]})},
  '@/features/classes/queries/get-public-class-detail':{getPublicClassDetail:async()=>{throw Error('academy cards must not call the per-class detail query')}},
  '@/features/academies/queries/get-academies-for-list':{getAcademiesForList:async()=>[]},
  '@/features/location/lib/parent-launch-region':{PARENT_LAUNCH_REGION:{}},
  '@/shared/lib/subject-master':{formatClassSubjectDisplayLabel:()=>''},
  '@/shared/constants/grade-options':{formatStoredTargetGrades:v=>v,isChildEligibleForClass:()=>true},
  '@/shared/lib/db/adapter':{},
  '@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>serviceRole},
  '@/features/native/server/academy-cards':load('src/features/native/server/academy-cards.ts',{'@/shared/lib/db/trial-price-confirmation':load('src/shared/lib/db/trial-price-confirmation.ts',{})})
 };
 // Card slots are read for all classes at once; the fixture answers per class exactly as the single read did.
 stub['@/features/native/server/catalog-slots']=load('src/features/native/server/catalog-slots.ts',{
  '@/features/applications/lib/public-class-slots':stub['@/features/applications/lib/public-class-slots'],
  '@/features/applications/queries/get-public-class-available-slots':{getPublicClassesAvailableSlots:async ids=>new Map(await Promise.all(ids.map(async id=>[id,await stub['@/features/applications/queries/get-public-class-available-slots'].getPublicClassAvailableSlots(id)])))},
  '@/features/native/server/academy-cards':stub['@/features/native/server/academy-cards']});
 const {GET}=load('app/api/native/catalog/[...path]/route.ts',stub);
 const fetchAcademy=async()=>(await GET(new Request('http://localhost/api/native/catalog/academies/s'),{params:Promise.resolve({path:['academies','s']})})).json();
 const body=await fetchAcademy();
 const byId=Object.fromEntries(body.classes.map(c=>[c.id,c]));
 for(const item of body.classes) for(const key of Object.keys(card('x'))) assert.ok(key in item,'kept '+key);
 assert.equal(queries.filter(q=>q.table==='classes').length,1,'one batched read (detail + confirmation) for all classes');
 assert.deepEqual(byId.paid.trialPrice,15000);assert.equal(byId.paid.trialPriceConfirmed,true);assert.equal(byId.paid.coverImageUrl,'https://x/p.jpg');assert.equal(byId.paid.classFormat,'1:1');
 // Card slots: bookable (same rule as the app and the class detail) within the week window only; hidden/full/closed/<24h/far dropped.
 assert.deepEqual(byId.paid.slots.map(s=>s.optionId),['o1','o2']);assert.deepEqual(Object.keys(byId.paid.slots[0]).sort(),['endAt','isClosed','optionId','remainingCount','startAt']);
 assert.deepEqual(byId.later.slots.map(s=>s.optionId),['l1'],'no slot this week → only the next bookable one');
 assert.deepEqual(byId.free.slots,[],'closed-only class → no bookable card slot');assert.equal(byId.free.trialPrice,0);assert.equal(byId.free.trialPriceConfirmed,true);
 assert.equal(byId.unconfirmed.trialPrice,0);assert.equal(byId.unconfirmed.trialPriceConfirmed,false);assert.deepEqual(byId.unconfirmed.slots,[]);
 // Not publicly visible: no price invented (null, not 0) and no slots.
 assert.equal(byId.gone.trialPrice,null);assert.deepEqual(byId.gone.slots,[]);assert.equal(byId.gone.slotsError,null);
 assert.equal(byId.broken.slotsError,'slots_offline');
 // Pre-migration DB: confirmation column missing → retried without it; confirmation null (apps keep the existing display).
 migrated=false;queries.length=0;const legacy=Object.fromEntries((await fetchAcademy()).classes.map(c=>[c.id,c]));
 assert.equal(queries.filter(q=>q.table==='classes').length,2);assert.equal(legacy.unconfirmed.trialPrice,0);assert.equal(legacy.unconfirmed.trialPriceConfirmed,null);assert.equal(legacy.paid.classFormat,'1:1');assert.deepEqual(legacy.paid.slots.map(s=>s.optionId),['o1','o2']);
 const cards=stub['@/features/native/server/academy-cards'];
 assert.deepEqual(cards.cardSlots([slot('a',1.5),slot('b',7.5),slot('c',9)],now).map(s=>s.optionId),['a','b']);
 assert.deepEqual(cards.cardSlots([slot('c',9),slot('d',10)],now).map(s=>s.optionId),['c']);
 assert.deepEqual(cards.cardSlots([],now),[]);
 console.log('PASS native booking time (schedule length, overnight, moved booking, block match, no guessed length) and academy class cards (fields kept, batched detail read, price null≠0, confirmation, card-only bookable slots, errors surfaced)');
})().catch(error=>{console.error('FAIL',error);process.exit(1)});
