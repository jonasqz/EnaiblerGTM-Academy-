'use strict';
// secret-drop: one file behind a shared secret. No dependencies, Node >= 20.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const env = process.env;
const PORT = Number(env.PORT || 3000);
const SECRET = env.SHARE_SECRET || '';
const FILE_PATH = env.FILE_PATH || '/data/file';
const DOWNLOAD_NAME = env.DOWNLOAD_NAME || path.basename(FILE_PATH);
const SENDER = env.SENDER_NAME || 'Jonas';
const NOTE = env.NOTE || '';
const EVENTS_FILE = env.EVENTS_FILE || '';
const TRUST_PROXY = env.TRUST_PROXY !== 'false';
const MAX_ATTEMPTS = Number(env.MAX_ATTEMPTS || 10); // per IP and 15 minutes

if (!SECRET) {
  console.error('SHARE_SECRET is not set. Refusing to start.');
  process.exit(1);
}
if (!fs.existsSync(FILE_PATH)) console.warn(`warning: ${FILE_PATH} does not exist yet`);

// Tokens only bridge "secret accepted" to the download request, so a key per process is enough.
const TOKEN_KEY = crypto.randomBytes(32);
const PUBLIC_DIR = path.join(__dirname, 'public');
const STATIC = {
  '/static/style.css': 'text/css; charset=utf-8',
  '/static/app.js': 'text/javascript; charset=utf-8',
  '/static/game.js': 'text/javascript; charset=utf-8',
};
const CLIENT_EVENTS = new Set(['declined', 'game_start', 'game_over', 'game_win', 'game_exit']);
const BOT = /bot|crawl|spider|preview|slack|whatsapp|telegram|linkedin|facebookexternalhit|discord|skype|curl|wget|headless/i;

const sha = (s) => crypto.createHash('sha256').update(s).digest();
const sign = (s) => crypto.createHmac('sha256', TOKEN_KEY).update(s).digest('base64url');

function secretMatches(given) {
  // Hash both sides so timingSafeEqual sees equal lengths and the length leaks nothing.
  return crypto.timingSafeEqual(sha(String(given)), sha(SECRET));
}

function makeToken() {
  const exp = String(Date.now() + 5 * 60_000);
  return `${exp}.${sign(exp)}`;
}

function tokenValid(token) {
  const [exp, sig] = String(token || '').split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

function clientIp(req) {
  const fwd = TRUST_PROXY && req.headers['x-forwarded-for'];
  return (fwd ? String(fwd).split(',')[0] : req.socket.remoteAddress || '').trim();
}

// Tracking params a link may carry: ?to=Anna&ref=li-42&utm_source=linkedin
function trackingParams(search) {
  const out = {};
  for (const [k, v] of new URLSearchParams(search)) {
    if (k === 'to' || k === 'ref' || k.startsWith('utm_')) out[k.slice(0, 40)] = v.slice(0, 100);
  }
  return out;
}

function track(event, req, params, extra) {
  const ua = String(req.headers['user-agent'] || '');
  const line = JSON.stringify({
    t: new Date().toISOString(),
    event,
    ...params,
    ...extra,
    // Pseudonymous visitor id: same person, same id, but no IP in the log.
    visitor: sha(clientIp(req) + ua + SECRET).toString('hex').slice(0, 12),
    bot: BOT.test(ua) || undefined,
  });
  console.log(line);
  if (EVENTS_FILE) fs.appendFile(EVENTS_FILE, line + '\n', () => {});
}

const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { count: 1, reset: now + 15 * 60_000 });
    return false;
  }
  a.count++;
  return a.count > MAX_ATTEMPTS;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, a] of attempts) if (a.reset < now) attempts.delete(ip);
}, 60_000).unref();

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

function fileSize() {
  try {
    return fs.statSync(FILE_PATH).size;
  } catch {
    return null;
  }
}

function page(params) {
  const to = params.to ? `, ${params.to}` : '';
  const size = fileSize();
  const title = `${SENDER} will eine Datei mit dir teilen`;
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="Geschützt mit einem Shared Secret. Oder du spielst stattdessen Space Aliens.">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Ctext y=%22.9em%22 font-size=%2290%22%3E%F0%9F%91%BE%3C/text%3E%3C/svg%3E">
<link rel="stylesheet" href="/static/style.css">
</head>
<body>
<main class="card" id="card">
  <p class="eyebrow">🔒 Geteilte Datei</p>
  <h1>Hey${esc(to)}! ${esc(SENDER)} will eine Datei mit dir teilen.</h1>
  ${NOTE ? `<p class="note">${esc(NOTE)}</p>` : ''}
  <div class="file">
    <span class="file-icon" aria-hidden="true">📄</span>
    <span class="file-name">${esc(DOWNLOAD_NAME)}</span>
    ${size == null ? '' : `<span class="file-size">${esc(humanSize(size))}</span>`}
  </div>

  <section id="step-ask">
    <p class="question">Hast du das Shared Secret?</p>
    <div class="actions">
      <button class="btn btn-primary" id="yes" type="button">Ja, hab ich</button>
      <button class="btn btn-ghost" id="no" type="button">Nein. Stattdessen Space Aliens spielen 👾</button>
    </div>
  </section>

  <form id="step-secret" hidden>
    <label for="secret">Shared Secret</label>
    <div class="row">
      <input id="secret" name="secret" type="password" autocomplete="off" required>
      <button class="btn btn-primary" type="submit">Entsperren</button>
    </div>
    <p class="error" id="error" role="alert" hidden></p>
    <button class="link" id="no-2" type="button">Hab ich doch nicht. Lieber Aliens abschießen.</button>
  </form>

  <section id="step-done" hidden>
    <p class="question">✅ Passt. Dein Download startet.</p>
    <p class="small">Falls nicht: <a id="again" href="#">hier klicken</a>. Der Link gilt 5 Minuten.</p>
  </section>
</main>
<p class="footer">Passwortgeschützt. Kein Tracking-Cookie. Nur ein Raumschiff im Hangar.</p>
<script src="/static/game.js"></script>
<script src="/static/app.js"></script>
</body>
</html>`;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...headers,
  });
  res.end(body);
}

const json = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });

function readJson(req, limit = 4096) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /' || route === 'HEAD /') {
    const params = trackingParams(url.search);
    if (req.method === 'GET') track('view', req, params);
    return send(res, 200, page(params), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  }

  if (req.method === 'GET' && STATIC[url.pathname]) {
    return fs.readFile(path.join(PUBLIC_DIR, path.basename(url.pathname)), (err, data) =>
      err ? send(res, 404, 'Not found') : send(res, 200, data, { 'Content-Type': STATIC[url.pathname], 'Cache-Control': 'public, max-age=300' }),
    );
  }

  if (route === 'POST /unlock') {
    const ip = clientIp(req);
    const body = await readJson(req);
    const params = trackingParams(String(body.q || ''));
    if (rateLimited(ip)) {
      track('unlock_blocked', req, params);
      return json(res, 429, { ok: false, error: 'Zu viele Versuche. Probier es in 15 Minuten nochmal.' });
    }
    if (!secretMatches(body.secret || '')) {
      track('unlock_failed', req, params);
      return json(res, 401, { ok: false, error: 'Das war leider nicht das Secret.' });
    }
    attempts.delete(ip);
    track('unlock_ok', req, params);
    const query = new URLSearchParams(params);
    query.set('k', makeToken());
    return json(res, 200, { ok: true, url: `/download?${query}` });
  }

  if (route === 'GET /download') {
    if (!tokenValid(url.searchParams.get('k'))) {
      return send(res, 403, 'Link abgelaufen. Bitte gib das Secret nochmal ein.', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    return fs.stat(FILE_PATH, (err, stat) => {
      if (err) return send(res, 404, 'Datei nicht gefunden.', { 'Content-Type': 'text/plain; charset=utf-8' });
      track('download', req, trackingParams(url.search));
      const ascii = DOWNLOAD_NAME.replace(/[^\x20-\x7e]|["\\]/g, '_');
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(DOWNLOAD_NAME)}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
      });
      fs.createReadStream(FILE_PATH).pipe(res);
    });
  }

  if (route === 'POST /e') {
    const body = await readJson(req, 1024);
    if (CLIENT_EVENTS.has(body.event)) {
      const score = Number.isFinite(body.score) ? Math.round(body.score) : undefined;
      track(body.event, req, trackingParams(String(body.q || '')), { score });
    }
    return send(res, 204, null);
  }

  if (route === 'GET /healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });

  send(res, 404, 'Not found', { 'Content-Type': 'text/plain' });
});

server.listen(PORT, () => console.log(`secret-drop on :${PORT}, serving ${FILE_PATH} as "${DOWNLOAD_NAME}"`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
