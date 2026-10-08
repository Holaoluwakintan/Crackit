// local test server: dist/ static + api/ functions (same layout as the Vercel deploy)
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const DIST = path.join(__dirname, 'app/dist'), API = path.join(__dirname, 'api');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain' };
http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  let p = decodeURIComponent(u.pathname);
  if (p === '/.well-known/assetlinks.json') p = '/api/assetlinks';
  if (p.startsWith('/api/')) {
    const f = path.join(API, p.slice(5).replace(/[^a-z-]/g, '') + '.js');
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('{}'); }
    req.query = u.query;
    const r = { setHeader: (k, v) => res.setHeader(k, v), status(c) { res.statusCode = c; return this; }, json(b) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(b)); return this; }, send(b) { res.end(b); return this; } };
    try { await require(f)(req, r); } catch (e) { res.statusCode = 500; res.end(String(e)); }
    return;
  }
  let fp = path.join(DIST, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', TYPES[path.extname(fp)] || 'application/octet-stream');
  fs.createReadStream(fp).pipe(res);
}).listen(+process.env.PORT || 4173, () => console.log('serving'));
