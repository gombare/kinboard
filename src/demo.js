// Sample data for "demo": true in the config and for scripts/preview.js.
// Lets you try the panel and the screensaver without connecting any account.
import { makeEvent } from './sources/ics.js';
import { addDays, dayStart, isoDay, parts } from './time.js';

const SAMPLES = {
  en: {
    events: [['ME', 'Dentist', 3], ['FAM', "Dinner at grandma's", 9], ['ME', 'Team meeting', 26], ['FAM', 'Football practice', 30], ['ME', 'Haircut', 50], ['FAM', 'School play', 74]],
    birthday: "Anna's birthday",
    tasks: ['Buy milk', 'Call the plumber', 'Return library books'],
  },
  it: {
    events: [['M', 'Dentista', 3], ['FAM', 'Cena dai nonni', 9], ['F', 'Riunione', 26], ['M', 'Calcetto', 30], ['FAM', 'Pediatra', 50], ['FAM', 'Recita scolastica', 74]],
    birthday: 'Compleanno Anna',
    tasks: ['Comprare il latte', "Chiamare l'idraulico", 'Riportare i libri in biblioteca'],
  },
};

export function demoData(cfg, now) {
  const tz = cfg.timezone, today = isoDay(now, tz), H = 3600e3;
  const s = SAMPLES[cfg.language] || SAMPLES.en;
  const round = Math.ceil(now / (30 * 60e3)) * 30 * 60e3;
  const events = s.events.map(([calendar, title, o], i) => makeEvent({ id: `demo${i}`, title, calendar, start: round + o * H, end: round + (o + 1) * H, tz }));
  events.push(makeEvent({ id: 'bday', title: s.birthday, calendar: '', start: dayStart(addDays(today, 1), tz), end: dayStart(addDays(today, 2), tz), allDay: true, tz }));
  events.sort((a, b) => a.start - b.start);
  const imperial = cfg.units === 'imperial', T = n => (imperial ? Math.round(n * 1.8 + 32) : n);
  const codes = [2, 61, 3, 0, 80, 1], max = [21, 19, 20, 23, 18, 22], min = [13, 12, 12, 13, 11, 12], rain = [10, 70, 20, 0, 60, 5];
  return {
    weather: cfg.weather.enabled ? {
      units: { temp: imperial ? '°F' : '°C', wind: imperial ? 'mph' : 'km/h' },
      current: { temp: T(19.4), feels: T(18.6), humidity: 72, code: 2, wind: 9, isDay: true },
      hourly: Array.from({ length: 24 }, (_, i) => ({ time: `${String((parts(now, tz).hour + 1 + i) % 24).padStart(2, '0')}:00`, temp: T(19 - Math.abs(i - 4) / 2), code: [2, 2, 3, 3, 61, 61, 3, 2][i % 8], rain: [5, 10, 20, 40, 70, 60, 30, 10][i % 8] })),
      daily: codes.map((code, i) => ({ date: addDays(today, i), code, max: T(max[i]), min: T(min[i]), rain: rain[i], wind: 12, sunrise: '06:41', sunset: '17:12' })),
    } : null,
    events,
    calendarsOk: true,
    tasks: cfg.tasks || cfg.demo ? s.tasks.map((title, i) => ({ id: `t${i}`, title, due: i === 1 ? today : '' })) : null,
    errors: [],
  };
}
