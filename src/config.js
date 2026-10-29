// Loads the Kinboard configuration.
//
// Sources, in order of precedence:
//   1. KINBOARD_CONFIG env var containing the whole JSON (handy on Vercel)
//   2. the file named by KINBOARD_CONFIG_FILE
//   3. ./kinboard.config.json
//
// Any string value may reference environment variables as ${NAME}, so secrets
// (calendar URLs, keys) can stay out of the config file.
import fs from 'node:fs';
import path from 'node:path';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const SCREEN_SECTIONS = ['header', 'weather', 'waste', 'events', 'medications', 'footer'];
const PANEL_VIEWS = ['home', 'weather', 'agenda', 'tasks', 'medications', 'menu'];

const DEFAULTS = {
  language: 'en',
  timezone: 'UTC',
  location: { name: '', latitude: 51.5072, longitude: -0.1276 },
  units: 'metric',
  weather: { enabled: true },
  calendars: [],
  google: null,
  homeassistant: null,
  tasks: null,
  menu: null,
  waste: null,
  medications: null,
  screen: { maxEvents: 4, maxDoses: 4, lowBattery: 20, sections: SCREEN_SECTIONS },
  panel: { views: PANEL_VIEWS },
  daysAhead: 7,
};

function expandEnv(value) {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => process.env[name] ?? '');
  }
  if (Array.isArray(value)) return value.map(expandEnv);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandEnv(v)]));
  }
  return value;
}

function readRaw() {
  if (process.env.KINBOARD_CONFIG) return JSON.parse(process.env.KINBOARD_CONFIG);
  const file = process.env.KINBOARD_CONFIG_FILE || path.join(process.cwd(), 'kinboard.config.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  return {};
}

// Accepts { mon: [...], tue: [...] } and returns an array indexed by Date#getDay().
export function byWeekday(obj) {
  const out = new Array(7).fill(null);
  for (const [key, value] of Object.entries(obj || {})) {
    const i = DAYS.indexOf(key.slice(0, 3).toLowerCase());
    if (i >= 0) out[i] = value;
  }
  return out;
}

export function normalize(raw) {
  const cfg = { ...DEFAULTS, ...expandEnv(raw) };
  cfg.location = { ...DEFAULTS.location, ...cfg.location };
  cfg.screen = { ...DEFAULTS.screen, ...cfg.screen };
  cfg.panel = { ...DEFAULTS.panel, ...cfg.panel };
  cfg.weather = { ...DEFAULTS.weather, ...cfg.weather };
  // A calendar is an iCal feed ("ics") or a Home Assistant calendar entity ("homeassistant").
  cfg.calendars = (cfg.calendars || []).filter(c => c && (c.ics || c.homeassistant));
  if (cfg.google && !cfg.google.url) cfg.google = null;
  if (cfg.google) cfg.google = { calendars: true, ...cfg.google };
  if (cfg.homeassistant && !(cfg.homeassistant.url && cfg.homeassistant.token)) cfg.homeassistant = null;
  // To-do list: explicit provider, or Google Tasks when the Google script is configured.
  if (!cfg.tasks && cfg.google && cfg.google.tasks !== false) cfg.tasks = { provider: 'google' };
  if (cfg.tasks) {
    const t = cfg.tasks, ok = (t.provider === 'google' && cfg.google) || (t.provider === 'todoist' && t.token) || (t.provider === 'homeassistant' && t.entity && cfg.homeassistant);
    if (!ok) cfg.tasks = null;
  }
  if (cfg.menu) {
    // A single week ("week") or a rotation of several weeks ("weeks" + "startDate").
    const weeks = cfg.menu.weeks || (cfg.menu.week ? [cfg.menu.week] : []);
    cfg.menu = {
      labels: cfg.menu.labels || ['Lunch', 'Dinner'],
      startDate: cfg.menu.startDate || '2024-01-01',
      weeks: weeks.map(byWeekday),
      overrides: cfg.menu.overrides || {},
    };
    if (!cfg.menu.weeks.length) cfg.menu = null;
  }
  if (cfg.waste) {
    cfg.waste = {
      from: cfg.waste.from ?? 20,
      until: cfg.waste.until ?? 6,
      schedule: byWeekday(cfg.waste.schedule),
    };
  }
  // Medications: a Home Assistant to-do list, or a fixed list of items in the config.
  if (cfg.medications) {
    const m = cfg.medications;
    if (Array.isArray(m.items) && m.items.length) cfg.medications = { items: m.items };
    else if (m.homeassistant && cfg.homeassistant) cfg.medications = { homeassistant: m.homeassistant };
    else cfg.medications = null;
  }
  // Views and sections that have nothing to show are dropped.
  const has = { weather: cfg.weather.enabled, agenda: cfg.demo || cfg.calendars.length > 0 || !!cfg.google?.calendars, tasks: cfg.demo || !!cfg.tasks, menu: !!cfg.menu, waste: !!cfg.waste, medications: cfg.demo || !!cfg.medications };
  cfg.panel.views = cfg.panel.views.filter(v => PANEL_VIEWS.includes(v) && has[v] !== false);
  if (!cfg.panel.views.includes('home')) cfg.panel.views.unshift('home');
  cfg.screen.sections = cfg.screen.sections.filter(s => SCREEN_SECTIONS.includes(s) && has[s === 'events' ? 'agenda' : s] !== false);
  cfg.token = process.env.KINBOARD_TOKEN || cfg.token || '';
  return cfg;
}

let cached;
export function loadConfig() {
  if (!cached) cached = normalize(readRaw());
  return cached;
}
