// Operator-only, no scheduler/route. Default is a read-only preview of SPECIFIC IDs.
// After separate deletion approval: --execute. Never scan/delete an entire bucket.
const { createClient } = require('@supabase/supabase-js');
const ids=(process.argv.find(a=>a.startsWith('--ids='))?.slice(6)||'').split(',').filter(Boolean);
if(!ids.length||ids.length>50||ids.some(id=>!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Provide 1–50 explicit --ids=uuid,...');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!key)throw Error('Use the existing approved server environment; credentials are never printed');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
(async()=>{
 console.log('Target:',new URL(url).host,'IDs:',ids.length,'Mode:',process.argv.includes('--execute')?'execute':'preview');
 if(!process.argv.includes('--execute')){
  const {data,error}=await db.from('report_attachment_files').select('id,state,touched_at,application_id').in('id',ids);
  if(error)throw error;console.log(JSON.stringify(data));console.log('Eligibility is rechecked atomically by the claim RPC during execution. Saved and all published/withdrawn references are excluded.');return;
 }
 const {data:claimed,error}=await db.rpc('claim_report_attachment_cleanup',{p_ids:ids});if(error)throw error;
 for(const file of claimed){
  const {error:removed}=await db.storage.from('report-attachments').remove([file.object_path]);
  if(removed)throw Error('Storage deletion failed; deleting claim retained for safe retry: '+file.id);
  const {error:finished}=await db.rpc('finish_report_attachment_cleanup',{p_id:file.id});if(finished)throw finished;
  console.log('Deleted orphan:',file.id);
 }
})().catch(e=>{console.error(e.message);process.exitCode=1});
