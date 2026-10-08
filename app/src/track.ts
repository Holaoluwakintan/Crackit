// Privacy-friendly counting: no cookies, no IDs, no names, no IP stored. Sends an event name, the page (with any
// codes stripped), the exam mode, and whether this is the phone's first event today (a count of active phones).
// Honours Do Not Track / Global Privacy Control. Explained on /privacy/.
import { APP } from './config';

const DAY = APP.storageKey + ':ev:day';
const EVENTS = new Set(['pv', 'start_test', 'finish_test', 'share', 'pay_click', 'd5_start', 'd5_done', 'card_share', 'challenge_open', 'remind_on', 'ref_land', 'install']);
function off() {
  const n = navigator as any;
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1' || n.doNotTrack === '1' || n.globalPrivacyControl === true || (window as any).doNotTrack === '1';
}
/** strip anything that looks like a code or id from a route: '/daily/c/eyJ2Ijoy…' -> '/daily/c/:x' */
export function cleanPath(p: string) {
  return ('/' + p.split('/').filter(Boolean).slice(0, 3).map(s => (/^[a-z0-9-]{1,20}$/.test(s) ? s : ':x')).join('/')).slice(0, 60);
}
export function track(e: string, extra: { m?: string; v?: number | string } = {}, path?: string) {
  try {
    if (!EVENTS.has(e) || off()) return;
    let first = 0;
    const t = new Date().toISOString().slice(0, 10);
    try { if (localStorage.getItem(DAY) !== t) { localStorage.setItem(DAY, t); first = 1; } } catch { /* ignore */ }
    let mode = 'jamb'; try { mode = localStorage.getItem(APP.storageKey + ':mode') || 'jamb'; } catch { /* ignore */ }
    const standalone = matchMedia('(display-mode: standalone)').matches || document.referrer.startsWith('android-app://') ? 1 : 0;
    const body = JSON.stringify({ e, p: cleanPath(path ?? (location.hash.slice(1) || location.pathname)), x: mode, m: extra.m ? String(extra.m).slice(0, 20) : undefined, v: extra.v !== undefined ? String(extra.v).slice(0, 12) : undefined, f: first, a: standalone });
    const ok = navigator.sendBeacon && navigator.sendBeacon('/api/ev', new Blob([body], { type: 'text/plain' }));
    if (!ok) fetch('/api/ev', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  } catch { /* never break the app */ }
}
