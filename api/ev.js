// POST /api/ev: privacy-friendly event counter for CrackIt (no cookies, no IP stored, no user ids, no names).
// Body (text/plain JSON from navigator.sendBeacon): { e, p, x, m?, v?, f, a }
// Writes to Supabase: the RPC public.crackit_track (table crackit.events, see sql/2026-10-08-growth.sql) when it exists;
// until that SQL has been run, each event is kept as a tiny JSON object in the private storage bucket crackit-analytics.
const SUPA_URL = (process.env.SUPABASE_URL || 'https://rlbrhpjljjgpqpqjrpkc.supabase.co').replace(/\/+$/, '');
const EVENTS = new Set(['pv', 'start_test', 'finish_test', 'share', 'pay_click', 'd5_start', 'd5_done', 'card_share', 'challenge_open', 'remind_on', 'ref_land', 'install']);
const hits = new Map(); // per-instance soft rate limit, keyed by a hash we never store
let rpcMissing = 0;

function clean(b) {
  if (!b || typeof b !== 'object') return null;
  const e = String(b.e || '');
  if (!EVENTS.has(e)) return null;
  const p = String(b.p || '/').slice(0, 60);
  if (!/^\/[a-z0-9\/:._-]*$/.test(p)) return null;
  const x = ['jamb', 'waec', 'neco'].includes(b.x) ? b.x : 'jamb';
  const m = b.m === undefined || b.m === null ? null : String(b.m).replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || null;
  const v = b.v === undefined || b.v === null ? null : String(b.v).replace(/[^0-9.-]/g, '').slice(0, 12) || null;
  return { e, p, x, m, v, f: b.f ? 1 : 0, a: b.a ? 1 : 0 };
}
function limited(req) {
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim();
  const k = require('crypto').createHash('sha256').update(ip + new Date().toISOString().slice(0, 13)).digest('hex').slice(0, 16);
  const n = (hits.get(k) || 0) + 1; hits.set(k, n);
  if (hits.size > 5000) hits.clear();
  return n > 120; // > 120 events an hour from one address: drop silently
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== '') {
    if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return null; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString('utf8')); } catch { return null; } }
    return req.body;
  }
  return new Promise((res) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 2000) { s = ''; req.destroy && req.destroy(); } });
    req.on('end', () => { try { res(JSON.parse(s)); } catch { res(null); } }); req.on('error', () => res(null));
  });
}
async function store(ev, key, f = fetch) {
  const H = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 3000);
  try {
    if (Date.now() - rpcMissing > 10 * 60 * 1000) {
      const r = await f(SUPA_URL + '/rest/v1/rpc/crackit_track', { method: 'POST', headers: H, signal: ctl.signal, body: JSON.stringify({ p_e: ev.e, p_path: ev.p, p_exam: ev.x, p_m: ev.m, p_v: ev.v, p_first: !!ev.f, p_app: !!ev.a }) });
      if (r.ok) return 'table';
      if (r.status !== 404) return 'error';
      rpcMissing = Date.now();
    }
    const now = new Date(); const d = now.toISOString();
    const name = `ev/${d.slice(0, 10)}/${d.slice(11, 19).replace(/:/g, '')}-${Math.random().toString(36).slice(2, 10)}.json`;
    const r2 = await f(`${SUPA_URL}/storage/v1/object/crackit-analytics/${name}`, { method: 'POST', headers: H, signal: ctl.signal, body: JSON.stringify({ ...ev, t: d }) });
    return r2.ok ? 'bucket' : 'error';
  } catch { return 'error'; } finally { clearTimeout(t); }
}
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  const ev = clean(await readBody(req));
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!ev || !key || limited(req)) return res.status(202).json({ ok: false });
  const where = await store(ev, key);
  return res.status(202).json({ ok: where !== 'error' });
};
module.exports.clean = clean;
module.exports.store = store;
