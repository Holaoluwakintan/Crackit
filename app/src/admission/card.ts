// "Share my result" card: drawn on a canvas, shared as a PNG file through the Web Share API (WhatsApp / Status),
// with a download + wa.me fallback for browsers that can't share files.
const BAND_COLORS: Record<string, string> = { Strong: '#138a4e', Fair: '#2f7fd8', 'Long shot': '#d98a00', 'Below cut-off': '#c62f2f', 'Meets minimum': '#5d6b64' };

function wrap(x: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(' '); const lines: string[] = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
export async function drawResultCard(o: { jamb: number; course: string; school: string; band: string; good?: number }): Promise<Blob | null> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); if (!x) return null;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b5d3b'); g.addColorStop(1, '#063d27');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,0.06)'; x.beginPath(); x.arc(W - 80, 120, 260, 0, Math.PI * 2); x.fill();
  const F = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  // logo
  x.fillStyle = '#fff'; roundRect(x, 80, 80, 96, 96, 24); x.fill();
  x.strokeStyle = '#0b5d3b'; x.lineWidth = 11; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(104, 130); x.lineTo(122, 148); x.lineTo(154, 110); x.stroke();
  x.fillStyle = '#f5b700'; x.beginPath(); x.arc(160, 102, 8, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#fff'; x.font = `800 54px ${F}`; x.fillText('CrackIt', 200, 145);
  x.fillStyle = '#cfe8da'; x.font = `600 40px ${F}`; x.fillText('My admission chances', 80, 290);
  x.fillStyle = '#fff'; x.font = `800 210px ${F}`; x.fillText(String(o.jamb), 72, 500);
  x.fillStyle = '#cfe8da'; x.font = `700 44px ${F}`; x.fillText('JAMB score', 84, 570);
  x.fillStyle = '#fff'; x.font = `800 64px ${F}`;
  let y = 720; for (const l of wrap(x, o.course, W - 160).slice(0, 2)) { x.fillText(l, 80, y); y += 76; }
  x.fillStyle = '#cfe8da'; x.font = `700 50px ${F}`; x.fillText(o.school, 80, y + 6); y += 90;
  const bc = BAND_COLORS[o.band] || '#5d6b64';
  x.font = `800 56px ${F}`; const bw = x.measureText(o.band).width + 80;
  x.fillStyle = bc; roundRect(x, 80, y, bw, 100, 50); x.fill();
  x.fillStyle = '#fff'; x.fillText(o.band, 120, y + 70); y += 150;
  if (o.good) { x.fillStyle = '#fff'; x.font = `600 42px ${F}`; x.fillText(`✅ ${o.good} course${o.good > 1 ? 's' : ''} with a good chance`, 80, y + 20); }
  x.fillStyle = '#f5b700'; roundRect(x, 80, H - 280, W - 160, 180, 28); x.fill();
  x.fillStyle = '#14201a'; x.font = `700 40px ${F}`; x.fillText('Check your own chances free 👇', 120, H - 210);
  x.font = `800 58px ${F}`; x.fillText('crackit-ng.vercel.app', 120, H - 135);
  x.fillStyle = 'rgba(255,255,255,0.7)'; x.font = `500 28px ${F}`; x.fillText('Estimate from published cut-offs. Not affiliated with JAMB.', 80, H - 50);
  return new Promise(r => c.toBlob(b => r(b), 'image/png'));
}
function roundRect(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
}
export async function shareResultCard(o: { jamb: number; course: string; school: string; band: string; good?: number }) {
  const url = location.origin + '/admission-checker/';
  const text = `My JAMB score: ${o.jamb}. ${o.course} at ${o.school}: ${o.band}. Check your own admission chances free on CrackIt 👉 ${url}`;
  const blob = await drawResultCard(o);
  const nav = navigator as any;
  if (blob) {
    const file = new File([blob], 'crackit-admission-result.png', { type: 'image/png' });
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file], text, title: 'My admission chances' }); return; } catch (e: any) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'crackit-admission-result.png'; document.body.appendChild(a); a.click(); a.remove();
  }
  if (nav.share) { try { await nav.share({ text, url }); return; } catch (e: any) { if (e && e.name === 'AbortError') return; } }
  open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
}
