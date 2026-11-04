// Up → down on isolated PGlite: every function the migration touched is byte-identical to its pre-migration
// definition (pg_get_functiondef + ACL), the added functions are gone, and the OTP/application guards still work.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite');
const { createParentPhoneSchema, read } = require('./lib/parent-phone-fixture.cjs');
const FUNCS = ['app.apple_parent_phone_required(uuid)', 'app.parent_phone_status(uuid)', 'public.verify_parent_phone_challenge(uuid,uuid,uuid,text)',
  'public.get_my_parent_phone_challenge()', 'app.guard_parent_phone_profile()', 'app.guard_parent_phone_application_insert()'];
(async () => {
  const db = new PGlite();
  await createParentPhoneSchema(db);
  const snap = async () => {
    const out = {};
    for (const f of FUNCS) out[f] = (await db.query(`select pg_get_functiondef($1::regprocedure) d, (select proacl::text from pg_proc where oid=$1::regprocedure) acl`, [f])).rows[0];
    out.added = (await db.query("select count(*)::int n from pg_proc where proname in ('enroll_oauth_parent_phone','oauth_parent_phone_eligible')")).rows[0].n;
    out.triggers = (await db.query("select tgname from pg_trigger where not tgisinternal order by 1")).rows.map(r => r.tgname);
    return out;
  };
  const before = await snap();
  await db.exec(read('20261030120000_oauth_parent_phone_enrollment.sql'));
  const during = await snap();
  assert.equal(during.added, 2); assert.notEqual(during['app.parent_phone_status(uuid)'].d, before['app.parent_phone_status(uuid)'].d);
  await db.exec(fs.readFileSync('supabase/rollback/20261030120000_oauth_parent_phone_enrollment.down.sql', 'utf8'));
  const after = await snap();
  assert.deepEqual(after, before);
  console.log('PASS up → down restores all 6 function definitions and ACLs exactly; added functions removed; triggers unchanged');
  await db.close();
})().catch(e => { console.error('FAIL', e); process.exitCode = 1; });
