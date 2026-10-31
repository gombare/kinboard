// Google bridge, "panel" flavour: the Apps Script of the first Kindle panel (before Kinboard).
// It answers GET ?format=script&key=…&nonce=… with `kindleGoogleReceive({...})` and also
// serves a weekly menu kept in a Google Sheet (4-week rotation plus per-day changes).
// Enable it with "google": { "url": "…/exec", "key": "…", "api": "panel" }.
import crypto from 'node:crypto';
import { makeEvent } from './ics.js';
import { addDays, dayStart, weekdayOf } from '../time.js';

// The script only accepts an https origin; nothing is ever posted to it.
const ORIGIN = 'https://kinboard.local';
const nonce = () => `kb-${crypto.randomBytes(6).toString('hex')}`;

async function get(google, params = {}) {
  const q = new URLSearchParams({ format: 'script', key: google.key || '', origin: ORIGIN, nonce: nonce(), ...params });
  const res = await fetch(`${google.url}?${q}`, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const text = await res.text();
  const start = text.indexOf('('), end = text.lastIndexOf(')');
  let msg;
  try { msg = JSON.parse(text.slice(start + 1, end)); } catch { throw new Error('google: the panel script did not answer (check the /exec URL)'); }
  if (!msg.ok) throw new Error(`google: ${msg.error || 'error'}`);
  return msg;
}

export async function fetchGooglePanel(cfg) {
  const { data } = await get(cfg.google);
  const tz = cfg.timezone;
  const events = (data.events || []).map(e => {
    const label = e.calendar || '';
    // The script prefixes titles with the calendar label; Kinboard adds it itself.
    const title = label && String(e.title).startsWith(`${label} · `) ? String(e.title).slice(label.length + 3) : String(e.title || '');
    const start = e.allDay ? dayStart(e.date, tz) : e.startMs;
    const end = e.allDay ? dayStart(e.endDate && e.endDate > e.date ? e.endDate : addDays(e.date, 1), tz) : e.endMs;
    return makeEvent({ id: e.id, title, calendar: label, start, end, allDay: !!e.allDay, location: e.location || '', tz });
  });
  const tasks = (data.tasks || []).map(t => ({ id: t.id, title: t.title || '', notes: t.notes || '', due: t.due || '' }));
  return { events, tasks, menu: data.menu?.configured ? data.menu : null };
}

// Ticking a task off is asynchronous on the script side: send it, then ask for the outcome.
export async function completeGooglePanelTask(cfg, taskId) {
  const opId = `kb-${crypto.randomBytes(8).toString('hex')}`;
  const body = new URLSearchParams({ key: cfg.google.key || '', action: 'complete-task', opId, origin: ORIGIN, taskId: String(taskId) });
  const res = await fetch(cfg.google.url, { method: 'POST', body, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  const text = (await res.text()).trim();
  if (!/ricevuta/i.test(text)) throw new Error(`google: ${text.slice(0, 120) || 'task not completed'}`);
  for (let i = 0; i < 3; i++) {
    const msg = await get(cfg.google, { action: 'task-status', opId });
    const state = msg.operation?.state;
    if (state === 'completed') return;
    if (state === 'error') throw new Error(`google: ${msg.operation.error || 'task not completed'}`);
    await new Promise(r => setTimeout(r, 1500));
  }
}

// Menu of a day from the Sheet: same rules as the first panel.
//   anchor     Monday of week 1; a change row with "week" restarts the cycle from that Monday
//   from/until validity period
//   overrides  per-day courses, a note, or "closed"
const dayMs = d => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
const mondayMs = d => dayMs(d) - ((weekdayOf(d) + 6) % 7) * 86400000;

export function panelMenuFor(menu, date) {
  if (!menu) return null;
  if ((menu.from && date < menu.from) || (menu.until && date > menu.until)) return null;
  const monday = mondayMs(date);
  let base = dayMs(menu.anchor), week = 1;
  for (const o of menu.overrides || []) {
    const s = dayMs(o.date);
    if (o.week && s <= monday && s >= base) { base = s; week = o.week; }
  }
  const cycle = ((((Math.floor((monday - base) / 604800000) + week - 1) % 4) + 4) % 4) + 1;
  const ov = (menu.overrides || []).find(o => o.date === date);
  if (ov?.closed) return { note: ov.note || '' };
  if (ov && (ov.courses || []).some(Boolean)) return { courses: ov.courses, week: cycle };
  const r = (menu.recipes || []).find(x => x.week === cycle && x.day === weekdayOf(date));
  return r ? { courses: r.courses, week: cycle } : null;
}
