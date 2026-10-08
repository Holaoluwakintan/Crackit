import { render } from 'preact';
import { App } from './app';
import { handleRedirect, onPacks, startSync } from './auth';
import './styles.css';
import { applyTheme, theme } from './fx';

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
