// Renders the screensaver with sample data, without network or tokens.
//   node scripts/preview.js [out.png] [--lang it] [--time 2026-10-28T21:15] [--battery 15]
import fs from 'node:fs';
import { normalize } from '../src/config.js';
import { getData } from '../src/data.js';
import { renderScreen } from '../src/render.js';
import { zonedToUtc } from '../src/time.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const out = args.find(a => a.endsWith('.png')) || 'preview.png';

const raw = JSON.parse(fs.readFileSync(new URL('../kinboard.config.example.json', import.meta.url), 'utf8'));
raw.demo = true;
if (opt('lang', 'en') === 'it') {
  Object.assign(raw, { language: 'it', timezone: 'Europe/Rome', location: { name: 'Roma', latitude: 41.89, longitude: 12.49 } });
  raw.menu.labels = ['Pranzo', 'Cena'];
  raw.menu.weeks = [{ mon: ['Pasta e fagioli', 'Pollo'], tue: ['Frittata', 'Pesce'], wed: ['Spezzatino', 'Lenticchie'], thu: ['Pesce', 'Uova'], fri: ['Ceci', 'Pollo'], sat: ['Pizza', 'Formaggi'], sun: ['Arrosto', 'Minestra'] }];
  raw.waste.schedule = { mon: ['Organico'], tue: ['Carta'], wed: ['Organico'], thu: ['Secco residuo'], fri: ['Organico', 'Vetro'], sat: ['Plastica', 'Alluminio'] };
}
const cfg = normalize(raw);
const t = opt('time', null);
const now = t ? zonedToUtc(...t.split(/[-T:]/).map(Number), 0, cfg.timezone) : Date.now();
const data = await getData(cfg, now);
fs.writeFileSync(out, await renderScreen(data, cfg, { battery: Number(opt('battery', 80)), charging: false }));
console.log('written', out);
