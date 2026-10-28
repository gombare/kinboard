// Draws the screensaver: a 600x800 8-bit grayscale PNG, the format the Kindle shows reliably with `eips -g`.
import fs from 'node:fs';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import { strings } from './i18n.js';
import { svg } from './icons.js';
import { KIND_ICON, iconFor, weatherKind } from './sources/weather.js';
import { addDays, parts } from './time.js';

const W = 600, H = 800;

let fonts;
function loadFonts() {
  // Literal URLs so that bundlers (Vercel's file tracer) include the font files.
  if (!fonts) fonts = [
    { name: 'Roboto', weight: 400, style: 'normal', data: fs.readFileSync(new URL('../node_modules/@fontsource/roboto/files/roboto-latin-400-normal.woff', import.meta.url)) },
    { name: 'Roboto', weight: 700, style: 'normal', data: fs.readFileSync(new URL('../node_modules/@fontsource/roboto/files/roboto-latin-700-normal.woff', import.meta.url)) },
  ];
  return fonts;
}

function h(type, style, ...children) {
  const kids = children.flat().filter(c => c !== null && c !== undefined && c !== false);
  return { type, props: { style: { display: 'flex', ...style }, children: kids.length === 1 ? kids[0] : kids } };
}
function icon(name, size, stroke = 2) {
  const src = `data:image/svg+xml;base64,${Buffer.from(svg(name, size, stroke)).toString('base64')}`;
  return { type: 'img', props: { src, width: size, height: size, style: { width: size, height: size } } };
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const deg = n => `${Math.round(n)}°`;

function whenLabel(e, today, t) {
  if (e.date === today) return t.today;
  if (e.date === addDays(today, 1)) return t.tomorrow;
  const [y, m, d] = e.date.split('-').map(Number);
  return `${t.weekdaysShort[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}

export function screenTree(data, cfg, { battery, charging } = {}) {
  const t = strings(cfg.language), tz = cfg.timezone, now = data.now;
  const p = parts(now, tz), pad = n => String(n).padStart(2, '0');
  const w = data.weather, c = w?.current, d = w?.daily;
  const waste = data.waste;
  const maxEvents = Math.max(1, (cfg.screen.maxEvents || 4) - (waste ? 1 : 0));
  const events = data.events.slice(0, maxEvents);
  const lowBattery = Number.isFinite(battery) && battery < cfg.screen.lowBattery && !charging;
  const rule = h('div', { height: 3, minHeight: 3, flexShrink: 0, background: '#000', width: '100%' });
  const label = text => h('div', { fontSize: 20, fontWeight: 700, letterSpacing: 2, marginTop: 14, marginBottom: 6 }, text);

  const weather = c ? h('div', { flexDirection: 'column', padding: '10px 0 8px' },
    h('div', { alignItems: 'center' },
      icon(iconFor(c.code, c.isDay), 104, 1.7),
      h('div', { fontSize: 84, fontWeight: 700, lineHeight: 1, marginLeft: 14, letterSpacing: -2 }, deg(c.temp)),
      h('div', { flexDirection: 'column', alignItems: 'flex-end', flexGrow: 1 },
        h('div', { fontSize: 30, fontWeight: 700 }, t.weather[weatherKind(c.code)]),
        h('div', { fontSize: 22 }, `${t.min} ${deg(d[0].min)} · ${t.max} ${deg(d[0].max)}`),
        h('div', { fontSize: 20, color: '#222' }, `${t.feels} ${deg(c.feels)} · ${t.humidity} ${Math.round(c.humidity)}%`))),
    h('div', { marginTop: 8, borderTop: '1px solid #999', paddingTop: 8, alignItems: 'center', justifyContent: 'space-between' },
      h('div', { alignItems: 'center' }, icon('droplet', 26), h('div', { fontSize: 22, marginLeft: 6 }, `${d[0].rain ?? '--'}%`)),
      h('div', { alignItems: 'center' }, icon('wind', 26), h('div', { fontSize: 22, marginLeft: 6 }, `${Math.round(c.wind)} ${w.units.wind}`)),
      d.slice(1, 4).map(day => {
        const [y, m, dd] = day.date.split('-').map(Number);
        return h('div', { alignItems: 'center' },
          h('div', { fontSize: 20, fontWeight: 700, marginRight: 4 }, t.weekdaysShort[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()]),
          icon(KIND_ICON[weatherKind(day.code)], 30),
          h('div', { fontSize: 20, marginLeft: 4 }, deg(day.max)));
      })))
    : h('div', { fontSize: 22, padding: '12px 0' }, t.weatherError);

  const meal = data.menu?.today;
  const footer = (data.menu || data.tasks) ? [
    rule,
    h('div', { paddingTop: 10 },
      h('div', { flexDirection: 'column', width: '62%' },
        data.menu ? [
          h('div', { fontSize: 20, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }, t.menuToday),
          meal?.courses ? data.menu.labels.map((l, i) => meal.courses[i] ? h('div', { fontSize: 24 }, trim(`${l}: ${meal.courses[i]}`, 30)) : null)
            : h('div', { fontSize: 22 }, meal?.note || t.noMenu),
        ] : null),
      data.tasks ? h('div', { flexDirection: 'column', width: '38%', alignItems: 'flex-end' },
        h('div', { fontSize: 20, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }, t.todo),
        h('div', { fontSize: 44, fontWeight: 700, lineHeight: 1 }, String(data.tasks.length)),
        h('div', { fontSize: 18 }, t.tasks(data.tasks.length))) : null),
  ] : [];

  const sections = {
    // The date is the headline: the image stays up for minutes, a big clock would be misleading.
    header: [
      h('div', { fontSize: 46, fontWeight: 700, lineHeight: 1.1 }, `${t.weekdays[p.weekday]} ${p.day}`),
      h('div', { justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 },
        h('div', { fontSize: 26 }, cap(`${t.months[p.month - 1]} ${p.year}`)),
        h('div', { fontSize: 18, color: '#333' }, `${t.updated} ${pad(p.hour)}:${pad(p.minute)}`)),
      rule,
    ],
    weather: [weather, rule],
    waste: waste ? h('div', { border: '3px solid #000', marginTop: 12, padding: '8px 12px', flexDirection: 'column' },
      h('div', { fontSize: 18, fontWeight: 700, letterSpacing: 2 }, waste.when === 'tonight' ? t.wasteTonight : t.wasteToday),
      h('div', { fontSize: 32, fontWeight: 700, lineHeight: 1.15 }, waste.what)) : null,
    events: [
      label(t.upcoming),
      events.length ? events.map((e, i) => h('div', { flexDirection: 'column', paddingTop: 6, paddingBottom: 6, borderBottom: i < events.length - 1 ? '1px solid #999' : 'none' },
        h('div', { fontSize: 27, fontWeight: 700, lineHeight: 1.15 }, trim(`${e.calendar ? `${e.calendar} · ` : ''}${e.title}`, 34)),
        h('div', { fontSize: 19, color: '#222' }, `${whenLabel(e, data.today, t)} · ${e.allDay ? t.allDay : `${e.time}–${e.endTime}`}`)))
        : h('div', { fontSize: 24, color: '#333' }, data.calendarsOk ? t.noEvents : t.calendarError),
    ],
    footer: [h('div', { flexGrow: 1 }), footer],
  };
  const order = [...cfg.screen.sections];
  if (!order.includes('footer')) order.push('footer');

  return h('div', { width: W, height: H, boxSizing: 'border-box', background: '#fff', color: '#000', flexDirection: 'column', padding: '22px 26px', fontFamily: 'Roboto' },
    lowBattery ? h('div', { background: '#000', color: '#fff', fontSize: 24, fontWeight: 700, justifyContent: 'center', padding: '8px 0', margin: '-22px -26px 12px' }, t.lowBattery(battery)) : null,
    order.map(name => sections[name]),
    h('div', { fontSize: 15, color: '#444', marginTop: 10, justifyContent: 'center' }, t.unlockHint),
  );
}
const trim = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function renderScreen(data, cfg, opts) {
  const tree = screenTree(data, cfg, opts);
  const svgText = await satori(tree, { width: W, height: H, fonts: loadFonts() });
  const rgba = new Resvg(svgText, { fitTo: { mode: 'width', value: W }, background: '#ffffff' }).render().pixels;
  const gray = Buffer.alloc(W * H);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) gray[j] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  const png = new PNG({ width: W, height: H, colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
  png.data = gray;
  return PNG.sync.write(png, { colorType: 0, inputColorType: 0, bitDepth: 8, inputHasAlpha: false });
}
