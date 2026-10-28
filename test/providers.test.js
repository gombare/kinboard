import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/config.js';
import { fetchTasks, completeTask } from '../src/sources/tasks.js';
import { fetchHaCalendar } from '../src/sources/homeassistant.js';

function stub(handler) {
  const calls = [], real = globalThis.fetch;
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), opts }); return handler(String(url), opts); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

test('todoist: lists with filter and closes tasks', async () => {
  const s = stub(url => new Response(url.includes('/close') ? null : JSON.stringify({ results: [{ id: '7', content: 'Milk', description: '', due: { date: '2026-10-28' } }], next_cursor: null }), { status: url.includes('/close') ? 204 : 200 }));
  try {
    const cfg = normalize({ tasks: { provider: 'todoist', token: 'tok', filter: '#Home' } });
    assert.deepEqual(await fetchTasks(cfg), [{ id: '7', title: 'Milk', notes: '', due: '2026-10-28' }]);
    assert.match(s.calls[0].url, /tasks\/filter\?query=%23Home/);
    assert.equal(s.calls[0].opts.headers.authorization, 'Bearer tok');
    await completeTask(cfg, '7');
    assert.match(s.calls[1].url, /tasks\/7\/close$/);
  } finally { s.restore(); }
});

test('home assistant: todo items and calendar events', async () => {
  const s = stub((url, opts) => {
    if (url.includes('get_items')) return new Response(JSON.stringify({ service_response: { 'todo.shopping': { items: [{ uid: 'u1', summary: 'Bread', status: 'needs_action' }] } } }));
    if (url.includes('update_item')) return new Response('[]');
    if (url.includes('/api/calendars/')) return new Response(JSON.stringify([{ summary: 'Bins', start: { date: '2026-10-29' }, end: { date: '2026-10-30' } }, { summary: 'Vet', start: { dateTime: '2026-10-28T17:00:00+01:00' }, end: { dateTime: '2026-10-28T18:00:00+01:00' } }]));
    return new Response('nope', { status: 404 });
  });
  try {
    const cfg = normalize({ timezone: 'Europe/Rome', homeassistant: { url: 'http://ha.local:8123/', token: 't' }, tasks: { provider: 'homeassistant', entity: 'todo.shopping' } });
    assert.deepEqual(await fetchTasks(cfg), [{ id: 'u1', title: 'Bread', notes: '', due: '' }]);
    await completeTask(cfg, 'u1');
    assert.deepEqual(JSON.parse(s.calls[1].opts.body), { entity_id: 'todo.shopping', item: 'u1', status: 'completed' });
    const ev = await fetchHaCalendar(cfg, { label: 'HA', homeassistant: 'calendar.family' }, { from: 0, to: Date.parse('2026-11-30'), tz: 'Europe/Rome' });
    assert.deepEqual(ev.map(e => `${e.date} ${e.time || 'all-day'} ${e.calendar} ${e.title}`), ['2026-10-29 all-day HA Bins', '2026-10-28 17:00 HA Vet']);
  } finally { s.restore(); }
});

test('config drops providers that are not fully configured', () => {
  const cfg = normalize({ tasks: { provider: 'todoist' }, weather: { enabled: false } });
  assert.equal(cfg.tasks, null);
  assert.deepEqual(cfg.panel.views, ['home']);
  assert.ok(!cfg.screen.sections.includes('weather'));
});
