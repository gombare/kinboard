# Rebuild Kinboard with an AI assistant

Copy everything below the line into Claude, ChatGPT or another coding assistant (ideally one that can create files and run commands). It describes the whole project — goals, architecture, and the Kindle-specific details that took trial and error to discover — so the assistant can rebuild it from scratch, or build your own variant. You don't need to prepare anything: the assistant starts by asking you a few simple questions and tells you where to find each answer.

---

You are helping me build **Kinboard**: an old Amazon Kindle used as a fridge dashboard. Work step by step, create real files, run the tests you write, and show me a rendered preview before moving on. Reply in my language. Ask me only for things you cannot decide yourself (accounts, tokens, addresses); for everything else make a sensible choice and tell me.

## Start by interviewing me

Before writing any code, ask me the questions below **one small group at a time**, in plain words, with a one-line hint on where to find each answer. Accept "skip" for anything optional and choose a sensible default. Never ask for passwords; tokens and secret links go into a `.env` file, never into the config file or the chat transcript you summarise. At the end, show me a short summary of my answers and the generated `kinboard.config.json` (with secrets as `${NAME}` placeholders) and ask me to confirm.

1. **Basics** — language for the screen (English/Italian/other); my Kindle model and firmware (*Settings → Device options → Device info*); is it already jailbroken?
2. **Where the server runs** — Vercel (free, recommended if I have no home server), Docker on a home server/NAS, or both. If Docker: the server's address on my network.
3. **Weather** — my town. Look up its latitude, longitude and IANA time zone yourself (Open-Meteo geocoding: `https://geocoding-api.open-meteo.com/v1/search?name=<town>`), and show me the match to confirm. Metric or imperial?
4. **Calendars** — for each one: a short label (e.g. ME, FAM) and its iCal link. Tell me how to get it: Google → Settings → the calendar → *Integrate calendar* → "Secret address in iCal format"; iCloud → share → *Public calendar*; Outlook → Settings → Shared calendars → *Publish*; Home Assistant → the `calendar.*` entity.
5. **To-do list** — none, Google Tasks, Todoist (API token: *Settings → Integrations → Developer*, plus a filter such as `today | overdue`) or Home Assistant (URL, long-lived token from *Profile → Security*, `todo.*` entity). Birthdays from Google contacts? (Google Tasks and birthdays need the Apps Script bridge described below — walk me through installing it.)
6. **Meal plan** — skip, or the meal names (e.g. Lunch, Dinner) and what we eat each weekday; more than one rotating week is fine.
7. **Bin collection** — skip, or what is collected on each weekday; reminder hours (default 20:00 → 06:00).
8. **What to show** — the default screensaver sections (date, weather, bins, events, menu/tasks) and panel tabs (Home, Weather, Agenda, To do, Menu); anything to hide or reorder?

If I already have the Kinboard repository, you can instead tell me to run `npm run setup`, which asks the same questions and writes the files.

## What it does

1. **Kindle locked → the screensaver is the dashboard.** A 600×800 grayscale image with: date, weather (icon, temperature, min/max, feels-like, humidity, rain %, wind, next 3 days), the next appointments, today's menu, number of open tasks, a bin-collection box (evenings only), a low-battery banner. Refreshed every 15 minutes, paused at night.
2. **Kindle unlocked → an interactive web panel opens in the Kindle browser.** Tabs: Home (big clock, weather, upcoming events, menu, task count), Weather (now, next hours, next days), Agenda (events grouped by day), To do (tap to complete), Menu (the week, today highlighted).
3. **Everything optional and configured in one JSON file**, secrets in environment variables.

## Architecture

- **Server (Node.js 20+, ES modules)** with one platform-independent handler and two thin adapters: `server.js` (plain `http`, also serves `public/`, for Docker/NAS) and `api/*.js` (Vercel functions). Endpoints, all protected by a shared token (`?token=`, constant-time compare):
  - `GET /api/data` → JSON with everything the panel needs, plus UI strings and icon paths;
  - `GET /api/screen?battery=&charging=` → the screensaver PNG;
  - `POST /api/task` (form `id`) → complete a task.
- **Config**: `kinboard.config.json` or the `KINBOARD_CONFIG` env var (whole JSON, handy on Vercel); every string may contain `${ENV_NAME}`. Keys: `language`, `timezone`, `units`, `location {name, latitude, longitude}`, `weather.enabled`, `calendars [{label, ics} | {label, homeassistant: "calendar.x"}]`, `google {url, key, calendars, tasks}`, `homeassistant {url, token}`, `tasks {provider: google|todoist|homeassistant, …}`, `menu {labels, startDate, weeks[{mon:[lunch,dinner],…}], overrides{date: [..]|"note"}}`, `waste {from: 20, until: 6, schedule {mon:[…],…}}`, `screen {sections, maxEvents, lowBattery}`, `panel {views}`, `daysAhead`, `demo`. Drop sections/views whose source is missing.
- **Sources** (fetch in parallel with `Promise.allSettled`, cache 5 minutes, one failing source must not break the others):
  - Weather: Open-Meteo (no key) — current, 24 hourly, 6 daily values; map WMO codes to an icon name and a translated label.
  - iCal feeds: parse with `ical.js`; register VTIMEZONEs, expand RRULEs inside the window, apply RECURRENCE-ID exceptions, skip CANCELLED, treat floating times and all-day dates in the household time zone.
  - Google bridge: an Apps Script web app in the user's account (below).
  - Todoist API v1: `GET https://api.todoist.com/api/v1/tasks/filter?query=…` (paginate `next_cursor`), `POST /api/v1/tasks/{id}/close`, Bearer token.
  - Home Assistant REST: `GET /api/calendars/{entity}?start&end`; `POST /api/services/todo/get_items?return_response` and `/api/services/todo/update_item` (status completed), long-lived token.
  - Merge calendars, de-duplicate identical events, sort by start.
- **Time zones**: the server runs in UTC. Write small `Intl`-based helpers (local parts of an instant, zoned wall time → UTC with a DST re-check, day start, add days). Never rely on the server's or the Kindle's own zone.
- **Menu**: weeks rotate from the Monday of `startDate`; a per-date override wins.
- **Bin reminder**: from `from` (20:00) until midnight show *tomorrow's* collection ("put out tonight"), from midnight until `until` (06:00) show *today's*; nothing during the day.
- **Screensaver renderer**: `satori` (JSX-like object tree, every div `display:flex`) → SVG → `@resvg/resvg-js` → RGBA → convert to **8-bit grayscale PNG with `pngjs`** (colorType 0). Fonts: Roboto 400/700 woff from `@fontsource/roboto`, loaded with `fs.readFileSync(new URL('../node_modules/…', import.meta.url))` so Vercel's file tracer bundles them. Icons: Lucide SVG paths (ISC) embedded as base64 data-URI `<img>`. The date is the headline (no big clock: the image stays up for 15 minutes); show "updated HH:MM". When the bin box is shown, show one event fewer.
- **i18n**: one strings table per language (en, it) shared by the renderer and sent to the panel.
- **Demo mode**: `"demo": true` returns realistic sample data with no network, used by `scripts/preview.js` (render a PNG with `--lang`, `--time`, `--battery`) and for screenshots.
- **Setup wizard** `scripts/setup.js` (`npm run setup`): the interview above as a terminal questionnaire (read answers with the readline async iterator so they can also be piped in); geocodes the town with Open-Meteo; writes `kinboard.config.json`, `.env` (mode 600, includes a random `KINBOARD_TOKEN`) and a `kindle-ready/` folder with `config.sh` filled in; prints the Vercel variables. Never overwrite existing files without asking.

## The web panel (public/)

The Kindle browser is an **old WebKit**: write **ES5 only** (no arrow functions, `let`, `fetch`, promises, template literals), use `XMLHttpRequest`, layout with **tables and absolute positioning, no flexbox/grid**, pure black on white, big type, no animations. Viewport 600×800 with a bottom tab bar. The token arrives once as `?token=`; store it in `localStorage` and a cookie, then remove it from the address bar with `history.replaceState`. Keep the last good JSON in `localStorage` and show an "offline" banner if a refresh fails. Compute local time from the server's `now` and `tzOffset`, not from the Kindle clock. On Home, add events one by one while they still fit above the footer. Icons as `data:image/svg+xml` `<img>`s. Escape all text.

## The Kindle side (needs a jailbreak)

Jailbreak with the official guide at kindlemodding.org (WinterBreak for 5.17.x), then install the hotfix so that `.sh` **scriptlets** in `documents/` (with a `# Name:` header line) show up in the library and run on tap. Files: `/mnt/us/kinboard/watcher.sh`, `/mnt/us/kinboard/config.sh` (`KINBOARD_URL`, `TOKEN`, `INTERVAL=900`, `NIGHT_START=23`, `NIGHT_END=6`, `OPEN_ON_UNLOCK=1`, `EXIT_SECONDS=8`, `FULLSCREEN=0`), `documents/kinboard-start.sh`, `documents/kinboard-stop.sh`. Facts learned on a real device:

- Events: `lipc-wait-event -m com.lab126.powerd goingToScreenSaver,outOfScreenSaver,readyToSuspend,wakeupFromSuspend | while read ev rest; do …` (BusyBox `sh`).
- Draw with `eips -f -g image.png` **about 2 seconds after `goingToScreenSaver`** (the Kindle draws its own screensaver first), then refresh in the background. Before drawing, check `lipc-get-prop com.lab126.powerd state` is not `active`, otherwise the image ends up over the unlocked screen.
- Wi-Fi may be off after waking: `lipc-set-prop com.lab126.cmd wirelessEnable 1`, then poll `lipc-get-prop com.lab126.wifid cmState` for `CONNECTED` (up to ~30 s).
- Download with `curl -s -f -m 45` to a temp file, check the PNG signature, then move it into place; append `&battery=$(lipc-get-prop com.lab126.powerd battLevel)&charging=$(lipc-get-prop com.lab126.powerd isCharging)`.
- Timed wake-up: `lipc-set-prop -i com.lab126.powerd rtcWakeup <seconds>` is accepted during `readyToSuspend`. After a wake-up the Kindle may go back to sleep without another `readyToSuspend`, so also set the next alarm on `wakeupFromSuspend`, and as a fallback write `+<seconds>` to `/sys/class/rtc/rtc1/wakealarm` (or `rtc0`) unless an earlier alarm is already set. At night, sleep until `NIGHT_END`. Log every step to `/mnt/us/kinboard/log.txt` (trim it); this part still needs validation on more devices.
- On `outOfScreenSaver`: if the unlock came within `EXIT_SECONDS` of the lock, the user wants the normal Kindle — do nothing. Otherwise, if `lipc-get-prop com.lab126.appmgrd activeApp` is not already the browser, open the panel with `lipc-set-prop com.lab126.appmgrd start "app://com.lab126.browser?view=<URL>"`. (Do not try to repurpose the Kindle Store page: Amazon overwrites its cache whenever the device is online.)
- `lipc-set-prop com.lab126.pillow disableEnablePillow disable|enable` hides/shows the status bar; it does **not** remove the browser's address bar, which always stays.
- Write a PID file in `/tmp`, guard against two refreshes at once with a `mkdir` lock, and make the stop scriptlet kill the watcher and the `lipc-wait-event` child and re-enable pillow.
- Ship a tiny optional pair of scriptlets: keep the screen always on (`preventScreenSaver 1`) and back to normal (`0`).

## The Google bridge (apps-script/Code.gs)

A standalone Apps Script deployed as a **web app (execute as me, access: anyone)**, protected by a random key stored in Script Properties and created by a `setup()` function the user runs once from the editor (it also checks the calendars, creates the task list if missing and logs the key). Settings at the top: `CALENDARS [{id: 'primary' | '<id>@group.calendar.google.com', label}]`, `BIRTHDAYS`, `TASK_LIST`. `doGet(action=read, from, to)` returns `ContentService` JSON `{ok, events, tasks}` — timed events as epoch ms, all-day events as `startDate`/`endDate` strings. Birthdays need the advanced **Calendar** service: `Calendar.Events.list('primary', {eventTypes: ['birthday'], singleEvents: true, …})` (they are not visible through `CalendarApp`). Tasks need the advanced **Tasks** service. `doPost(action=complete, task)` marks the task completed. The server calls it with `fetch(…, {redirect: 'follow'})` (Apps Script answers with a redirect). After every code change the user must publish a *new version* of the same deployment so the URL stays the same.

## Deliverables and order of work

1. Config loader + time helpers + unit tests (`node --test`).
2. Sources one by one, each with a test that stubs `globalThis.fetch`.
3. Data aggregator (menu, bin reminder, cache) + handler + both adapters.
4. Renderer + `scripts/preview.js`; show me the PNG in English and Italian, day and evening, with and without the battery banner.
5. Web panel; screenshot all tabs at 600×800 with Playwright in demo mode.
6. Apps Script, Kindle scripts (`sh -n` them), Dockerfile (node:22-slim, non-root, healthcheck), `compose.yaml`, `vercel.json` (functions `api/*.js`, 30 s, 1 GB), `.env.example`, `.gitignore` (never commit the real config or `.env`).
7. Security pass before publishing: no personal data or secrets in the repo (grep for names, e-mails, tokens, calendar IDs, home coordinates), `.gitignore` covers `.env`, the real config and `kindle-ready/`, static file serving cannot escape `public/`, every page string is escaped, `npm audit` is clean.
8. README (what it is, why the jailbreak, server setup on Vercel and Docker, every config key, how to get iCal links from Google/iCloud/Outlook, Google bridge, Todoist, Home Assistant, Kindle install, security, limitations) and an MIT LICENSE crediting Lucide and Roboto.
9. Finally deploy a test instance and check `/api/data` and `/api/screen` with real data before touching the Kindle.
