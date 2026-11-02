'use strict';
// Zero-dependency web server: static files, JSON API, JSON-file storage.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runAction, stateFor, HttpError } = require('./workflow');
const { buildSeed } = require('./seed');

const ROOT = path.join(__dirname, '..');
loadEnv(path.join(ROOT, '.env'));
const PORT = Number(process.env.PORT) || 3120;
const DATA_DIR = path.resolve(ROOT, process.env.CRM_DATA_DIR || './data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PUBLIC = path.join(ROOT, 'public');
const UPLOAD_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const MAX_UPLOAD = 5 * 1024 * 1024;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.ico': 'image/x-icon' };

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

function loadDb() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) { const db = buildSeed(); saveDb(db); console.log('No data found – demo data created.'); return db; }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDb(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new HttpError(400, 'Invalid JSON.')); } });
    req.on('error', reject);
  });
}
function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

function createServer(db, persist = saveDb) {
  const userOf = req => db.users.find(u => u.id === req.headers['x-user-id']);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = decodeURIComponent(url.pathname);
      if (p === '/api/users' && req.method === 'GET') return send(res, 200, db.users);
      if (p === '/api/state' && req.method === 'GET') {
        const user = userOf(req); if (!user) throw new HttpError(401, 'Choose a demo user first.');
        return send(res, 200, stateFor(db, user));
      }
      if (p.startsWith('/api/action/') && req.method === 'POST') {
        const user = userOf(req);
        const payload = await readBody(req, 256 * 1024);
        const result = runAction(db, user, p.slice('/api/action/'.length), payload);
        persist(db);
        return send(res, 200, { ok: true, result });
      }
      if (p === '/api/upload' && req.method === 'POST') {
        if (!userOf(req)) throw new HttpError(401, 'Choose a demo user first.');
        const body = await readBody(req, MAX_UPLOAD * 1.4);
        const m = String(body.dataUrl || '').match(/^data:([\w/+.-]+);base64,(.+)$/);
        if (!m || !UPLOAD_TYPES[m[1]]) throw new HttpError(400, 'Only JPG, PNG, WebP images or PDF files can be uploaded.');
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length > MAX_UPLOAD) throw new HttpError(413, 'File is larger than 5 MB.');
        const name = crypto.randomUUID() + UPLOAD_TYPES[m[1]];
        fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
        return send(res, 200, { ok: true, url: '/uploads/' + name });
      }
      if (p.startsWith('/api/')) throw new HttpError(404, 'Not found.');
      if (p.startsWith('/uploads/')) {
        const f = path.join(UPLOAD_DIR, path.basename(p));
        return serveFile(res, f);
      }
      const f = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
      if (!f.startsWith(PUBLIC)) return send(res, 403, 'Forbidden', 'text/plain');
      return serveFile(res, f);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      send(res, status, { ok: false, error: status === 500 ? 'Unexpected server error.' : e.message });
    }
  });
}

if (require.main === module) {
  const db = loadDb();
  createServer(db).listen(PORT, () => console.log(`Chan Yew ERP (local demo mode) running at http://localhost:${PORT}`));
}

module.exports = { createServer, DB_FILE, DATA_DIR, saveDb };
