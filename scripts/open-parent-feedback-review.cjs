// Local review launcher. Uses TEST credentials outside the repository, never Production.
// node scripts/open-parent-feedback-review.cjs parent|studio|report
const fs=require('fs'),cp=require('child_process'),assert=require('node:assert/strict')
const {createClient}=require('@supabase/supabase-js')
const mode=process.argv[2]||'parent';assert(['parent','studio','report'].includes(mode))
const root=mode==='report'?'/tmp/parent-feedback-report':'/tmp/parent-feedback-v1',m=JSON.parse(fs.readFileSync(`${root}/fixtures.json`))
const env=Object.fromEntries(cp.execFileSync('npx',['supabase','status','-o','env'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).split('\n').filter(s=>s.includes('=')).map(s=>{const i=s.indexOf('=');return[s.slice(0,i),s.slice(i+1).replace(/^"|"$/g,'')]}))
assert(['localhost','127.0.0.1'].includes(new URL(env.API_URL).hostname))
;(async()=>{
 const account=m.accounts.find(a=>a.label===(mode==='studio'?'studio':'parent1'))
 const client=createClient(env.API_URL,env.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
 const {data,error}=await client.auth.signInWithPassword({email:account.email,password:m.password});if(error)throw Error('local TEST login failed')
 const statePath=`${root}/${mode}-review-state.json`
 fs.writeFileSync(statePath,JSON.stringify({cookies:[{name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(data.session)).toString('base64url'),domain:'localhost',path:'/',expires:-1,httpOnly:false,secure:false,sameSite:'Lax'}],origins:[]}),{mode:0o600})
 const session=`feedback-${mode==='report'?'parent':mode}-visual`
 const cli=(...args)=>cp.execFileSync('npx',['--yes','agent-browser','--session',session,...args],{stdio:'inherit'})
 try { cli('close') } catch {}
 cli('--headed','open','about:blank')
 cli('state','load',statePath)
 const path=mode==='report'?`/record/${m.applications.review}/report`:mode==='parent'?`/record/${m.applications.unsubmitted}`:`/studio/applications/${m.applications.chipAndNote}`
 cli('open','http://localhost:3000'+path)
 cli('set','viewport',mode==='studio'?'1440':'390',mode==='studio'?'1000':'844')
 console.log(`LOCAL ${mode} review ready: http://localhost:3000${path}`)
})().catch(e=>{console.error(e.message);process.exitCode=1})
