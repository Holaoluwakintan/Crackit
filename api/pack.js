// GET /api/pack?school=unilag&ref=PAYSTACK_REFERENCE -> the premium questions for that school,
// only after Paystack confirms the payment server-side (amount, currency, status and the school it was for).
// With "Authorization: Bearer <Supabase access token>" the purchase is also saved to the student's account
// (crackit.purchases), and GET /api/pack?school=unilag (no ref) returns the pack on any phone the student signs in on.
const PACKS = require('./_packs.js');
const SUPA_URL = (process.env.SUPABASE_URL || 'https://rlbrhpjljjgpqpqjrpkc.supabase.co').replace(/\/+$/, '');
const SUPA_PUB = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_NT2VXfEUwWEEdcuft2VdDA_9DXSaMq4';

async function userFromToken(req, f) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  const m = /^Bearer\s+([A-Za-z0-9._-]{20,})$/.exec(String(h));
  if (!m) return null;
  try {
    const r = await f(SUPA_URL + '/auth/v1/user', { headers: { apikey: SUPA_PUB, Authorization: 'Bearer ' + m[1] } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { return null; }
}
function svc() { return (process.env.SUPABASE_SECRET_KEY || '').trim(); }
async function svcRpc(f, fn, body) {
  const k = svc(); if (!k) return null;
  const r = await f(SUPA_URL + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { apikey: k, Authorization: 'Bearer ' + k, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) return null;
  return r.json();
}
// true = saved now, false = this reference is already recorded (crackit.purchases.reference is unique), null = could not reach the database
async function savePurchase(f, userId, school, ref, amount) {
  const r = await svcRpc(f, 'crackit_add_purchase', { p_user: userId, p_pack: school, p_ref: ref, p_amount: amount });
  return r === true ? true : r === false ? false : null;
}
const GUEST_REF_MAX_AGE_MS = 48 * 3600 * 1000; // a guest (not signed in) can unlock with a payment reference only within 48 h of paying
async function ownsPack(f, userId, school) {
  return (await svcRpc(f, 'crackit_owns_pack', { p_user: userId, p_pack: school })) === true;
}

function handler(f) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const school = String((req.query && req.query.school) || '');
    const ref = String((req.query && req.query.ref) || '');
    const sk = (process.env.PAYSTACK_SECRET_KEY || '').trim();
    const allowLive = process.env.PAYSTACK_ALLOW_LIVE === '1';
    if (!Object.prototype.hasOwnProperty.call(PACKS, school)) return res.status(404).json({ error: 'unknown_pack' });
    if (!ref) {
      // restore on another phone: the signed-in account must already own this pack (works even if payments are later switched off)
      const user = await userFromToken(req, f);
      if (!user) return res.status(401).json({ error: 'sign_in_required' });
      if (!(await ownsPack(f, user.id, school).catch(() => false))) return res.status(402).json({ error: 'not_owned' });
      return res.status(200).json({ school, questions: PACKS[school], restored: true });
    }
    if (process.env.PAYMENTS_ENABLED !== '1' || !sk) return res.status(503).json({ error: 'payments_off' });
    if (!sk.startsWith('sk_test_') && !(sk.startsWith('sk_live_') && allowLive)) return res.status(503).json({ error: 'live_keys_not_allowed' });
    const user = await userFromToken(req, f);
    if (!/^[A-Za-z0-9_.=-]{6,100}$/.test(ref)) return res.status(400).json({ error: 'bad_reference' });
    const price = parseInt(process.env.PACK_PRICE_NGN || '700', 10) || 700;
    let j;
    try {
      const r = await f('https://api.paystack.co/transaction/verify/' + encodeURIComponent(ref), { headers: { Authorization: 'Bearer ' + sk } });
      j = await r.json();
    } catch (e) { return res.status(502).json({ error: 'paystack_unreachable' }); }
    const d = j && j.data;
    let meta = d && d.metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
    if (!j || !j.status || !d || d.status !== 'success') return res.status(402).json({ error: 'not_paid' });
    if (d.currency !== 'NGN' || d.amount < price * 100) return res.status(402).json({ error: 'wrong_amount' });
    if (!meta || meta.school !== school) return res.status(402).json({ error: 'wrong_pack' });
    // one payment = one buyer: stop a paid reference being shared to unlock the pack for other people
    let saved = false;
    if (user) {
      const s = await savePurchase(f, user.id, school, ref, d.amount).catch(() => null);
      if (s === false && !(await ownsPack(f, user.id, school).catch(() => false))) return res.status(409).json({ error: 'reference_already_used' });
      saved = s === true || s === false;
    } else {
      const paidAt = Date.parse(d.paid_at || d.paidAt || d.transaction_date || '');
      if (!paidAt || Date.now() - paidAt > GUEST_REF_MAX_AGE_MS) return res.status(410).json({ error: 'reference_expired_sign_in' });
    }
    return res.status(200).json({ school, questions: PACKS[school], saved_to_account: saved });
  };
}
module.exports = handler((u, o) => fetch(u, o));
module.exports.handler = handler;
