// WOTG Teleprompter Recorder — receives video pieces from the phone while recording
// and joins them into one file when the recording ends. No dependencies (plain Node).
//
//   PUT  /chunk?id=<recId>&seq=<n>          body = one video piece
//   GET  /status?id=<recId>                  which pieces arrived (for resuming)
//   POST /finish?id=<recId>&total=<n>&ext=mp4&name=<file-name>
//   GET  /recordings                         list finished videos
//   GET  /recordings/<file>?token=...        download / play a video
//   GET  /health
//   GET  /scripts                            list saved teleprompter scripts
//   GET  /scripts/<id>                       one script {id,title,text,updated}
//   PUT  /scripts/<id>                       save/replace a script (JSON body)
//   DELETE /scripts/<id>                     move a script to .trash (never really deleted)
//
// Every request except /health needs the token (header X-TP-Token or ?token=).

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '9470', 10);
const DIR = process.env.REC_DIR || path.join(process.env.HOME, 'teleprompter-recordings');
const TOKEN = (process.env.TP_TOKEN || '').trim();
const MAX_CHUNK = 95 * 1024 * 1024; // Cloudflare free plan caps a request at 100 MB
const PARTS = path.join(DIR, '.incoming');
const SCRIPTS = process.env.SCRIPTS_DIR || path.join(process.env.HOME, 'repos', 'teleprompter-scripts');
fs.mkdirSync(path.join(SCRIPTS, '.trash'), { recursive: true });
const okScriptId = id => /^[A-Za-z0-9_-]{3,80}$/.test(id || '');

async function readBody(req, max) {
  let size = 0; const parts = [];
  for await (const c of req) { size += c.length; if (size > max) throw new Error('too big'); parts.push(c); }
  return Buffer.concat(parts).toString('utf8');
}
async function listScripts() {
  const files = (await fsp.readdir(SCRIPTS)).filter(f => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try { const j = JSON.parse(await fsp.readFile(path.join(SCRIPTS, f), 'utf8')); out.push({ id: j.id, title: j.title, updated: j.updated }); } catch {}
  }
  return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
async function saveScript(id, body) {
  const j = JSON.parse(body);
  const script = { id, title: String(j.title || 'Untitled').slice(0, 200), text: String(j.text || ''), updated: Number(j.updated) || Date.now() };
  const file = path.join(SCRIPTS, id + '.json');
  // keep the newest version if two devices save at once
  try { const old = JSON.parse(await fsp.readFile(file, 'utf8')); if ((old.updated || 0) > script.updated) return old; } catch {}
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fsp.writeFile(tmp, JSON.stringify(script, null, 1));
  await fsp.rename(tmp, file);
  // readable copy of the words, named by title
  const txtName = (cleanName(script.title) || id) + ' [' + id + '].txt';
  for (const f of await fsp.readdir(SCRIPTS)) if (f.endsWith(' [' + id + '].txt') && f !== txtName) await fsp.rm(path.join(SCRIPTS, f), { force: true });
  await fsp.writeFile(path.join(SCRIPTS, txtName), script.title + '\n\n' + script.text);
  return script;
}

if (!TOKEN) { console.error('TP_TOKEN is not set'); process.exit(1); }
fs.mkdirSync(PARTS, { recursive: true });

const okId = id => /^[A-Za-z0-9_-]{6,64}$/.test(id || '');
const okSeq = s => /^\d{1,7}$/.test(s || '');
const cleanName = n => (n || '').replace(/[^A-Za-z0-9 _.-]/g, '').replace(/\.+/g, '.').trim().slice(0, 100);
const pad = n => String(n).padStart(7, '0');

function tokenOk(req, url) {
  const given = req.headers['x-tp-token'] || url.searchParams.get('token') || '';
  const a = Buffer.from(String(given)), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-TP-Token');
  res.setHeader('Access-Control-Max-Age', '86400');
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

async function receivedSeqs(id) {
  try {
    const files = await fsp.readdir(path.join(PARTS, id));
    return files.filter(f => f.endsWith('.part')).map(f => parseInt(f, 10)).sort((a, b) => a - b);
  } catch { return []; }
}
async function readMeta(id) {
  try { return JSON.parse(await fsp.readFile(path.join(PARTS, id + '.done.json'), 'utf8')); } catch { return null; }
}

async function putChunk(req, res, id, seq) {
  const dir = path.join(PARTS, id);
  await fsp.mkdir(dir, { recursive: true });
  const final = path.join(dir, pad(seq) + '.part');
  const tmp = final + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  let size = 0, tooBig = false;
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp);
    req.on('data', c => { size += c.length; if (size > MAX_CHUNK && !tooBig) { tooBig = true; req.unpipe(out); out.destroy(); resolve(); } });
    req.on('aborted', () => reject(new Error('aborted')));
    out.on('error', reject);
    out.on('finish', resolve);
    req.pipe(out);
  }).catch(async e => { await fsp.rm(tmp, { force: true }); throw e; });
  if (tooBig || size === 0) { await fsp.rm(tmp, { force: true }); return json(res, 413, { error: tooBig ? 'piece too big' : 'empty piece' }); }
  await fsp.rename(tmp, final); // re-sending the same piece just replaces it
  json(res, 200, { ok: true, seq, bytes: size });
}

const finishing = new Map();
async function finish(id, total, ext, name) {
  const done = await readMeta(id);
  if (done) return { ok: true, ...done };
  const have = new Set(await receivedSeqs(id));
  const missing = [];
  for (let i = 0; i < total; i++) if (!have.has(i)) missing.push(i);
  if (missing.length) return { ok: false, missing: missing.slice(0, 500) };

  let base = cleanName(name) || ('teleprompter-' + id);
  let file = `${base}.${ext}`, n = 2;
  while (fs.existsSync(path.join(DIR, file))) file = `${base}-${n++}.${ext}`;
  const target = path.join(DIR, file), tmp = target + '.joining';
  const out = fs.createWriteStream(tmp);
  for (let i = 0; i < total; i++) {
    await new Promise((resolve, reject) => {
      const inp = fs.createReadStream(path.join(PARTS, id, pad(i) + '.part'));
      inp.on('error', reject); inp.on('end', resolve);
      inp.pipe(out, { end: false });
    });
  }
  await new Promise((resolve, reject) => { out.on('error', reject); out.end(resolve); });
  await fsp.rename(tmp, target);
  const bytes = (await fsp.stat(target)).size;
  const meta = { file, bytes, pieces: total, finishedAt: new Date().toISOString() };
  await fsp.writeFile(path.join(PARTS, id + '.done.json'), JSON.stringify(meta));
  await fsp.rm(path.join(PARTS, id), { recursive: true, force: true });
  console.log(`[finish] ${file} ${(bytes / 1e6).toFixed(1)} MB from ${total} pieces`);
  return { ok: true, ...meta };
}

async function listRecordings() {
  const files = (await fsp.readdir(DIR)).filter(f => /\.(mp4|webm)$/.test(f));
  const rows = await Promise.all(files.map(async f => { const s = await fsp.stat(path.join(DIR, f)); return { file: f, bytes: s.size, modified: s.mtime.toISOString() }; }));
  return rows.sort((a, b) => b.modified.localeCompare(a.modified));
}

async function sendFile(req, res, file) {
  const p = path.join(DIR, file);
  if (path.dirname(p) !== DIR || !/\.(mp4|webm)$/.test(file) || !fs.existsSync(p)) return json(res, 404, { error: 'not found' });
  const size = (await fsp.stat(p)).size;
  const type = file.endsWith('.mp4') ? 'video/mp4' : 'video/webm';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) {
    const start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    const end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size, 'Content-Disposition': `inline; filename="${file}"` });
  fs.createReadStream(p).pipe(res);
}

http.createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url, 'http://x');
  const q = k => url.searchParams.get(k);
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (!tokenOk(req, url)) return json(res, 401, { error: 'wrong or missing token' });

    if (req.method === 'PUT' && url.pathname === '/chunk') {
      if (!okId(q('id')) || !okSeq(q('seq'))) return json(res, 400, { error: 'bad id or seq' });
      if (await readMeta(q('id'))) return json(res, 200, { ok: true, alreadyFinished: true });
      return await putChunk(req, res, q('id'), parseInt(q('seq'), 10));
    }
    if (req.method === 'GET' && url.pathname === '/status') {
      if (!okId(q('id'))) return json(res, 400, { error: 'bad id' });
      const meta = await readMeta(q('id'));
      return json(res, 200, { received: meta ? [] : await receivedSeqs(q('id')), finished: meta });
    }
    if (req.method === 'POST' && url.pathname === '/finish') {
      const id = q('id'), total = parseInt(q('total'), 10), ext = q('ext') === 'webm' ? 'webm' : 'mp4';
      if (!okId(id) || !(total > 0)) return json(res, 400, { error: 'bad id or total' });
      if (!finishing.has(id)) finishing.set(id, finish(id, total, ext, q('name')).finally(() => finishing.delete(id)));
      return json(res, 200, await finishing.get(id));
    }
    if (req.method === 'GET' && url.pathname === '/') {
      const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
      const tok = encodeURIComponent(q('token') || '');
      const rows = (await listRecordings()).map(r => {
        const href = `/recordings/${encodeURIComponent(r.file)}?token=${tok}`;
        return `<li><a href="${href}">${esc(r.file)}</a><span>${(r.bytes / 1e6).toFixed(0)} MB · ${new Date(r.modified).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span></li>`;
      }).join('') || '<li>No recordings yet.</li>';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>My Recordings</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:20px;max-width:700px}
h1{font-size:20px}ul{list-style:none;padding:0}li{background:#1d1d1d;border-radius:10px;padding:12px 14px;margin:8px 0;display:flex;flex-direction:column;gap:4px}
a{color:#7cb7ff;font-weight:600;text-decoration:none;word-break:break-all}span{font-size:12px;opacity:.6}</style>
<h1>🎬 My Teleprompter Recordings</h1><p style="font-size:13px;opacity:.6">Tap a video to play it. To save it, play it then use Share → Save Video.</p><ul>${rows}</ul>`);
    }
    if (url.pathname === '/scripts' && req.method === 'GET') return json(res, 200, { scripts: await listScripts() });
    if (url.pathname.startsWith('/scripts/')) {
      const id = decodeURIComponent(url.pathname.slice(9));
      if (!okScriptId(id)) return json(res, 400, { error: 'bad script id' });
      const file = path.join(SCRIPTS, id + '.json');
      if (req.method === 'GET') {
        try { return json(res, 200, JSON.parse(await fsp.readFile(file, 'utf8'))); } catch { return json(res, 404, { error: 'not found' }); }
      }
      if (req.method === 'PUT') return json(res, 200, { ok: true, script: await saveScript(id, await readBody(req, 5 * 1024 * 1024)) });
      if (req.method === 'DELETE') {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        try { await fsp.rename(file, path.join(SCRIPTS, '.trash', id + '.' + stamp + '.json')); } catch {}
        for (const f of await fsp.readdir(SCRIPTS)) if (f.endsWith(' [' + id + '].txt')) await fsp.rename(path.join(SCRIPTS, f), path.join(SCRIPTS, '.trash', f));
        return json(res, 200, { ok: true });
      }
    }
    if (req.method === 'GET' && url.pathname === '/recordings') return json(res, 200, { recordings: await listRecordings() });
    if (req.method === 'GET' && url.pathname.startsWith('/recordings/')) return await sendFile(req, res, decodeURIComponent(url.pathname.slice(12)));
    json(res, 404, { error: 'not found' });
  } catch (e) {
    console.error('[error]', req.method, url.pathname, e.message);
    if (!res.headersSent) json(res, 500, { error: e.message }); else res.end();
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Teleprompter recorder on 127.0.0.1:${PORT}, saving to ${DIR}`));
