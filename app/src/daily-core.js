// CrackIt Daily-5: pure logic (no DOM). Unit-tested in test/daily.test.mjs.
// Today's 5 = a seeded pick from the chosen exam's bank, so the same exam + subjects + date gives the same 5
// (a friend you challenge gets exactly your questions; a reload never reshuffles).

/** 32-bit FNV-1a hash of a string */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** mulberry32: small, fast, seeded PRNG in [0,1) */
export function rng(seed) {
  let a = typeof seed === 'string' ? hash32(seed) : seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const D5_N = 5;
export const EXAMS = ['jamb', 'waec', 'neco'];
/** subjects to use: English first (always), then up to 3 more, de-duplicated, only ones that exist in the bank list */
export function normSubjects(subjects, available) {
  const av = new Set(available);
  const out = [];
  if (av.has('english')) out.push('english');
  for (const s of subjects || []) if (av.has(s) && !out.includes(s) && out.length < 4) out.push(s);
  return out;
}
/** pick today's 5 as [[sid, qid], ...]. banks: { sid: { questions: [{id, t}] } } */
export function pickDaily(banks, subjects, date, exam, n = D5_N) {
  const subs = subjects.filter(s => banks[s] && banks[s].questions && banks[s].questions.length);
  if (!subs.length) return [];
  const r = rng(['d5', exam, date, subs.join(',')].join('|'));
  // English first, then the other subjects in a seeded order, round-robin until n
  const rest = subs.filter(s => s !== 'english');
  for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rest[i], rest[j]] = [rest[j], rest[i]]; }
  const order = subs.includes('english') ? ['english', ...rest] : rest;
  const used = new Set(); const usedTopic = new Set(); const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    const sid = order[out.length % order.length];
    const qs = banks[sid].questions;
    // try a few times for a question from a topic not used yet today
    let q = null;
    for (let k = 0; k < 8; k++) {
      const c = qs[Math.floor(r() * qs.length)];
      if (used.has(sid + ':' + c.id)) continue;
      q = c; if (!usedTopic.has(sid + ':' + c.t)) break;
    }
    if (!q) continue;
    used.add(sid + ':' + q.id); usedTopic.add(sid + ':' + q.t); out.push([sid, q.id]);
  }
  return out;
}
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
export function addDays(dateStr, k) { const [y, m, d] = dateStr.split('-').map(Number); return ymd(new Date(y, m - 1, d + k)); }
/** consecutive days with a finished Daily-5, counting back from today (or yesterday, so the streak is alive until midnight) */
export function d5Streak(d5, todayStr) {
  d5 = d5 || {};
  let d = d5[todayStr] ? todayStr : addDays(todayStr, -1);
  let n = 0;
  while (d5[d]) { n++; d = addDays(d, -1); }
  return n;
}
export function d5Best(d5) {
  const days = Object.keys(d5 || {}).sort(); let best = 0, run = 0, prev = '';
  for (const d of days) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}
/** merge two phones' Daily-5 records: keep every day; on the same day keep the better score */
export function mergeD5(a = {}, b = {}) {
  const out = { ...a };
  for (const k in b) { const x = out[k], y = b[k]; if (!x || (y && (y.c || 0) > (x.c || 0))) out[k] = y; }
  const keys = Object.keys(out).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete out[k];
  return out;
}
const B64 = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** challenge code for "beat my Daily-5": { v:2, x: exam, d: date, n: first name (optional), c: correct, q: [[sid,qid]] } */
export function encodeChallenge(o, btoaFn = globalThis.btoa) {
  const json = JSON.stringify({ v: 2, x: o.x, d: o.d, n: (o.n || '').slice(0, 24), c: o.c | 0, q: o.q });
  return B64(btoaFn(unescape(encodeURIComponent(json))));
}
export function decodeChallenge(s, atobFn = globalThis.atob) {
  try {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
    const o = JSON.parse(decodeURIComponent(escape(atobFn(s))));
    if (!o || o.v !== 2 || !EXAMS.includes(o.x) || !Array.isArray(o.q) || o.q.length < 1 || o.q.length > 10) return null;
    if (!o.q.every(p => Array.isArray(p) && /^[a-z]{2,20}$/.test(p[0]) && /^[A-Za-z0-9_-]{1,24}$/.test(String(p[1])))) return null;
    return { x: o.x, d: String(o.d || '').slice(0, 10), n: String(o.n || '').slice(0, 24), c: Math.max(0, Math.min(o.q.length, o.c | 0)), q: o.q };
  } catch { return null; }
}
/** referral code from a signed-in user's id (first 12 hex chars, no dashes): attribution only, rewards are checked on the server */
export function refCode(userId) { const h = String(userId || '').replace(/[^0-9a-f]/gi, '').toLowerCase(); return h.length >= 12 ? h.slice(0, 12) : ''; }
export function validRef(s) { return /^[0-9a-f]{12}$/.test(String(s || '')); }
