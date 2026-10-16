// Test helper: loads the real public class projection against an in-memory fake client.
// fail(selectFields) returns a PostgREST-style error for a classes query, or null for success. No network, no DB.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
function loadVm(root,fail){
  const rows=[
    {id:'c1',organization_id:'o1',title:'무료',subject:'math',subject_category_id:null,subject_id:null,target_age:'초3',description:'',trial_price:0,teacher_id:null,cover_image_url:null,is_active:true,program_type:'trial_class',assignment_mode:'post_assign',class_format:'1:1',recommended_for:null,experience_points:null,curriculum:null,regular_price_type:null,regular_price_amount:null,regular_price_note:null,trial_price_confirmed_at:'2026-10-16T00:00:00Z'},
    {id:'c2',organization_id:'o1',title:'미확인',subject:'math',subject_category_id:null,subject_id:null,target_age:'초3',description:'',trial_price:0,teacher_id:null,cover_image_url:null,is_active:true,program_type:'trial_class',assignment_mode:'post_assign',class_format:null,recommended_for:null,experience_points:null,curriculum:null,regular_price_type:null,regular_price_amount:null,regular_price_note:null,trial_price_confirmed_at:null}];
  const pick=(row,fields)=>{const keys=fields.split(',').map(f=>f.trim().split(':').pop().split('(')[0].trim()).filter(Boolean);const out={};for(const k of keys)if(k in row)out[k]=row[k];return out};
  const client={storage:{from(){return{getPublicUrl:p=>({data:{publicUrl:'https://x/'+p}})}}},from(table){
    const call={fields:'',id:null,single:false};
    const result=()=>{
      if(table!=='classes')return {data:[{id:'o1',name:'학원',branch_name:null,sido:'서울',sigungu:'노원구',bname:'중계동',address:'',address_detail:null}],error:null};
      const error=fail(call.fields);if(error)return {data:null,error};
      const data=rows.filter(r=>!call.id||r.id===call.id).map(r=>pick(r,call.fields));
      return {data:call.single?data[0]??null:data,error:null}};
    const q={select(f){call.fields=f;return q},eq(k,v){if(k==='id')call.id=v;return q},is(){return q},in(){return q},order(){return q},limit(){return q},range(){return q},ilike(){return q},or(){return q},
      maybeSingle(){call.single=true;return Promise.resolve(result())},then(ok,bad){return Promise.resolve(result()).then(ok,bad)}};
    return q}};
  const mocks={'@/integrations/supabase/service-role':{getSupabaseServiceRoleClient:()=>client},
    '@/features/subjects/queries/get-subject-master':{loadSubjectMasterMapsByIdsWithClient:async()=>({categoryById:new Map(),subjectById:new Map()}),getSelectableSubjectCatalog:async()=>[]}};
  const cache=new Map();
  const load=file=>{if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {exports,console,process,URL,URLSearchParams,require(name){if(name==='server-only')return {};if(name in mocks)return mocks[name];
        if(name.startsWith('@/')){const base='src/'+name.slice(2);for(const ext of ['.ts','.tsx','/index.ts'])if(fs.existsSync(path.join(root,base+ext)))return load(base+ext)}
        return require(name)}});
    return exports};
  return load('src/features/classes/queries/public-class-safe-projection.ts');
}
module.exports={loadVm};
