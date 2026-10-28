// Standalone server for Docker, a NAS, a Raspberry Pi or `npm start`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nodeAdapter } from './src/handler.js';
import { loadConfig } from './src/config.js';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const port = Number(process.env.PORT) || 8080;

const cfg = loadConfig();
if (!cfg.token) console.warn('[kinboard] KINBOARD_TOKEN is not set: the API will refuse every request.');

http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname === '/healthz') { res.writeHead(200); return res.end('ok'); }
    if (pathname.startsWith('/api/')) return await nodeAdapter(req, res);
    const file = path.normalize(path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500);
    res.end('error');
  }
}).listen(port, () => console.log(`[kinboard] listening on http://localhost:${port}`));
