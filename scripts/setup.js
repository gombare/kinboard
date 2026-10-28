// Interactive setup: asks a few questions and writes kinboard.config.json, .env and kindle/kinboard/config.sh.
//   npm run setup
// Secrets (calendar links, tokens) go to .env, never into the config file.
import fs from 'node:fs';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';

const rl = readline.createInterface({ input, output, terminal: false });
// The async iterator buffers lines, so answers can also be piped in (handy for scripted installs).
const lines = rl[Symbol.asyncIterator]();
const root = new URL('..', import.meta.url).pathname;
const file = name => `${root}${name}`;

let lang = 'en';
const T = (en, it) => (lang === 'it' ? it : en);
async function ask(q, def = '') {
  output.write(`${q}${def ? ` [${def}]` : ''}: `);
  const { value, done } = await lines.next();
  if (done) throw new Error('input closed');
  const a = String(value).trim();
  return a || def;
}
async function yes(q, def = true) {
  const a = (await ask(`${q} (${def ? 'Y/n' : 'y/N'})`)).toLowerCase();
  return a ? ['y', 'yes', 's', 'si', 'sì'].includes(a) : def;
}
async function choose(q, options) {
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o}`));
  for (;;) {
    const n = Number(await ask(q, '1'));
    if (n >= 1 && n <= options.length) return n - 1;
  }
}
const list = s => s.split(',').map(x => x.trim()).filter(Boolean);

async function geocode(name) {
  const q = new URLSearchParams({ name, count: '5', language: lang, format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { signal: AbortSignal.timeout(10000) });
  return (await res.json()).results || [];
}

async function main() {
  lang = (await ask('Language / Lingua (en/it)', 'it')).startsWith('it') ? 'it' : 'en';
  console.log(T('\nKinboard setup. Press Enter to accept the value in brackets, or leave a field empty to skip it.\n',
    '\nConfigurazione di Kinboard. Premi Invio per accettare il valore tra parentesi, o lascia vuoto per saltare.\n'));

  for (const f of ['kinboard.config.json', '.env']) {
    if (fs.existsSync(file(f)) && !(await yes(T(`${f} exists. Overwrite it?`, `${f} esiste già. Sovrascriverlo?`), false))) { rl.close(); return; }
  }

  const cfg = { language: lang }, env = { KINBOARD_TOKEN: crypto.randomBytes(16).toString('hex') };

  // --- Weather and time zone from the town name ---
  if (await yes(T('Show the weather?', 'Mostrare il meteo?'))) {
    for (;;) {
      const town = await ask(T('Town for the weather (e.g. London)', 'Città per il meteo (es. Roma)'));
      if (!town) { cfg.weather = { enabled: false }; break; }
      let found = [];
      try { found = await geocode(town); } catch { console.log(T('Could not reach the geocoding service.', 'Servizio di ricerca località non raggiungibile.')); }
      if (!found.length) {
        console.log(T('Not found. Enter coordinates by hand (look them up on a map).', 'Non trovata. Inserisci le coordinate a mano (le trovi su una mappa).'));
        cfg.location = { name: town, latitude: Number(await ask('Latitude')), longitude: Number(await ask('Longitude')) };
        cfg.timezone = await ask(T('Time zone (e.g. Europe/London)', 'Fuso orario (es. Europe/Rome)'), Intl.DateTimeFormat().resolvedOptions().timeZone);
        break;
      }
      const i = await choose(T('Which one?', 'Quale?'), found.map(r => [r.name, r.admin1, r.country].filter(Boolean).join(', ')));
      const r = found[i];
      cfg.location = { name: r.name, latitude: r.latitude, longitude: r.longitude };
      cfg.timezone = r.timezone;
      break;
    }
  } else cfg.weather = { enabled: false };
  if (!cfg.timezone) cfg.timezone = await ask(T('Time zone', 'Fuso orario'), Intl.DateTimeFormat().resolvedOptions().timeZone);
  cfg.units = (await yes(T('Use °F and mph?', 'Usare °F e mph?'), false)) ? 'imperial' : 'metric';

  // --- Calendars ---
  console.log(T(
    '\nCalendars: paste an iCal (.ics) link for each one.\n  Google: Settings → the calendar → Integrate calendar → "Secret address in iCal format"\n  iCloud: share the calendar → Public calendar · Outlook: Settings → Shared calendars → Publish',
    '\nCalendari: incolla un link iCal (.ics) per ciascuno.\n  Google: Impostazioni → il calendario → Integra calendario → "Indirizzo segreto in formato iCal"\n  iCloud: condividi → Calendario pubblico · Outlook: Impostazioni → Calendari condivisi → Pubblica'));
  cfg.calendars = [];
  for (let n = 1; ; n++) {
    const url = await ask(T(`Calendar ${n} link (empty = done)`, `Link calendario ${n} (vuoto = finito)`));
    if (!url) break;
    const label = await ask(T('Short label shown before its events (e.g. ME, FAM; empty = none)', 'Etichetta breve davanti agli eventi (es. M, FAM; vuoto = nessuna)'));
    env[`CALENDAR_${n}`] = url;
    cfg.calendars.push({ label, ics: `\${CALENDAR_${n}}` });
  }

  // --- To-do list ---
  const t = await choose(T('To-do list', 'Lista delle cose da fare'), [T('None', 'Nessuna'), 'Google Tasks', 'Todoist', 'Home Assistant']);
  if (t === 2) {
    env.TODOIST_TOKEN = await ask(T('Todoist API token (Settings → Integrations → Developer)', 'Token API Todoist (Impostazioni → Integrazioni → Sviluppatore)'));
    cfg.tasks = { provider: 'todoist', token: '${TODOIST_TOKEN}', filter: await ask(T('Todoist filter', 'Filtro Todoist'), 'today | overdue') };
  }
  if (t === 3) {
    cfg.homeassistant = { url: await ask('Home Assistant URL', 'http://homeassistant.local:8123'), token: '${HOMEASSISTANT_TOKEN}' };
    env.HOMEASSISTANT_TOKEN = await ask(T('Long-lived access token (Profile → Security)', 'Token di accesso a lunga durata (Profilo → Sicurezza)'));
    cfg.tasks = { provider: 'homeassistant', entity: await ask(T('To-do entity', 'Entità della lista'), 'todo.shopping_list') };
  }

  if (t === 1 || await yes(T('Show birthdays from your Google contacts? (needs the Google script, see README)', 'Mostrare i compleanni dai contatti Google? (serve lo script Google, vedi README)'), false)) {
    console.log(T('Install apps-script/Code.gs first (README → Google bridge), then paste its /exec URL and KEY.', 'Prima installa apps-script/Code.gs (README → Collegamento Google), poi incolla URL /exec e KEY.'));
    env.GOOGLE_SCRIPT_URL = await ask('URL /exec');
    env.GOOGLE_SCRIPT_KEY = await ask('KEY');
    // Birthdays travel with the script's calendar events: if your calendars already come from iCal links,
    // set CALENDARS = [] in Code.gs so they are not read twice.
    cfg.google = { url: '${GOOGLE_SCRIPT_URL}', key: '${GOOGLE_SCRIPT_KEY}', calendars: true, tasks: t === 1 };
    if (cfg.calendars.length) console.log(T('Tip: in Code.gs set CALENDARS = [] — your calendars already come from the iCal links.', 'Consiglio: in Code.gs imposta CALENDARS = [] — i calendari arrivano già dai link iCal.'));
    if (t === 1) cfg.tasks = { provider: 'google' };
  }

  // --- Menu and bin days ---
  const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const NAMES = T('Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 'Lunedì,Martedì,Mercoledì,Giovedì,Venerdì,Sabato,Domenica').split(',');
  if (await yes(T('Add a weekly meal plan?', 'Aggiungere il menù della settimana?'), false)) {
    const labels = list(await ask(T('Meals, comma separated', 'Pasti, separati da virgola'), T('Lunch, Dinner', 'Pranzo, Cena')));
    const week = {};
    for (let i = 0; i < 7; i++) {
      const v = list(await ask(`${NAMES[i]} — ${labels.join(', ')}`));
      if (v.length) week[DAYS[i]] = v;
    }
    cfg.menu = { labels, startDate: new Date().toISOString().slice(0, 10), weeks: [week] };
  }
  if (await yes(T('Add bin-collection reminders (shown in the evening)?', 'Aggiungere il promemoria della differenziata (la sera)?'), false)) {
    console.log(T('For each day, what is collected that day (comma separated, empty = nothing).', 'Per ogni giorno, cosa raccolgono quel giorno (separato da virgole, vuoto = niente).'));
    const schedule = {};
    for (let i = 0; i < 7; i++) {
      const v = list(await ask(NAMES[i]));
      if (v.length) schedule[DAYS[i]] = v;
    }
    cfg.waste = { from: 20, until: 6, schedule };
  }

  // --- Write files ---
  fs.writeFileSync(file('kinboard.config.json'), `${JSON.stringify(cfg, null, 2)}\n`);
  fs.writeFileSync(file('.env'), `${Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')}\n`, { mode: 0o600 });

  const server = await ask(T('\nAddress the Kindle will use to reach the server (e.g. https://my-kinboard.vercel.app or http://192.168.1.10:8080)', '\nIndirizzo con cui il Kindle raggiungerà il server (es. https://mio-kinboard.vercel.app o http://192.168.1.10:8080)'));
  if (server) {
    const sh = fs.readFileSync(file('kindle/kinboard/config.sh'), 'utf8')
      .replace(/^KINBOARD_URL=.*$/m, `KINBOARD_URL="${server.replace(/\/$/, '')}"`)
      .replace(/^TOKEN=.*$/m, `TOKEN="${env.KINBOARD_TOKEN}"`);
    fs.mkdirSync(file('kindle-ready/kinboard'), { recursive: true });
    fs.writeFileSync(file('kindle-ready/kinboard/config.sh'), sh);
    fs.copyFileSync(file('kindle/kinboard/watcher.sh'), file('kindle-ready/kinboard/watcher.sh'));
    fs.mkdirSync(file('kindle-ready/documents'), { recursive: true });
    for (const f of fs.readdirSync(file('kindle/documents'))) fs.copyFileSync(file(`kindle/documents/${f}`), file(`kindle-ready/documents/${f}`));
  }

  console.log(T('\nDone. Written: kinboard.config.json, .env', '\nFatto. Creati: kinboard.config.json, .env') + (server ? ', kindle-ready/' : ''));
  console.log(T('Docker: docker compose up -d --build', 'Docker: docker compose up -d --build'));
  console.log(T('Vercel: add these environment variables (they are secret, do not share them):', 'Vercel: aggiungi queste variabili d\'ambiente (sono segrete, non condividerle):'));
  console.log(`  KINBOARD_CONFIG=${JSON.stringify(cfg)}`);
  for (const k of Object.keys(env)) console.log(`  ${k}=… (${T('see .env', 'vedi .env')})`);
  if (server) console.log(T('Kindle: copy the contents of kindle-ready/ to the root of the Kindle drive.', 'Kindle: copia il contenuto di kindle-ready/ nella radice del Kindle.'));
  console.log(T(`Panel: ${server || '<server>'}/?token=<KINBOARD_TOKEN from .env>`, `Pannello: ${server || '<server>'}/?token=<KINBOARD_TOKEN da .env>`));
  rl.close();
}

main().catch(err => { console.error(err); rl.close(); process.exit(1); });
