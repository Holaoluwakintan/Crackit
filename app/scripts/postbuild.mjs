import './seo.mjs';
import './landing.mjs';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
const dist = new URL('../dist/', import.meta.url).pathname;
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); } })(dist);
// subject banks are cached the first time each subject is opened (keeps the first visit light); index.json stays precached
const NOCACHE = /^\/(cut-off|admission-checker|privacy|terms|delete-account|\.well-known|jamb|waec|neco|post-utme)\/|^\/(sitemap\.xml|robots\.txt|og-admission\.png|data\/admission\/sources\.json)$|^\/data\/(?!index\.json)[a-z]+\.json$|^\/data\/ssce\/(?!index\.json)[a-z]+\.json$|^\/play\//;
const list = files.map(f => '/' + relative(dist, f)).filter(f => f !== '/sw.js' && !f.endsWith('.map') && f !== '/og.png' && f !== '/vercel.json' && !NOCACHE.test(f)).sort();
const hash = createHash('sha256'); for (const f of files.sort()) if (!f.endsWith('sw.js')) hash.update(readFileSync(f));
const version = hash.digest('hex').slice(0, 10);
const urls = ['/', ...list.filter(f => f !== '/index.html')];
const sw = `// generated at build
const CACHE = 'app-${version}';
const URLS = ${JSON.stringify(urls)};
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(URLS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'crackit-state').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// Daily-5 reminder (only after the student opts in): at most one gentle nudge a day, afternoon/evening, only if today's Daily 5 isn't done
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
self.addEventListener('periodicsync', e => {
  if (e.tag !== 'crackit-d5') return;
  e.waitUntil((async () => {
    const c = await caches.open('crackit-state'); const r = await c.match('/__d5state'); if (!r) return;
    const s = await r.json(); const now = new Date(); const t = ymd(now); const h = now.getHours();
    if (!s.remind || s.done === t || s.last === t || h < 12 || h > 21) return;
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const alive = s.done === ymd(y) && s.streak > 0;
    await self.registration.showNotification(alive ? 'Keep your ' + s.streak + '-day streak 🔥' : 'Your Daily 5 is ready', { body: '5 quick questions, about 2 minutes.', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'crackit-d5', data: { url: '/#/daily' } });
    s.last = t; await c.put('/__d5state', new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } }));
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/#/daily';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => { for (const w of ws) if ('focus' in w) { w.navigate(url).catch(() => {}); return w.focus(); } return self.clients.openWindow(url); }));
});
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
