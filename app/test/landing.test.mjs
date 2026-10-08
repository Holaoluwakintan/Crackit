import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const dist = new URL('../dist/', import.meta.url).pathname;
const C = JSON.parse(readFileSync(new URL('../scripts/landing-content.json', import.meta.url), 'utf8'));
const built = existsSync(dist + 'jamb/english/index.html');
test('landing: 12 exam x subject pages are configured', () => { assert.equal(Object.keys(C).length, 12); });
test('landing: every built page has title, description, canonical, FAQ schema, 5 samples, disclaimer, and is in the sitemap', { skip: !built && 'run npm run build first' }, () => {
  const sm = readFileSync(dist + 'sitemap.xml', 'utf8');
  const titles = new Set();
  for (const k of Object.keys(C)) {
    const h = readFileSync(dist + k + '/index.html', 'utf8');
    const title = /<title>([^<]+)<\/title>/.exec(h)[1]; assert.ok(!titles.has(title), 'unique title ' + k); titles.add(title);
    assert.match(h, /<meta name="description" content="[^"]{80,}"/);
    assert.ok(h.includes(`<link rel="canonical" href="https://crackit-ng.vercel.app/${k}/">`));
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].map(m => JSON.parse(m[1]));
    assert.ok(ld.some(x => x['@type'] === 'FAQPage' && x.mainEntity.length >= 3), 'faq ' + k);
    assert.equal((h.match(/class="q"/g) || []).length, 5, 'samples ' + k);
    assert.ok(h.includes('Not affiliated with JAMB, WAEC or NECO'), 'disclaimer ' + k);
    assert.ok(sm.includes(`/${k}/</loc>`), 'sitemap ' + k);
  }
  assert.match(readFileSync(dist + 'robots.txt', 'utf8'), /Sitemap: https:\/\/crackit-ng\.vercel\.app\/sitemap\.xml/);
});
