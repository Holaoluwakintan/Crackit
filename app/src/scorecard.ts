// WhatsApp Status score card: a 1080x1920 PNG drawn on a canvas, shared as a file through the Web Share API
// (straight into WhatsApp / Status on Android), with a download + wa.me fallback for browsers that can't share files.
// Personal data: the first name only, and only when the student ticks "show my name".
export interface CardOpts {
  kicker: string;        // "TODAY'S DAILY 5"
  score: number; total: number; unit?: string; // 4 / 5   or 268 / 400
  verdict: string;       // "Sharp! 🔥"
  streak?: number;       // Daily-5 streak
  subjects: string;      // "English · Maths · Physics"
  exam: string;          // "JAMB"
  name?: string;         // first name, optional
  dots?: boolean[];      // per-question right/wrong (Daily-5)
  site: string;          // "crackit-ng.vercel.app"
}
const G = '#0b5d3b', G2 = '#073d27', GOLD = '#f5b301', INK = '#ffffff';
function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
function fit(x: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight = 800) {
  let s = size; do { x.font = `${weight} ${s}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`; s -= 2; } while (x.measureText(text).width > maxW && s > 20);
}
export function drawCard(o: CardOpts): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const x = c.getContext('2d')!;
  const bg = x.createLinearGradient(0, 0, 1080, 1920); bg.addColorStop(0, '#0e7a4d'); bg.addColorStop(0.55, G); bg.addColorStop(1, G2);
  x.fillStyle = bg; x.fillRect(0, 0, 1080, 1920);
  // soft rings in the background
  x.strokeStyle = 'rgba(255,255,255,0.06)'; x.lineWidth = 60;
  for (const [cx, cy, r] of [[980, 160, 260], [80, 1700, 320]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke(); }
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // logo
  x.fillStyle = GOLD; rr(x, 380, 120, 96, 96, 26); x.fill();
  x.strokeStyle = G; x.lineWidth = 14; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(404, 170); x.lineTo(422, 190); x.lineTo(454, 146); x.stroke();
  x.fillStyle = INK; x.textAlign = 'left'; x.font = '900 72px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; x.fillText('CrackIt', 498, 194);
  x.textAlign = 'center';
  // kicker
  x.fillStyle = 'rgba(255,255,255,0.14)'; rr(x, 240, 300, 600, 76, 38); x.fill();
  x.fillStyle = GOLD; fit(x, o.kicker, 560, 40, 800); x.fillText(o.kicker, 540, 352);
  x.fillStyle = 'rgba(255,255,255,0.85)'; fit(x, o.exam + ' · ' + o.subjects, 940, 40, 600); x.fillText(o.exam + ' · ' + o.subjects, 540, 446);
  // score ring
  const cx = 540, cy = 790, R = 270, pct = o.total ? o.score / o.total : 0;
  x.lineWidth = 46; x.lineCap = 'round';
  x.strokeStyle = 'rgba(255,255,255,0.16)'; x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.stroke();
  x.strokeStyle = GOLD; x.beginPath(); x.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.02, pct)); x.stroke();
  x.fillStyle = INK; x.font = '900 230px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const big = String(o.score); const bw = x.measureText(big).width;
  x.font = '800 96px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; const sw = x.measureText('/' + o.total).width;
  const left = cx - (bw + sw) / 2;
  x.textAlign = 'left'; x.font = '900 230px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; x.fillText(big, left, cy + 80);
  x.fillStyle = 'rgba(255,255,255,0.75)'; x.font = '800 96px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'; x.fillText('/' + o.total, left + bw, cy + 80);
  x.textAlign = 'center';
  if (o.unit) { x.font = '600 38px system-ui, sans-serif'; x.fillText(o.unit, cx, cy + 150); }
  // per-question dots
  let y = 1140;
  if (o.dots && o.dots.length) {
    const n = o.dots.length, gap = 30, d = 70, w = n * d + (n - 1) * gap; let dx = 540 - w / 2;
    for (const ok of o.dots) {
      x.fillStyle = ok ? '#22c55e' : 'rgba(255,255,255,0.18)'; x.beginPath(); x.arc(dx + d / 2, y, d / 2, 0, Math.PI * 2); x.fill();
      x.strokeStyle = INK; x.lineWidth = 9; x.lineCap = 'round'; x.beginPath();
      if (ok) { x.moveTo(dx + 20, y + 2); x.lineTo(dx + 31, y + 13); x.lineTo(dx + 51, y - 12); } else { x.moveTo(dx + 24, y - 11); x.lineTo(dx + 46, y + 11); x.moveTo(dx + 46, y - 11); x.lineTo(dx + 24, y + 11); }
      x.stroke(); dx += d + gap;
    }
    y += 110;
  } else y += 20;
  x.fillStyle = INK; fit(x, o.verdict, 940, 76, 900); x.fillText(o.verdict, 540, y + 30);
  y += 120;
  if (o.streak && o.streak > 0) {
    const t = `🔥 ${o.streak}-day streak`;
    x.font = '800 50px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Color Emoji", Arial, sans-serif';
    const w = x.measureText(t).width + 90;
    x.fillStyle = 'rgba(245,179,1,0.18)'; rr(x, 540 - w / 2, y - 62, w, 92, 46); x.fill();
    x.fillStyle = GOLD; x.fillText(t, 540, y); y += 110;
  }
  if (o.name) { x.fillStyle = 'rgba(255,255,255,0.85)'; fit(x, o.name + ' scored ' + o.score + '/' + o.total, 900, 46, 700); x.fillText(o.name + ' scored ' + o.score + '/' + o.total, 540, y); }
  // challenge box
  x.fillStyle = '#ffffff'; rr(x, 90, 1530, 900, 250, 40); x.fill();
  x.fillStyle = G; fit(x, 'Can you beat me?', 820, 84, 900); x.fillText('Can you beat me?', 540, 1625);
  x.fillStyle = '#14201a'; x.font = '600 38px system-ui, sans-serif'; x.fillText('Same questions, free on CrackIt', 540, 1688);
  x.fillStyle = '#0e7a4d'; x.font = '800 40px system-ui, sans-serif'; x.fillText(o.site, 540, 1746);
  x.fillStyle = 'rgba(255,255,255,0.6)'; x.font = '500 26px system-ui, sans-serif'; x.fillText('Original practice questions · not affiliated with JAMB, WAEC or NECO', 540, 1860);
  return c;
}
export function cardBlob(o: CardOpts): Promise<Blob> {
  const c = drawCard(o);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('blob'))), 'image/png'));
}
/** share the PNG + text/link. Returns how it went so the UI can say the right thing. */
export async function shareCard(blob: Blob, text: string, url: string): Promise<'shared' | 'cancelled' | 'fallback'> {
  const file = new File([blob], 'crackit-score.png', { type: 'image/png' });
  const nav = navigator as any;
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await nav.share({ files: [file], text: text + ' ' + url }); return 'shared'; } catch (e: any) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'crackit-score.png';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank');
  return 'fallback';
}
