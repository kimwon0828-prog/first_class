// Starts localhost against LOCAL Supabase without changing any .env file.
const cp=require('node:child_process'),assert=require('node:assert/strict')
const config=JSON.parse(cp.execFileSync('supabase',['status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert(['127.0.0.1','localhost'].includes(new URL(config.API_URL).hostname))
const env={...process.env,NEXT_PUBLIC_DATA_SOURCE:'supabase',NEXT_PUBLIC_SUPABASE_URL:config.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:config.ANON_KEY,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:config.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:config.SERVICE_ROLE_KEY,PARENT_ACCOUNT_DELETION_ENABLED:'1',NEXT_PUBLIC_SITE_URL:'http://localhost:3000',NEXT_PUBLIC_PARENT_URL:'http://localhost:3000',NEXT_PUBLIC_STUDIO_URL:'http://localhost:3000',SMS_SEND_ENABLED:'false',ALIMTALK_SEND_ENABLED:'false'}
const child=cp.spawn('npm',['run','dev'],{env,stdio:'inherit'})
child.on('exit',code=>process.exit(code||0))
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal))
