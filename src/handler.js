// Platform-independent API. server.js (Docker / Node) and api/*.js (Vercel) are thin adapters around it.
import crypto from 'node:crypto';
import { loadConfig } from './config.js';
import { getData, resetCache } from './data.js';
import { completeTask } from './sources/tasks.js';
import { clientStrings } from './i18n.js';
import { ICONS } from './icons.js';
import { renderScreen } from './render.js';

const json = (status, body) => ({ status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) });

function tokenOk(cfg, given) {
  const a = Buffer.from(String(given || '')), b = Buffer.from(cfg.token);
  return b.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));

export async function handle({ method = 'GET', path, query, form = {} }) {
  const cfg = loadConfig();
  if (!cfg.token) return json(500, { ok: false, error: 'KINBOARD_TOKEN is not set on the server.' });
  // "t" is accepted as a short alias, convenient in the Kindle script.
  if (!tokenOk(cfg, query.get('token') || query.get('t') || form.token)) return json(403, { ok: false, error: 'bad token' });

  try {
    if (path === '/api/data' && method === 'GET') {
      const data = await getData(cfg, Date.now(), { fresh: query.get('fresh') === '1' });
      return json(200, { ok: true, ...data, ui: { strings: clientStrings(cfg.language), icons: ICONS } });
    }
    if (path === '/api/screen' && method === 'GET') {
      const data = await getData(cfg);
      const png = await renderScreen(data, cfg, {
        battery: num(query.get('battery') ?? query.get('b')),
        charging: (query.get('charging') ?? query.get('c')) === '1',
      });
      return { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'no-store' }, body: png };
    }
    if (path === '/api/task' && method === 'POST') {
      if (!form.id || String(form.id).length > 200) return json(400, { ok: false, error: 'missing task id' });
      if (!cfg.demo) await completeTask(cfg, String(form.id));
      resetCache();
      return json(200, { ok: true });
    }
    return json(404, { ok: false, error: 'not found' });
  } catch (err) {
    console.error('[kinboard]', err);
    return json(502, { ok: false, error: String(err.message || err).slice(0, 300) });
  }
}

// Reads an x-www-form-urlencoded or JSON body from a Node request.
export async function readForm(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) for await (const chunk of req) { raw += chunk; if (raw.length > 10000) break; }
  if ((req.headers['content-type'] || '').includes('json')) { try { return JSON.parse(raw); } catch { return {}; } }
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function nodeAdapter(req, res, path) {
  const url = new URL(req.url, 'http://localhost');
  const form = req.method === 'POST' ? await readForm(req) : {};
  const out = await handle({ method: req.method, path: path || url.pathname, query: url.searchParams, form });
  res.writeHead(out.status, out.headers);
  res.end(out.body);
}
