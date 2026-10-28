// Reads any iCalendar (.ics) feed: Google "secret address in iCal format",
// iCloud public calendars, Outlook published calendars, Nextcloud, etc.
import ICAL from 'ical.js';
import { dayStart, hhmm, isoDay, zonedToUtc } from '../time.js';

// Converts an ICAL.Time to epoch ms. Floating times and dates are read in the household zone.
function toMs(t, tz) {
  if (t.isDate) return dayStart(`${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`, tz);
  if (!t.zone || t.zone === ICAL.Timezone.localTimezone) return zonedToUtc(t.year, t.month, t.day, t.hour, t.minute, t.second, tz);
  return t.toJSDate().getTime();
}

export function parseIcs(text, { label = '', from, to, tz }) {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const vtz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(vtz);

  // Exceptions (RECURRENCE-ID) are attached to their master event.
  const masters = new Map(), exceptions = [];
  for (const comp of root.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(comp);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else masters.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const master = masters.get(ex.uid);
    if (master) master.relateException(ex); else masters.set(`${ex.uid}#${ex.recurrenceId}`, ex);
  }

  const out = [];
  const push = (ev, start, end, key) => {
    const startMs = toMs(start, tz);
    let endMs = end ? toMs(end, tz) : startMs + (start.isDate ? 86400000 : 0);
    if (endMs <= startMs) endMs = startMs + (start.isDate ? 86400000 : 0);
    if (endMs <= from || startMs >= to) return;
    if ((ev.component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED') return;
    out.push(makeEvent({ id: key, title: ev.summary || '', calendar: label, start: startMs, end: endMs, allDay: start.isDate, location: ev.location || '', tz }));
  };

  for (const ev of masters.values()) {
    if (!ev.startDate) continue;
    if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate, ev.uid); continue; }
    const it = ev.iterator();
    for (let next = it.next(), guard = 0; next && guard < 2000; next = it.next(), guard++) {
      const nextMs = toMs(next, tz);
      if (nextMs >= to) break;
      const occ = ev.getOccurrenceDetails(next);
      push(occ.item, occ.startDate, occ.endDate, `${ev.uid}@${nextMs}`);
    }
  }
  return out;
}

export function makeEvent({ id, title, calendar, start, end, allDay, location = '', tz }) {
  return {
    id: String(id), title, calendar, location, allDay: !!allDay,
    start, end,
    date: isoDay(start, tz), endDate: isoDay(Math.max(start, end - 1), tz),
    time: allDay ? '' : hhmm(start, tz), endTime: allDay ? '' : hhmm(end, tz),
  };
}

export async function fetchIcs(cal, opts) {
  const res = await fetch(cal.ics.replace(/^webcal:/, 'https:'), { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'kinboard' } });
  if (!res.ok) throw new Error(`calendar "${cal.label || cal.name || '?'}": HTTP ${res.status}`);
  return parseIcs(await res.text(), { ...opts, label: cal.label || '' });
}
