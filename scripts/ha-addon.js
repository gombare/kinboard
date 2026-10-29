// Entry point of the Home Assistant app (add-on). Reads the app options, connects
// Kinboard to Home Assistant through the Supervisor proxy and starts the server.
//
// Options (/data/options.json):
//   token   the KINBOARD_TOKEN the Kindle sends (at least 16 characters)
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
