// Optional Google bridge: the Apps Script in apps-script/Code.gs runs in the
// user's own Google account and exposes calendars, birthdays and one Google
// Tasks list, protected by a shared key. Nothing else ever talks to Google.
import { makeEvent } from './ics.js';
import { dayStart } from '../time.js';

async function call(google, params, method = 'GET') {
  const q = new URLSearchParams({ key: google.key || '', ...params });
  const res = await fetch(method === 'GET' ? `${google.url}?${q}` : google.url, {
    method, redirect: 'follow', signal: AbortSignal.timeout(25000),
    ...(method === 'POST' ? { body: q, headers: { 'content-type': 'application/x-www-form-urlencoded' } } : {}),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('google: the Apps Script did not return JSON (check the deployment URL and access "Anyone")'); }
  if (!data.ok) throw new Error(`google: ${data.error || 'error'}`);
  return data;
}

export async function fetchGoogle(cfg, { from, to }) {
  const data = await call(cfg.google, { action: 'read', from: String(from), to: String(to) });
  const tz = cfg.timezone;
  const events = (data.events || []).map(e => {
    // All-day events arrive as dates so they land on the right local day.
    const start = e.allDay ? dayStart(e.startDate, tz) : e.start;
    const end = e.allDay ? dayStart(e.endDate, tz) : e.end;
    return makeEvent({ id: e.id, title: e.title, calendar: e.calendar || '', start, end, allDay: e.allDay, location: e.location, tz });
  });
  return { events, tasks: data.tasks || [], taskList: data.taskList || '' };
}

export async function completeGoogleTask(cfg, taskId) {
  if (!cfg.google) throw new Error('Google is not configured');
  await call(cfg.google, { action: 'complete', task: taskId }, 'POST');
}
