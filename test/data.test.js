import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/config.js';
import { getData, menuFor, wasteFor, resetCache } from '../src/data.js';
import { zonedToUtc } from '../src/time.js';

const tz = 'Europe/Rome';
const at = s => zonedToUtc(...s.split(/[-T:]/).map(Number), 0, tz);

test('waste reminder: evening shows tomorrow, night shows today, daytime nothing', () => {
  const cfg = normalize({ timezone: tz, waste: { schedule: { thu: ['Paper'], fri: ['Glass', 'Food'] } } });
  assert.deepEqual(wasteFor(cfg.waste, at('2026-10-28T21:00'), tz), { when: 'tonight', what: 'Paper' });
  assert.deepEqual(wasteFor(cfg.waste, at('2026-10-30T02:00'), tz), { when: 'today', what: 'Glass · Food' });
  assert.equal(wasteFor(cfg.waste, at('2026-10-28T12:00'), tz), null);
  assert.equal(wasteFor(cfg.waste, at('2026-10-30T21:00'), tz), null);
});

test('menu rotates weeks and honours overrides', () => {
  const cfg = normalize({ menu: { startDate: '2026-10-26', weeks: [{ mon: ['A1', 'A2'] }, { mon: ['B1'] }], overrides: { '2026-11-09': 'Closed' } } });
  assert.deepEqual(menuFor(cfg.menu, '2026-10-26').courses, ['A1', 'A2']);
  assert.deepEqual(menuFor(cfg.menu, '2026-11-02').courses, ['B1']);
  assert.deepEqual(menuFor(cfg.menu, '2026-11-09'), { note: 'Closed' });
  assert.deepEqual(menuFor(cfg.menu, '2026-11-16').courses, ['B1']);
  assert.equal(menuFor(cfg.menu, '2026-10-27'), null);
});

test('config expands ${ENV} references', () => {
  process.env.TEST_CAL = 'https://example.com/x.ics';
  const cfg = normalize({ calendars: [{ label: 'A', ics: '${TEST_CAL}' }, { label: 'B', ics: '${MISSING_CAL}' }] });
  assert.deepEqual(cfg.calendars, [{ label: 'A', ics: 'https://example.com/x.ics' }]);
});

test('getData merges weather, ICS and Google with a stubbed network', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    url = String(url);
    if (url.includes('open-meteo')) return new Response(JSON.stringify({
      current: { temperature_2m: 18, apparent_temperature: 17, relative_humidity_2m: 60, weather_code: 3, wind_speed_10m: 10, is_day: 1 },
      hourly: { time: ['2026-10-28T12:00'], temperature_2m: [18], weather_code: [3], precipitation_probability: [5] },
      daily: { time: ['2026-10-28'], weather_code: [3], temperature_2m_max: [20], temperature_2m_min: [12], precipitation_probability_max: [5], sunrise: ['2026-10-28T06:40'], sunset: ['2026-10-28T17:10'], wind_speed_10m_max: [15] },
    }));
    if (url.includes('.ics')) return new Response('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:1\nSUMMARY:Dentist\nDTSTART:20261028T150000Z\nDTEND:20261028T160000Z\nEND:VEVENT\nEND:VCALENDAR');
    if (url.includes('script.google')) return new Response(JSON.stringify({ ok: true,
      events: [{ id: 'g1', title: 'Birthday', calendar: '', allDay: true, startDate: '2026-10-29', endDate: '2026-10-30' },
        { id: 'g2', title: 'Dentist', calendar: 'M', allDay: false, start: Date.parse('2026-10-28T15:00:00Z'), end: Date.parse('2026-10-28T16:00:00Z') }],
      tasks: [{ id: 't1', title: 'Buy milk' }] }));
    throw new Error(`unexpected ${url}`);
  };
  try {
    resetCache();
    const cfg = normalize({ timezone: tz, calendars: [{ label: 'M', ics: 'https://example.com/a.ics' }], google: { url: 'https://script.google.com/x/exec', key: 'k' } });
    const d = await getData(cfg, at('2026-10-28T10:00'));
    assert.deepEqual(d.errors, []);
    assert.equal(d.weather.current.temp, 18);
    assert.deepEqual(d.events.map(e => `${e.date} ${e.time || 'all-day'} ${e.title}`), ['2026-10-28 16:00 Dentist', '2026-10-29 all-day Birthday']);
    assert.equal(d.tasks.length, 1);
  } finally { globalThis.fetch = realFetch; }
});
