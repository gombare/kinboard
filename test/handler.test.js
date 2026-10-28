import test from 'node:test';
import assert from 'node:assert/strict';

process.env.KINBOARD_TOKEN = 'secret';
process.env.KINBOARD_CONFIG = JSON.stringify({ demo: true, timezone: 'Europe/Rome', language: 'it' });
const { handle } = await import('../src/handler.js');

test('rejects a wrong token and serves data and PNG with the right one', async () => {
  const bad = await handle({ path: '/api/data', query: new URLSearchParams('token=nope') });
  assert.equal(bad.status, 403);
  const ok = await handle({ path: '/api/data', query: new URLSearchParams('token=secret') });
  const body = JSON.parse(ok.body);
  assert.equal(ok.status, 200);
  assert.ok(body.events.length > 0);
  assert.equal(body.ui.strings.today, 'Oggi');
  const png = await handle({ path: '/api/screen', query: new URLSearchParams('t=secret&battery=10') });
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal(png.body.subarray(1, 4).toString(), 'PNG');
});
