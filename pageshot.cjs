
const { chromium } = require('/home/user/node_modules/playwright-core'); const fs = require('fs');
(async () => {
  const dir = process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243';
  const exe = fs.readdirSync(dir).map(d => dir + '/' + d + '/chrome-headless-shell').filter(p => fs.existsSync(p))[0];
  const b = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true }); });
  const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  for (const p of process.argv.slice(4)) {
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const r = await pg.goto(base + p, { waitUntil: 'networkidle' });
    const name = p.replace(/\//g, '_').replace(/^_|_$/g, '') || 'root';
    if (p.includes('jamb/english')) { await pg.click('details.q summary, .q details summary').catch(() => {}); }
    await pg.screenshot({ path: `${out}/${name}.png` }); await pg.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
    const info = await pg.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.innerText, desc: document.querySelector('meta[name=description]')?.content, ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => JSON.parse(s.textContent)['@type']), qs: document.querySelectorAll('.q').length, links: document.querySelectorAll('a').length, w: document.documentElement.scrollWidth }));
    console.log(p, r.status(), JSON.stringify(info), 'errs', JSON.stringify(errs));
    await pg.close();
  }
  await b.close();
})();
