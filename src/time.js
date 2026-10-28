// Small time-zone helpers built on Intl, so the server can run in UTC and still
// reason in the household's local time.

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

// Wall-clock parts of an instant in the given zone.
export function parts(ms, tz) {
  const p = {};
  for (const { type, value } of fmt(tz, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(new Date(ms))) p[type] = value;
  return {
    year: +p.year, month: +p.month, day: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
  };
}

const pad = n => String(n).padStart(2, '0');
export const isoDay = (ms, tz) => { const p = parts(ms, tz); return `${p.year}-${pad(p.month)}-${pad(p.day)}`; };
export const hhmm = (ms, tz) => { const p = parts(ms, tz); return `${pad(p.hour)}:${pad(p.minute)}`; };

// Offset of the zone from UTC at a given instant, in milliseconds.
export function offsetMs(ms, tz) {
  const p = parts(ms, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Instant of a local wall-clock time in the zone (handles DST by re-checking the offset).
export function zonedToUtc(y, m, d, h = 0, min = 0, s = 0, tz) {
  const guess = Date.UTC(y, m - 1, d, h, min, s);
  let ms = guess - offsetMs(guess, tz);
  ms = guess - offsetMs(ms, tz);
  return ms;
}

export function dayStart(isoDate, tz) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return zonedToUtc(y, m, d, 0, 0, 0, tz);
}

export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
