// Actual Classes component/CSS rendered from COMPAT-only SQL query output.
// No dev server or real-account session changes. All browser network is blocked.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict')
const esbuild=require(process.env.ESBUILD_MODULE_PATH||'esbuild'),{chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH||'playwright')
const root=process.cwd(),out='/tmp/lifecycle-compat-rehearsal',items=JSON.parse(fs.readFileSync(out+'/compat-ui-data.json'))
const stubs={
 'next/link':`import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`,
 'next/navigation':`export const usePathname=()=>'/studio/classes';export const useSearchParams=()=>new URLSearchParams();export const useRouter=()=>({refresh:()=>{}});`,
 '@/features/studio/actions/mutate-studio-class-lifecycle':`export const mutateStudioClassLifecycleAction=()=>{throw new Error('Read-only render: mutation forbidden')}`,
 '@/features/studio/actions/toggle-studio-class-active':`export const toggleStudioClassActiveAction=()=>{throw new Error('Read-only render: mutation forbidden')}`
}
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {StudioClassesManager} from '@/features/studio/ui/studio-classes-manager';const root=createRoot(document.getElementById('app'));root.render(<StudioClassesManager items={${JSON.stringify(items)}}/>);`
;(async()=>{
 await esbuild.build({stdin:{contents:entry,loader:'tsx',resolveDir:root},outfile:out+'/compat-ui.js',bundle:true,platform:'browser',jsx:'automatic',tsconfig:'tsconfig.json',loader:{'.css':'local-css'},define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'readonly-boundaries',setup(b){b.onResolve({filter:/.*/},a=>stubs[a.path]?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}))}}]})
 const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.abort())
 await page.setContent('<html lang="ko"><body><main style="padding:24px"><h1>수업 관리 — COMPAT 로컬 렌더</h1><div id="app"></div></main></body></html>')
 await page.addStyleTag({content:fs.readFileSync('app/globals.css','utf8')+fs.readFileSync(out+'/compat-ui.css','utf8')});await page.addScriptTag({content:fs.readFileSync(out+'/compat-ui.js','utf8')})
 const active=items.find(c=>c.isActive),privateClass=items.find(c=>!c.isActive&&!c.archivedAt),archived=items.find(c=>c.archivedAt)
 await page.locator('#studio-class-row-'+active.id).waitFor();assert.equal(await page.locator('#studio-class-row-'+archived.id).count(),0)
 await page.screenshot({path:out+'/compat-list.png',fullPage:true})
 await page.getByRole('button',{name:'비공개',exact:true}).click();const priv=page.locator('#studio-class-row-'+privateClass.id);await priv.getByRole('button',{name:/관리 메뉴/}).click();assert(await priv.getByRole('button',{name:'공개하기',exact:true}).count());assert(await priv.getByRole('button',{name:'수업 종료',exact:true}).count());assert(await priv.getByRole('button',{name:'영구 삭제',exact:true}).count());await page.screenshot({path:out+'/compat-private-menu.png',fullPage:true})
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'종료된 수업',exact:true}).click();const arc=page.locator('#studio-class-row-'+archived.id);await arc.getByRole('button',{name:/관리 메뉴/}).click();assert(await arc.getByRole('button',{name:'수업 복구',exact:true}).count());assert(await arc.getByRole('button',{name:'수업 복구',exact:true}).evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),'single-row restore menu must not be clipped');assert.equal(await arc.getByRole('button',{name:'공개하기',exact:true}).count(),0);assert.equal(await arc.getByRole('button',{name:'영구 삭제',exact:true}).count(),0);assert(await arc.getByText('수업 삭제 불가',{exact:false}).count());await page.screenshot({path:out+'/compat-archived-menu.png',fullPage:true})
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/ui-results.json',JSON.stringify({querySource:'COMPAT-only real SQL projection and authenticated eligibility RPC',actualComponent:true,filters:true,actionsRendered:true,eligibility:true,mutations:0,errors},null,2));console.log('PASS E: COMPAT query → actual Classes UI/CSS, filters, action menus, eligibility, no runtime errors; 0 mutation calls')
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1})
