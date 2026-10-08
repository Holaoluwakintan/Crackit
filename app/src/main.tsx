import { render } from 'preact';
import { App } from './app';
import { handleRedirect, onPacks, startSync } from './auth';
import './styles.css';
import { applyTheme, theme } from './fx';
import { track } from './track';
import { validRef } from './daily-core.js';

// referral: remember who shared the link (attribution only; rewards are decided on the server), then tidy the URL
try {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref !== null && !/[?&](code|error)=/.test(location.search)) {
    if (validRef(ref) && !localStorage.getItem('crackit:ref')) { localStorage.setItem('crackit:ref', ref); localStorage.setItem('crackit:ref:at', String(Date.now())); track('ref_land'); }
    history.replaceState(history.state, '', location.pathname + location.hash);
  }
} catch { /* ignore */ }
track('pv');

applyTheme();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (theme() === 'auto') applyTheme(); }); } catch { /* old browsers */ }

(async () => {
  try { await handleRedirect(); } catch { /* fall through to the app */ }
  render(<App />, document.getElementById('app')!);
  onPacks(packs => { if (packs.length) import('./admission/pay').then(m => m.restorePacks(packs)).catch(() => {}); });
  startSync();
})();

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
