// Pure SQL label/domain contracts in a disposable local DB; never loads app env.
const fs=require('node:fs'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const catalog=JSON.parse(fs.readFileSync(process.env.SUBJECT_CATALOG_PATH,'utf8')),container='firstsuup-report-edit-db',db='report_catalog_'+Date.now();
const sql=s=>execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit','-i',container,'psql','-X','-qAt','-U','supabase_admin','-d',db,'-v','ON_ERROR_STOP=1'],{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const q=s=>"'"+s.replaceAll("'","''")+"'";
function definitions(file){const s=fs.readFileSync(file,'utf8');return ['label','group'].map(n=>{const start=s.indexOf('create or replace function public.experience_report_observation_'+n+'(');assert(start>=0);return s.slice(start,s.indexOf('$$;',start)+3)}).join('\n')}
const read=codes=>JSON.parse(sql(`select json_agg(json_build_object('code',code,'label',public.experience_report_observation_label(code),'group',public.experience_report_observation_group(code)) order by code) from unnest(array[${codes.map(q).join(',')}]) code`));
try{
 execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'createdb','-U','supabase_admin',db]);
 sql(definitions('supabase/migrations/20261011180000_music_report_observations.sql'));
 const codes=catalog.options.map(o=>o.value),old=codes.filter(code=>!Object.keys(catalog.groups).filter(k=>!['math','music'].includes(k)).some(k=>code.startsWith(k+'_'))),before=read(old);
 assert.equal(old.length,25);
 sql(definitions('supabase/migrations/20261011200000_report_subject_observations.sql'));
 assert.deepEqual(read(old),before,'Existing generic/math/music labels and groups unchanged');
 const actual=read(codes);assert.equal(actual.length,106);
 for(const item of actual){
  const option=catalog.options.find(o=>o.value===item.code);assert.equal(item.label,option.label);
  const group=Object.values(catalog.groups).flat().find(g=>g.options.some(o=>o.value===item.code));assert.deepEqual(item.group,group?{code:group.code,label:group.label}:null);
 }
 console.log('PASS all 106 SQL labels/groups match shared catalog; all existing 25 labels/groups byte-for-byte preserved');
}catch(e){console.error(e.stderr?.toString()||e.stack);process.exitCode=1}finally{execFileSync('docker',['exec','-e','PGPASSWORD=isolated-report-edit',container,'dropdb','-U','supabase_admin','--if-exists',db])}
