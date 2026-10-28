// Collects everything the screen and the panel show, from all configured sources.
import { fetchIcs } from './sources/ics.js';
import { fetchGoogle } from './sources/google.js';
import { fetchHaCalendar } from './sources/homeassistant.js';
import { fetchTasks } from './sources/tasks.js';
import { fetchWeather } from './sources/weather.js';
import { demoData } from './demo.js';
import { addDays, dayStart, isoDay, offsetMs, parts, weekdayOf } from './time.js';

// Menu of a given day: per-date override first, then the rotating weekly plan.
export function menuFor(menu, date) {
  if (!menu) return null;
  if (Object.prototype.hasOwnProperty.call(menu.overrides, date)) {
    const o = menu.overrides[date];
    return Array.isArray(o) ? { courses: o } : { note: String(o || '') };
  }
  const startMonday = mondayOf(menu.startDate), thisMonday = mondayOf(date);
  const weekIndex = Math.floor((Date.parse(thisMonday) - Date.parse(startMonday)) / 604800000);
  const n = menu.weeks.length, week = ((weekIndex % n) + n) % n;
  const courses = menu.weeks[week][weekdayOf(date)];
  return courses ? { courses: [].concat(courses), week: week + 1 } : null;
}
function mondayOf(date) { return addDays(date, -((weekdayOf(date) + 6) % 7)); }

// Bin-day reminder: in the evening it shows tomorrow's collection, after midnight today's.
export function wasteFor(waste, now, tz) {
  if (!waste) return null;
  const h = parts(now, tz).hour, { from, until } = waste;
  const evening = h >= from, night = h < until;
  if (!evening && !night) return null;
  const date = evening ? addDays(isoDay(now, tz), 1) : isoDay(now, tz);
  const what = waste.schedule[weekdayOf(date)];
  return what ? { when: evening ? 'tonight' : 'today', what: [].concat(what).join(' · ') } : null;
}

let cache = { at: 0, key: '', value: null };
const TTL = 5 * 60 * 1000;

export async function getData(cfg, now = Date.now(), { fresh = false } = {}) {
  const key = String(Math.floor(now / TTL));
  if (cfg.demo) return withClock(demoData(cfg, now), cfg, now);
  if (!fresh && cache.value && now - cache.at < TTL) return withClock(cache.value, cfg, now);

  const tz = cfg.timezone, today = isoDay(now, tz);
  const from = dayStart(today, tz), to = dayStart(addDays(today, cfg.daysAhead + 1), tz);
  const range = { from, to, tz };
  const jobs = {
    weather: cfg.weather.enabled ? fetchWeather(cfg) : Promise.resolve(null),
    google: cfg.google ? fetchGoogle(cfg, range) : Promise.resolve(null),
    tasks: fetchTasks(cfg),
    ...Object.fromEntries(cfg.calendars.map((c, i) => [`cal${i}`, c.ics ? fetchIcs(c, range) : fetchHaCalendar(cfg, c, range)])),
  };
  const names = Object.keys(jobs), results = await Promise.allSettled(Object.values(jobs));
  const got = {}, errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') got[names[i]] = r.value;
    else { errors.push(String(r.reason?.message || r.reason)); console.error('[kinboard]', names[i], r.reason?.message || r.reason); }
  });

  // Merge calendars; the same event in two calendars is shown once.
  const seen = new Set(), events = [];
  const googleEvents = cfg.google?.calendars ? got.google?.events || [] : [];
  for (const list of [googleEvents, ...cfg.calendars.map((_, i) => got[`cal${i}`] || [])]) {
    for (const e of list) {
      const k = `${e.title}|${e.start}|${e.end}`;
      if (!seen.has(k)) { seen.add(k); events.push(e); }
    }
  }
  events.sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));

  const value = {
    weather: got.weather || null,
    events,
    calendarsOk: events.length > 0 || !errors.some(e => /calendar|google|homeassistant/.test(e)),
    tasks: cfg.tasks ? (cfg.tasks.provider === 'google' ? got.google?.tasks : got.tasks) ?? null : null,
    errors,
  };
  if (!errors.length) cache = { at: now, key, value };
  return withClock(value, cfg, now);
}

// Parts that depend on the current time are recomputed on every request.
function withClock(value, cfg, now) {
  const tz = cfg.timezone, today = isoDay(now, tz);
  const week = [];
  if (cfg.menu) for (let i = 0; i < 7; i++) { const d = addDays(mondayOf(today), i); week.push({ date: d, ...(menuFor(cfg.menu, d) || {}) }); }
  return {
    ...value,
    events: value.events.filter(e => e.end > now),
    now, today, timezone: tz, tzOffset: offsetMs(now, tz), language: cfg.language,
    location: { name: cfg.location.name },
    views: cfg.panel.views,
    tasksEnabled: !!(cfg.tasks || cfg.demo),
    menu: cfg.menu ? { labels: cfg.menu.labels, today: menuFor(cfg.menu, today), week } : null,
    waste: wasteFor(cfg.waste, now, tz),
  };
}

export function resetCache() { cache = { at: 0, key: '', value: null }; }
