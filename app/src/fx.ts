// Tiny motion helpers (no libraries). Everything respects prefers-reduced-motion.
export const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** confetti burst on a throwaway canvas, ~1.2 s, then removed */
export function confetti(n = 90) {
  if (reduced() || typeof document === 'undefined') return;
  const c = document.createElement('canvas'); const dpr = Math.min(2, devicePixelRatio || 1);
  const W = innerWidth, H = innerHeight; c.width = W * dpr; c.height = H * dpr;
  c.className = 'confetti'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
  const x = c.getContext('2d'); if (!x) { c.remove(); return; }
  x.scale(dpr, dpr);
  const cols = ['#0e7a4d', '#f5b700', '#22c55e', '#ffffff', '#ef4444', '#3b82f6'];
  const ps = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .35, vx: (Math.random() - .5) * 11, vy: -Math.random() * 11 - 4, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .4, c: cols[(Math.random() * cols.length) | 0] }));
  const t0 = performance.now();
  const step = (t: number) => {
    const k = (t - t0) / 1400; x.clearRect(0, 0, W, H);
    for (const p of ps) { p.vy += .32; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.globalAlpha = Math.max(0, 1 - k * k); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); }
    if (k < 1) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}
/** a short buzz on phones that support it */
export function buzz(ms: number | number[] = 12) { try { const n = navigator as any; if (!reduced() && n.vibrate && (!n.userActivation || n.userActivation.hasBeenActive)) n.vibrate(ms); } catch { /* ignore */ } }
/** animate a number from 0 to `to` */
export function countUp(set: (v: number) => void, to: number, ms = 900) {
  if (reduced() || to <= 0) { set(to); return () => {}; }
  let raf = 0; const t0 = performance.now();
  const f = (t: number) => { const k = Math.min(1, (t - t0) / ms); set(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f); };
  raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf);
}

// ---------- theme (light / dark / auto) ----------
const TKEY = 'crackit:theme';
export type Theme = 'light' | 'dark' | 'auto';
export function theme(): Theme { try { return (localStorage.getItem(TKEY) as Theme) || 'auto'; } catch { return 'auto'; } }
export function applyTheme(t: Theme = theme()) {
  const dark = t === 'dark' || (t === 'auto' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#0b1410' : '#0b5d3b');
}
export function setTheme(t: Theme) { try { localStorage.setItem(TKEY, t); } catch { /* ignore */ } applyTheme(t); }
export function isDark() { return document.documentElement.dataset.theme === 'dark'; }
