import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/config.js';
import { dosesFor, dosesForScreen, fetchMedications, formatDescription, markDose, parseDescription } from '../src/sources/medications.js';

test('description: who, times (8:00, 20.30) and the doses taken today', () => {
  assert.deepEqual(parseDescription('Giulia | 20.30 8:00'), { who: 'Giulia', times: ['08:00', '20:30'], taken: { date: '', times: [] } });
  assert.deepEqual(parseDescription('Marco | 09:00 | prese:2026-10-29 09:00').taken, { date: '2026-10-29', times: ['09:00'] });
  assert.deepEqual(parseDescription('Anna | 08:00 | taken:2026-10-29 '), { who: 'Anna', times: ['08:00'], taken: { date: '2026-10-29', times: [] } });
  assert.deepEqual(parseDescription('').times, []);
  assert.equal(formatDescription({ who: 'Anna', times: ['08:00', '20:00'], taken: { date: '2026-10-29', times: ['08:00'] } }, 'prese'), 'Anna | 08:00 20:00 | prese:2026-10-29 08:00');
  assert.equal(formatDescription({ who: 'Anna', times: ['08:00'], taken: { date: '', times: [] } }), 'Anna | 08:00');
});

test('doses of today: sorted, taken only if ticked today, next and late', () => {
  const meds = [
    { id: 'a', name: 'Antibiotic', who: 'Anna', times: ['08:00', '20:00'], until: '2026-10-31', taken: { date: '2026-10-29', times: ['08:00'] } },
    { id: 'b', name: 'Vitamin D', who: 'Tom', times: ['09:00'], until: '', taken: { date: '2026-10-28', times: ['09:00'] } },
    { id: 'c', name: 'Old', who: 'Tom', times: ['12:00'], until: '2026-10-28', taken: { date: '', times: [] } },
  ];
  const d = dosesFor(meds, '2026-10-29', '10:00');
  assert.deepEqual(d.map(x => `${x.time} ${x.name} ${x.taken ? 'T' : ''}${x.late ? 'L' : ''}${x.next ? 'N' : ''}`), ['08:00 Antibiotic T', '09:00 Vitamin D L', '20:00 Antibiotic N']);
});

test('screen keeps open doses first when they do not all fit', () => {
  const mk = (time, taken) => ({ time, taken });
  const doses = [mk('07:00', true), mk('08:00', true), mk('12:00', false), mk('20:00', false), mk('22:00', false)];
  assert.deepEqual(dosesForScreen(doses, 4).map(d => d.time), ['07:00', '12:00', '20:00', '22:00']);
  assert.deepEqual(dosesForScreen(doses, 2).map(d => d.time), ['12:00', '20:00']);
  assert.equal(dosesForScreen(doses, 9).length, 5);
});

test('config: Home Assistant list needs the connection, fixed items do not', () => {
  assert.equal(normalize({ medications: { homeassistant: 'todo.farmaci' } }).medications, null);
  assert.deepEqual(normalize({ homeassistant: { url: 'http://ha', token: 'x' }, medications: { homeassistant: 'todo.farmaci' } }).medications, { homeassistant: 'todo.farmaci' });
  const cfg = normalize({ medications: { items: [{ who: 'Anna', name: 'Vitamin D', times: ['8:00'] }] } });
  assert.ok(cfg.screen.sections.includes('medications'));
  assert.ok(cfg.panel.views.includes('medications'));
  assert.ok(!normalize({}).panel.views.includes('medications'));
});

test('Home Assistant: reads the list and ticks a dose without losing earlier ones', async () => {
  const realFetch = globalThis.fetch, calls = [];
  let description = 'Giulia | 08:00 20:00 | prese:2026-10-29 08:00';
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push([String(url).replace('http://ha', ''), body]);
    if (String(url).includes('get_items')) return new Response(JSON.stringify({ service_response: { 'todo.farmaci': { items: [
      { uid: 'u1', summary: 'Tachipirina', description, due: '2026-11-02' },
      { uid: 'u2', summary: 'Note without times', description: 'just a note' },
    ] } } }));
    description = body.description;
    return new Response('[]');
  };
  try {
    const cfg = normalize({ language: 'it', homeassistant: { url: 'http://ha', token: 't' }, medications: { homeassistant: 'todo.farmaci' } });
    const meds = await fetchMedications(cfg);
    assert.deepEqual(meds, [{ id: 'u1', name: 'Tachipirina', until: '2026-11-02', who: 'Giulia', times: ['08:00', '20:00'], taken: { date: '2026-10-29', times: ['08:00'] } }]);
    await markDose(cfg, 'u1', '20:00', '2026-10-29');
    assert.equal(description, 'Giulia | 08:00 20:00 | prese:2026-10-29 08:00 20:00');
    await markDose(cfg, 'u1', '08:00', '2026-10-30');
    assert.equal(description, 'Giulia | 08:00 20:00 | prese:2026-10-30 08:00');
    await assert.rejects(markDose(cfg, 'u1', '13:00', '2026-10-30'), /unknown dose time/);
    assert.deepEqual(calls.at(-1)[0], '/api/services/todo/get_items?return_response');
  } finally { globalThis.fetch = realFetch; }
});
