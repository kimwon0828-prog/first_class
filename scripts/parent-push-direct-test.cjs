// Operator-only, one iOS installation. Defaults to preflight; never used by a route/cron.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function payload(token, id) {
  if (!/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(token) || !UUID.test(id)) throw Error('invalid_test_target');
  return { to: token, title: '첫수업 알림 테스트', body: '알림이 정상적으로 연결되었어요.', sound: 'default',
    data: { type: 'test', path: '/notifications', notificationId: `test:${id}` } };
}
async function run(args = process.argv.slice(2), request = fetch) {
  const value = name => args[args.indexOf(name) + 1];
  const device = args.includes('--device') && value('--device');
  const parent = args.includes('--parent') && value('--parent');
  if (!UUID.test(device) || !UUID.test(parent)) throw Error('explicit_device_and_parent_UUIDs_required');
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw Error('SUPABASE_ACCESS_TOKEN_required');
  const query = `select d.expo_push_token from public.parent_push_devices d
    join public.profiles p on p.id=d.parent_id and p.role='parent'
    join auth.sessions s on s.id=d.session_id and s.user_id=d.parent_id
    where d.id='${device}' and d.parent_id='${parent}' and d.platform='ios'
      and d.enabled and d.permission_status='granted'
      and exists(select 1 from public.parent_push_settings where registration_enabled)
      and not exists(select 1 from app.parent_account_deletions where parent_id=d.parent_id)`;
  const preflight = await request('https://api.supabase.com/v1/projects/vfkfpekfwrjjocltqbty/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000), body: JSON.stringify({ query: `begin read only; ${query}; commit;`, read_only: true })
  });
  if (!preflight.ok) throw Error(`preflight_http_${preflight.status}`);
  const rows = await preflight.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw Error('exactly_one_active_owned_iOS_device_required');
  const message = payload(rows[0].expo_push_token, randomUUID());
  if (!args.includes('--send')) return { mode: 'preflight', eligibleDevices: 1, path: message.data.path, sent: false };
  const journal = args.includes('--journal') && value('--journal');
  if (!journal) throw Error('exclusive_journal_path_required');
  // Reserve before contacting Expo. Reusing this path fails even after a timeout.
  // Inspect an uncertain result manually; never retry automatically.
  const record = { notificationId: message.data.notificationId, attemptedAt: new Date().toISOString(), outcome: 'unknown' };
  fs.writeFileSync(journal, JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 });
  try {
    const response = await request('https://exp.host/--/api/v2/push/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      signal: AbortSignal.timeout(10000), body: JSON.stringify([message])
    });
    record.httpStatus = response.status;
    if (response.ok) {
      const result = await response.json(), ticket = result.data?.[0];
      if (Array.isArray(result.data) && result.data.length === 1 && ticket?.status === 'ok' && typeof ticket.id === 'string') {
        record.outcome = 'accepted'; record.ticketId = ticket.id;
      } else if (Array.isArray(result.data) && result.data.length === 1 && ticket?.status === 'error') record.outcome = 'rejected';
    } else if (response.status < 500) record.outcome = 'rejected';
  } catch { /* Ambiguous send is retained as unknown, without retry. */ }
  fs.writeFileSync(journal, JSON.stringify(record, null, 2), { mode: 0o600 });
  return { ...record, delivered: 'unverified', automaticRetry: false };
}
module.exports = { payload, run };
if (require.main === module) run().then(result => console.log(JSON.stringify(result))).catch(error => {
  // Never print transport bodies, credentials, Expo tokens, or a raw exception.
  const message = String(error.message);
  console.error(/^[A-Za-z0-9_]+$/.test(message) ? message : 'direct_test_failed'); process.exitCode = 1;
});
