import './seo.mjs';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const dist = new URL('../dist/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
// subject banks are cached the first time each subject is opened (keeps the first visit light); index.json stays precached
const NOCACHE = /^\/(cut-off|admission-checker|privacy|terms|delete-account|\.well-known)\/|^\/(sitemap\.xml|robots\.txt|og-admission\.png|data\/admission\/sources\.json)$|^\/data\/(?!index\.json)[a-z]+\.json$|^\/data\/ssce\/(?!index\.json)[a-z]+\.json$|^\/play\//;
const list = files.map(f => '/' + relative(dist, f)).filter(f => f !== '/sw.js' && !f.endsWith('.map') && f !== '/og.png' && f !== '/vercel.json' && !NOCACHE.test(f)).sort();
const hash = createHash('sha256'); for (const f of files.sort()) if (!f.endsWith('sw.js')) hash.update(readFileSync(f));
const version = hash.digest('hex').slice(0, 10);
const urls = ['/', ...list.filter(f => f !== '/index.html')];
const sw = `// generated at build
const CACHE = 'app-${version}';
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const path = new URL(req.url).pathname;
  if (path.startsWith('/api/')) return;
  if (req.mode === 'navigate') {
    if (path === '/' || path === '/index.html') { e.respondWith(caches.match('/').then(r => r || fetch(req))); return; }
    // static SEO pages: network first, cached copy (or the app) when offline
    e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => caches.match(req).then(r => r || caches.match('/'))));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(r => r || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
`;
writeFileSync(join(dist, 'sw.js'), sw);
const total = files.reduce((n, f) => n + statSync(f).size, 0);
console.log('sw.js: precaching', urls.length, 'urls, version', version, '| dist bytes', total);
