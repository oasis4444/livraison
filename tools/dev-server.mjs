// Serveur de développement local : API (D1 émulé par SQLite) + fichiers statiques.
// Usage : node tools/dev-server.mjs   → http://localhost:8787
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createD1 } from '../tests/d1-shim.mjs';
import { handleApi, maintenance } from '../src/worker.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = { DB: createD1(join(root, 'migrations'), process.env.DB_FILE || join(root, 'dev.db')), PBKDF2_ITER: '10000', APP_VERSION: 'dev' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT || 8787);

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await handleApi(new Request(url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  if (p.endsWith('/')) p += 'index.html';
  let file = join(root, 'public', p);
  let data = await readFile(file).catch(() => null);
  if (!data) { file = join(root, 'public', 'index.html'); data = await readFile(file); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(data);
}).listen(port, () => console.log(`Alefa en local : http://localhost:${port}`));
setInterval(() => maintenance(env).catch(console.error), 3600e3);
