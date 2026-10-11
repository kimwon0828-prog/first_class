// Actual Next route handlers with isolated auth/RPC/Storage boundaries. No network.
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),esbuild=require(process.env.ESBUILD_MODULE_PATH),root=process.cwd(),out=process.env.REPORT_PHOTOS_OUTPUT;
const build=async(entry,name)=>esbuild.build({entryPoints:[entry],outfile:out+'/'+name+'.cjs',bundle:true,platform:'node',packages:'external',plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/^@\/(integrations\/supabase\/(server|service-role)|features\/billing\/lib\/require-entitlement)$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path.endsWith('/server')?'export const getSupabaseServerClient=async()=>global.testDb':a.path.endsWith('service-role')?'export const getSupabaseServiceRoleClient=()=>global.testService':'export const requireStudioEntitlement=async()=>({allowed:global.allowed,message:"권한 없음"})'}))}}]});
(async()=>{
 await build('app/api/report-attachments/route.ts','upload-route');await build('app/api/report-attachments/[id]/route.ts','read-route');
 const {POST}=require(out+'/upload-route.cjs'),{GET}=require(out+'/read-route.cjs'),sharp=require(root+'/node_modules/sharp');
 const photo=await sharp({create:{width:100,height:200,channels:3,background:'#eee'}}).png().toBuffer();
 const id='85000000-0000-4000-8000-000000000999';let role='academy',user=true,readAllowed=true,uploadFails=false,reserveFails=false,finishFails=false;const calls=[];
 global.allowed=true;
 global.testDb={auth:{getUser:async()=>({data:{user:user?{id}:null}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role,organization_id:id}})})})}),rpc:async(name)=>{calls.push(name);return name==='reserve_report_attachment'?{data:reserveFails?null:{id,object_path:id+'/'+id},error:reserveFails?{message:'report_content_locked'}:null}:{data:readAllowed?{object_path:id+'/'+id,mime_type:'image/png'}:null,error:readAllowed?null:{message:'forbidden'}}}};
 global.testService={storage:{from:()=>({upload:async(_path,bytes,opts)=>{calls.push('upload');assert.equal(opts.upsert,false);assert.equal((await sharp(bytes).metadata()).format,'png');return {error:uploadFails?{}:null}},download:async()=>{calls.push('download');return {data:new Blob([photo]),error:null}}})},rpc:async(name)=>{calls.push(name);return {data:finishFails?null:{id,caption:'',width:100,height:200,mimeType:'image/png'},error:finishFails?{}:null}}};
 const request=(bytes=photo,type='image/png',origin='http://localhost:3000')=>{const f=new FormData();f.set('applicationId',id);f.set('file',new File([bytes],'photo.png',{type}));return new Request('http://localhost:3000/api/report-attachments',{method:'POST',headers:{origin},body:f})};
 assert.equal((await POST(request())).status,200);assert.deepEqual(calls.splice(0),['reserve_report_attachment','upload','finish_report_attachment']);
 for(const r of ['parent','other']){role=r;assert.equal((await POST(request())).status,403);assert.deepEqual(calls,[])}role='academy';user=false;assert.equal((await POST(request())).status,401);user=true;
 assert.equal((await POST(request(photo,'image/png','https://evil.invalid'))).status,403);assert.deepEqual(calls,[]);
 assert.equal((await POST(request(Buffer.from('fake'),'image/png'))).status,422);assert.deepEqual(calls,[]);
 assert.equal((await POST(request(Buffer.alloc(4194305),'image/png'))).status,422);assert.deepEqual(calls,[]);
 reserveFails=true;assert.equal((await POST(request())).status,409);assert.deepEqual(calls.splice(0),['reserve_report_attachment']);reserveFails=false;
 uploadFails=true;assert.equal((await POST(request())).status,422);assert.deepEqual(calls.splice(0),['reserve_report_attachment','upload','fail_report_attachment']);uploadFails=false;
 finishFails=true;assert.equal((await POST(request())).status,422);assert(calls.includes('fail_report_attachment'));calls.length=0;finishFails=false;
 const req=new Request('http://localhost:3000/api/report-attachments/'+id);
 for(const permitted of [false,true]){readAllowed=permitted;const r=await GET(req,{params:Promise.resolve({id})});assert.equal(r.status,permitted?200:404);assert.equal(r.headers.get('cache-control'),'private, no-store');if(!permitted)assert(!calls.includes('download'));calls.length=0;}
 user=false;assert.equal((await GET(req,{params:Promise.resolve({id})})).status,404);assert.equal(calls.length,0);
 console.log('PASS actual upload/read handlers: auth, role, entitlement, CSRF, real byte validation, no overwrite, fail/retry boundaries, no unauthenticated or denied download, private no-store');
})().catch(e=>{console.error(e);process.exitCode=1});
