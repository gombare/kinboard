// Entry point of the Home Assistant app (add-on). Reads the app options, connects
// Kinboard to Home Assistant through the Supervisor proxy and starts the server.
//
// Options (/data/options.json):
//   token   the KINBOARD_TOKEN the Kindle sends (at least 16 characters)
//   google_key  optional: the key of the Google Apps Script, kept out of the configuration
//   config  optional: the Kinboard configuration as JSON. When empty,
//           /config/kinboard.config.json (the app's own config folder) is used.
//
// No long-lived Home Assistant token is needed: the Supervisor gives the app a
// token of its own (SUPERVISOR_TOKEN) that never leaves the container.
import fs from 'node:fs';

const OPTIONS = process.env.KINBOARD_OPTIONS_FILE || '/data/options.json';
const CONFIG_FILE = process.env.KINBOARD_ADDON_CONFIG || '/config/kinboard.config.json';

function fail(message) {
  console.error(`[kinboard] ${message}`);
  process.exit(1);
}

let options = {};
try { options = JSON.parse(fs.readFileSync(OPTIONS, 'utf8')); } catch { fail(`cannot read ${OPTIONS}`); }

const token = String(options.token || '').trim();
if (token.length < 16) fail('set a token of at least 16 characters in the app configuration (for example the output of "openssl rand -hex 16").');

let raw = {};
const inline = String(options.config || '').trim();
try {
  if (inline) raw = JSON.parse(inline);
  else if (fs.existsSync(CONFIG_FILE)) raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  else console.warn(`[kinboard] no configuration: add it in the app options or in ${CONFIG_FILE}. Showing the weather only.`);
} catch (err) {
  // Only the parser message: the configuration may contain secret calendar links.
  fail(`the configuration is not valid JSON (${String(err.message).replace(/".*$/, '').slice(0, 120)}).`);
}
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('the configuration must be a JSON object.');

// Secrets live in their own password fields, so the configuration itself can be shared or copied safely.
const googleKey = String(options.google_key || '').trim();
if (googleKey && raw.google) raw.google.key = googleKey;

// Home Assistant through the Supervisor proxy, unless the configuration names another instance.
const supervisor = process.env.SUPERVISOR_TOKEN;
if (supervisor && (!raw.homeassistant || !raw.homeassistant.url || raw.homeassistant.url === 'supervisor')) {
  raw.homeassistant = { url: 'http://supervisor/core', token: supervisor };
}

process.env.KINBOARD_CONFIG = JSON.stringify(raw);
process.env.KINBOARD_TOKEN = token;
process.env.PORT = process.env.PORT || '8080';
console.log(`[kinboard] starting${raw.homeassistant ? ' (connected to Home Assistant)' : ''}`);
await import('../server.js');

// Publishes the menu to Home Assistant as sensor.kinboard_menu, so automations
// and bots can use it (for example a /menu command). The state is today's meal;
// the attributes hold today, tomorrow and the whole week. Home Assistant forgets
// states set this way on restart, so the sensor is refreshed every 10 minutes.
if (supervisor) {
  const { loadConfig } = await import('../src/config.js');
  const { getData } = await import('../src/data.js');
  const { addDays } = await import('../src/time.js');
  const { menuFor } = await import('../src/data.js');
  const { panelMenuFor } = await import('../src/sources/googlePanel.js');
  const cfg = loadConfig();
  const meal = (labels, m) => !m ? { note: '' } : m.courses
    ? Object.fromEntries(labels.map((l, i) => [l.toLowerCase(), m.courses[i] || ''])) : { note: m.note || '' };
  const publish = async () => {
    try {
      const d = await getData(cfg);
      if (!d.menu) return;
      const { labels, week } = d.menu;
      const byDate = Object.fromEntries(week.map(w => [w.date, w]));
      const tomorrow = addDays(d.today, 1);
      const t = d.menu.today;
      const state = (t?.courses ? labels.map((l, i) => t.courses[i] && `${l}: ${t.courses[i]}`).filter(Boolean).join(' · ') : t?.note || '') || '—';
      const attributes = {
        friendly_name: 'Kinboard menu', icon: 'mdi:silverware-fork-knife', labels,
        today: { date: d.today, ...meal(labels, t) },
        // On Sundays tomorrow is already in next week, outside d.menu.week.
        tomorrow: { date: tomorrow, ...meal(labels, byDate[tomorrow] || (cfg.menu ? menuFor(cfg.menu, tomorrow) : panelMenuFor(d.sheetMenu, tomorrow))) },
        week: week.map(w => ({ date: w.date, ...meal(labels, w) })),
      };
      const res = await fetch('http://supervisor/core/api/states/sensor.kinboard_menu', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { authorization: `Bearer ${supervisor}`, 'content-type': 'application/json' },
        body: JSON.stringify({ state: state.slice(0, 250), attributes }),
      });
      if (!res.ok) console.error(`[kinboard] menu sensor: HTTP ${res.status}`);
    } catch (err) { console.error('[kinboard] menu sensor:', String(err.message || err).slice(0, 200)); }
  };
  setTimeout(publish, 5000);
  setInterval(publish, 10 * 60 * 1000);
}
