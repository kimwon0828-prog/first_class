const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { run } = require('./parent-push-direct-test.cjs');
const id = '00000000-0000-4000-8000-000000000001';
const args = ['--device', id, '--parent', id];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'push-direct-fixture-'));
process.env.SUPABASE_ACCESS_TOKEN = 'inert-fixture';
let sends = 0, eligible = true, ambiguous = false;
const request = async (url, options) => {
  if (url.startsWith('https://api.supabase.com/')) {
    const body = JSON.parse(options.body); assert.equal(body.read_only, true);
    assert(body.query.includes('auth.sessions')); assert(body.query.includes('parent_account_deletions'));
    return Response.json(eligible ? [{ expo_push_token: 'ExpoPushToken[abcdefghijklmnop]' }] : []);
  }
  assert.equal(url, 'https://exp.host/--/api/v2/push/send'); sends++;
  const messages = JSON.parse(options.body); assert.equal(messages.length, 1);
  assert.equal(messages[0].data.type, 'test'); assert.equal(messages[0].data.path, '/notifications');
  if (ambiguous) throw Error('timeout');
  return Response.json({ data: [{ status: 'ok', id: 'fixture-ticket' }] });
};
(async () => {
  assert.equal((await run(args, request)).sent, false); assert.equal(sends, 0);
  eligible = false; await assert.rejects(run(args, request)); assert.equal(sends, 0); eligible = true;
  const journal = path.join(dir, 'one.json');
  assert.equal((await run([...args, '--send', '--journal', journal], request)).outcome, 'accepted');
  await assert.rejects(run([...args, '--send', '--journal', journal], request)); assert.equal(sends, 1);
  ambiguous = true;
  assert.equal((await run([...args, '--send', '--journal', path.join(dir, 'uncertain.json')], request)).outcome, 'unknown');
  assert.equal(sends, 2);
  for (const file of fs.readdirSync(dir)) assert(!fs.readFileSync(path.join(dir, file), 'utf8').includes('ExpoPushToken'));
  console.log('PASS direct test: preflight default, exact recipient, one message, duplicate journal blocked, ambiguous send not retried, no token logs');
})().catch(() => { console.error('FAIL direct test fixture'); process.exitCode = 1; });
