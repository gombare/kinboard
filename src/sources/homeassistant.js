// Home Assistant: calendars (calendar.*) and to-do lists (todo.*) through the REST API.
// Needs a long-lived access token (Profile → Security in Home Assistant).
import { makeEvent } from './ics.js';
import { dayStart } from '../time.js';

export async function haApi(cfg, path, { method = 'GET', body } = {}) {
  const { url, token } = cfg.homeassistant || {};
  if (!url || !token) throw new Error('homeassistant: url and token are required');
  const res = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    method, signal: AbortSignal.timeout(15000),
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`homeassistant ${path}: HTTP ${res.status}`);
  return res.json();
}

export async function fetchHaCalendar(cfg, cal, { from, to, tz }) {
  const q = new URLSearchParams({ start: new Date(from).toISOString(), end: new Date(to).toISOString() });
  const list = await haApi(cfg, `/api/calendars/${encodeURIComponent(cal.homeassistant)}?${q}`);
  return list.map((e, i) => {
    const allDay = !!e.start.date;
    const start = allDay ? dayStart(e.start.date, tz) : Date.parse(e.start.dateTime);
    const end = allDay ? dayStart(e.end.date, tz) : Date.parse(e.end.dateTime);
    return makeEvent({ id: e.uid || `${cal.homeassistant}-${i}`, title: e.summary || '', calendar: cal.label || '', start, end, allDay, location: e.location || '', tz });
  });
}

export async function fetchHaTodo(cfg) {
  const entity = cfg.tasks.entity;
  const out = await haApi(cfg, '/api/services/todo/get_items?return_response', { method: 'POST', body: { entity_id: entity, status: 'needs_action' } });
  const items = out?.service_response?.[entity]?.items || [];
  return items.map(i => ({ id: i.uid, title: i.summary || '', notes: i.description || '', due: (i.due || '').slice(0, 10) }));
}

export async function completeHaTodo(cfg, id) {
  await haApi(cfg, '/api/services/todo/update_item', { method: 'POST', body: { entity_id: cfg.tasks.entity, item: id, status: 'completed' } });
}
