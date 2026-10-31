import test from 'node:test';
import assert from 'node:assert/strict';
import { normalize } from '../src/config.js';
import { getData, resetCache } from '../src/data.js';
import { completeTask } from '../src/sources/tasks.js';
import { panelMenuFor } from '../src/sources/googlePanel.js';
import { zonedToUtc } from '../src/time.js';

const tz = 'Europe/Rome';
const at = s => zonedToUtc(...s.split(/[-T:]/).map(Number), 0, tz);
const DAYS = [1, 2, 3, 4, 5, 6, 0];
const recipes = [1, 2, 3, 4].flatMap(week => DAYS.map(day => ({ week, day, courses: [`L${week}.${day}`, `D${week}.${day}`, '', '', ''] })));
const menu = {
  configured: true, anchor: '2026-10-05', from: '2026-10-05', until: '', recipes,
  overrides: [
    { date: '2026-10-28', courses: ['Pizza', '', '', '', ''], note: '', week: 0, closed: false },
    { date: '2026-10-29', courses: ['', '', '', '', ''], note: 'Out for dinner', week: 0, closed: true },
    { date: '2026-11-09', courses: ['', '', '', '', ''], note: '', week: 1, closed: false },
  ],
};

test('sheet menu: 4-week rotation, per-day changes, cycle restart, validity', () => {
  assert.deepEqual(panelMenuFor(menu, '2026-10-05').courses.slice(0, 2), ['L1.1', 'D1.1']);
  assert.equal(panelMenuFor(menu, '2026-10-26').week, 4);
  assert.equal(panelMenuFor(menu, '2026-11-02').week, 1);
  assert.deepEqual(panelMenuFor(menu, '2026-10-28').courses[0], 'Pizza');
  assert.deepEqual(panelMenuFor(menu, '2026-10-29'), { note: 'Out for dinner' });
  // Without the restart 2026-11-09 would be week 2; the change row sets it back to week 1.
  assert.equal(panelMenuFor(menu, '2026-11-09').week, 1);
  assert.equal(panelMenuFor(menu, '2026-11-16').week, 2);
  assert.equal(panelMenuFor(menu, '2026-10-04'), null);
  assert.equal(panelMenuFor({ ...menu, until: '2026-10-31' }, '2026-11-02'), null);
});

test('panel script: events, tasks, menu and ticking a task off', async () => {
  const realFetch = globalThis.fetch, seen = [];
  let completed = false;
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url), p = opts.body ? Object.fromEntries(opts.body) : Object.fromEntries(u.searchParams);
    seen.push(p);
    if (url.includes('open-meteo')) throw new Error('offline');
    if (p.key !== 'secret-code') return new Response('/**/kindleGoogleReceive({"ok":false,"error":"Codice di accesso non valido."});');
    if (opts.method === 'POST') { completed = p.action === 'complete-task' && p.taskId === 'task1'; return new Response('Richiesta ricevuta.'); }
    if (p.action === 'task-status') return new Response(`/**/kindleGoogleReceive(${JSON.stringify({ ok: true, operation: { state: completed ? 'completed' : 'pending' } })});`);
    const data = {
      today: '2026-10-28',
      events: [
        { id: 'e1', title: 'M · Dentist', calendar: 'M', allDay: false, startMs: Date.parse('2026-10-28T15:00:00Z'), endMs: Date.parse('2026-10-28T16:00:00Z'), date: '2026-10-28', endDate: '2026-10-28' },
        { id: 'b1', title: 'Anna', calendar: '', allDay: true, startMs: 0, endMs: 0, date: '2026-10-29', endDate: '2026-10-30' },
      ],
      tasks: [{ id: 'task1', title: 'Buy milk', notes: '', due: '' }],
      menu,
    };
    return new Response(`/**/kindleGoogleReceive(${JSON.stringify({ ok: true, data })});`);
  };
  try {
    resetCache();
    const cfg = normalize({ language: 'it', timezone: tz, weather: { enabled: false }, google: { url: 'https://script.example/exec', key: 'secret-code', api: 'panel' } });
    assert.ok(cfg.panel.views.includes('menu'));
    assert.ok(cfg.panel.views.includes('tasks'));
    const d = await getData(cfg, at('2026-10-28T10:00'));
    assert.deepEqual(d.errors, []);
    assert.deepEqual(d.events.map(e => `${e.calendar}|${e.title}|${e.allDay ? e.date : e.time}`), ['M|Dentist|16:00', '|Anna|2026-10-29']);
    assert.deepEqual(d.tasks.map(t => t.title), ['Buy milk']);
    assert.deepEqual(d.menu.labels, ['Pranzo', 'Cena']);
    assert.deepEqual(d.menu.today.courses, ['Pizza', '']);
    assert.equal(d.menu.week.length, 7);
    assert.equal(seen[0].format, 'script');
    await completeTask(cfg, 'task1');
    assert.ok(completed);
    const bad = normalize({ timezone: tz, weather: { enabled: false }, google: { url: 'https://script.example/exec', key: 'wrong', api: 'panel' } });
    resetCache();
    const e = await getData(bad, at('2026-10-28T10:00'));
    assert.match(e.errors.join(), /Codice di accesso non valido/);
  } finally { globalThis.fetch = realFetch; resetCache(); }
});
