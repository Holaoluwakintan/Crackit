// node test for the serverless functions (CommonJS, run from /home/user/work/score300/api)
const assert = require('node:assert/strict');
const { test } = require('node:test');
function mock(query) { const res = { code: 0, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } }; return [{ query }, res]; }
const cfg = () => { delete require.cache[require.resolve('./config.js')]; return require('./config.js'); };
const pack = () => { delete require.cache[require.resolve('./pack.js')]; return require('./pack.js'); };
const ENV = ['PAYMENTS_ENABLED', 'PAYSTACK_PUBLIC_KEY', 'PAYSTACK_SECRET_KEY', 'PAYSTACK_ALLOW_LIVE', 'PACK_PRICE_NGN'];
const clear = () => ENV.forEach(k => delete process.env[k]);
test('config: off with no keys', () => { clear(); const [q, r] = mock({}); cfg()(q, r); assert.deepEqual(r.body, { enabled: false, key: '', price: 700, mode: 'off' }); });
test('config: test keys + flag -> on in test mode', () => { clear(); Object.assign(process.env, { PAYMENTS_ENABLED: '1', PAYSTACK_PUBLIC_KEY: 'pk_test_x', PAYSTACK_SECRET_KEY: 'sk_test_y', PACK_PRICE_NGN: '500' }); const [q, r] = mock({}); cfg()(q, r); assert.deepEqual(r.body, { enabled: true, key: 'pk_test_x', price: 500, mode: 'test' }); });
test('config: live keys refused without PAYSTACK_ALLOW_LIVE', () => { clear(); Object.assign(process.env, { PAYMENTS_ENABLED: '1', PAYSTACK_PUBLIC_KEY: 'pk_live_x', PAYSTACK_SECRET_KEY: 'sk_live_y' }); const [q, r] = mock({}); cfg()(q, r); assert.equal(r.body.enabled, false); });
test('pack: 503 when payments are off', async () => { clear(); const [q, r] = mock({ school: 'unilag', ref: 'abcdef12' }); await pack()(q, r); assert.equal(r.code, 503); });
test('pack: verifies with Paystack and returns questions only for a real, matching payment', async () => {
  clear(); Object.assign(process.env, { PAYMENTS_ENABLED: '1', PAYSTACK_SECRET_KEY: 'sk_test_y' });
  const calls = [];
  const fake = (data) => async (url, opts) => { calls.push([url, opts.headers.Authorization]); return { json: async () => ({ status: true, data }) }; };
  global.fetch = fake({ status: 'success', currency: 'NGN', amount: 70000, metadata: { school: 'unilag' }, paid_at: new Date().toISOString() });
  let [q, r] = mock({ school: 'unilag', ref: 'T123456789' }); await pack()(q, r);
  assert.equal(r.code, 200); assert.equal(r.body.questions.length, 15); assert.ok(calls[0][0].endsWith('/transaction/verify/T123456789')); assert.equal(calls[0][1], 'Bearer sk_test_y');
  global.fetch = fake({ status: 'success', currency: 'NGN', amount: 70000, metadata: { school: 'ui' } });
  [q, r] = mock({ school: 'unilag', ref: 'T123456789' }); await pack()(q, r); assert.equal(r.code, 402, 'paid for another school');
  global.fetch = fake({ status: 'success', currency: 'NGN', amount: 10000, metadata: { school: 'unilag' } });
  [q, r] = mock({ school: 'unilag', ref: 'T123456789' }); await pack()(q, r); assert.equal(r.code, 402, 'underpaid');
  global.fetch = fake({ status: 'abandoned', currency: 'NGN', amount: 70000, metadata: '{"school":"unilag"}' });
  [q, r] = mock({ school: 'unilag', ref: 'T123456789' }); await pack()(q, r); assert.equal(r.code, 402, 'not paid');
  [q, r] = mock({ school: 'nope', ref: 'T123456789' }); await pack()(q, r); assert.equal(r.code, 404);
  [q, r] = mock({ school: 'unilag', ref: 'x' }); await pack()(q, r); assert.equal(r.code, 400);
});

// ---- v0.3: account-linked packs, Google readiness probe, asset links ----
function mockH(query, headers = {}) { const [q, r] = mock(query); q.headers = headers; r.send = function (b) { this.body = b; return this; }; return [q, r]; }
const fresh = (f) => { delete require.cache[require.resolve(f)]; return require(f); };
test('pack restore: needs sign-in, then only returns a pack the account owns', async () => {
  clear(); process.env.SUPABASE_SECRET_KEY = 'svc';
  const seen = [];
  const f = async (u, o = {}) => {
    seen.push(u);
    if (u.endsWith('/auth/v1/user')) return o.headers.Authorization === 'Bearer good.token.value.123456' ? { ok: true, json: async () => ({ id: 'u1' }) } : { ok: false, json: async () => ({}) };
    if (u.endsWith('/rpc/crackit_owns_pack')) { const b = JSON.parse(o.body); return { ok: true, json: async () => b.p_user === 'u1' && b.p_pack === 'unilag' }; }
    return { ok: false, json: async () => ({}) };
  };
  const h = fresh('./pack.js').handler(f);
  let [q, r] = mockH({ school: 'unilag' }); await h(q, r); assert.equal(r.code, 401);
  [q, r] = mockH({ school: 'unilag' }, { authorization: 'Bearer bad.token.value.1234567890' }); await h(q, r); assert.equal(r.code, 401);
  [q, r] = mockH({ school: 'unilag' }, { authorization: 'Bearer good.token.value.123456' }); await h(q, r); assert.equal(r.code, 200); assert.equal(r.body.questions.length, 15); assert.equal(r.body.restored, true);
  [q, r] = mockH({ school: 'oau' }, { authorization: 'Bearer good.token.value.123456' }); await h(q, r); assert.equal(r.code, 402);
  delete process.env.SUPABASE_SECRET_KEY;
});
test('pack purchase while signed in is saved to the account (service RPC), payment still verified first', async () => {
  clear(); Object.assign(process.env, { PAYMENTS_ENABLED: '1', PAYSTACK_SECRET_KEY: 'sk_test_y', SUPABASE_SECRET_KEY: 'svc' });
  let saved = null;
  const f = async (u, o = {}) => {
    if (u.includes('api.paystack.co')) return { json: async () => ({ status: true, data: { status: 'success', currency: 'NGN', amount: 70000, metadata: { school: 'ui' } } }) };
    if (u.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: 'u9' }) };
    if (u.endsWith('/rpc/crackit_add_purchase')) { saved = JSON.parse(o.body); assert.equal(o.headers.Authorization, 'Bearer svc'); return { ok: true, json: async () => true }; }
    return { ok: false, json: async () => ({}) };
  };
  const [q, r] = mockH({ school: 'ui', ref: 'REF123456' }, { authorization: 'Bearer good.token.value.123456' });
  await fresh('./pack.js').handler(f)(q, r);
  assert.equal(r.code, 200); assert.equal(r.body.saved_to_account, true);
  assert.deepEqual(saved, { p_user: 'u9', p_pack: 'ui', p_ref: 'REF123456', p_amount: 70000 });
  delete process.env.SUPABASE_SECRET_KEY;
});
test('auth-status: mismatch -> false, Google sign-in page -> true, errors -> null, env override wins', async () => {
  const mk = (body) => async (u) => u.includes('/auth/v1/authorize') ? { headers: { get: () => 'https://accounts.google.com/o/oauth2/v2/auth?x=1' } } : { url: u, text: async () => body };
  const run = async (f) => { const [q, r] = mockH({}); await fresh('./auth-status.js').handler(f)(q, r); return r; };
  assert.equal((await run(mk('<p>Error 400: redirect_uri_mismatch</p>'))).body.google, false);
  const ok = await run(mk('<title>Sign in - Google Accounts</title>')); assert.equal(ok.body.google, true); assert.match(ok.headers['Cache-Control'], /s-maxage=600/);
  assert.equal((await run(async () => { throw new Error('down'); })).body.google, null);
  process.env.GOOGLE_SIGNIN = 'off'; assert.equal((await run(mk('fine'))).body.google, false); delete process.env.GOOGLE_SIGNIN;
});
test('assetlinks: built-in upload key plus valid extra keys from config, junk ignored', async () => {
  const extra = '11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF:11:22:33:44:55:66:77:88:99:00:AA:BB:CC:DD:EE:FF';
  const [q, r] = mockH({});
  await fresh('./assetlinks.js').handler(async () => ({ ok: true, json: async () => [extra, 'not-a-key'] }))(q, r);
  const j = JSON.parse(r.body)[0];
  assert.equal(j.target.package_name, 'com.holaoluwakintan.crackit'); assert.equal(j.target.sha256_cert_fingerprints.length, 2); assert.ok(j.target.sha256_cert_fingerprints.includes(extra));
});

// ---- audit 2026-10-08: one payment reference = one buyer ----
test('pack: a guest can unlock with a reference only within 48 h of paying', async () => {
  clear(); Object.assign(process.env, { PAYMENTS_ENABLED: '1', PAYSTACK_SECRET_KEY: 'sk_test_y' });
  const old = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const f = async () => ({ json: async () => ({ status: true, data: { status: 'success', currency: 'NGN', amount: 70000, metadata: { school: 'unilag' }, paid_at: old } }) });
  const [q, r] = mockH({ school: 'unilag', ref: 'OLDREF123' }); await fresh('./pack.js').handler(f)(q, r);
  assert.equal(r.code, 410); assert.equal(r.body.questions, undefined);
});
test('pack: a reference already claimed by another account is refused; the owner can re-use it', async () => {
  clear(); Object.assign(process.env, { PAYMENTS_ENABLED: '1', PAYSTACK_SECRET_KEY: 'sk_test_y', SUPABASE_SECRET_KEY: 'svc' });
  const mkf = (uid) => async (u, o = {}) => {
    if (u.includes('api.paystack.co')) return { json: async () => ({ status: true, data: { status: 'success', currency: 'NGN', amount: 70000, metadata: { school: 'ui' }, paid_at: new Date().toISOString() } }) };
    if (u.endsWith('/auth/v1/user')) return { ok: true, json: async () => ({ id: uid }) };
    if (u.endsWith('/rpc/crackit_add_purchase')) return { ok: true, json: async () => false }; // reference already recorded
    if (u.endsWith('/rpc/crackit_owns_pack')) return { ok: true, json: async () => uid === 'owner' };
    return { ok: false, json: async () => ({}) };
  };
  let [q, r] = mockH({ school: 'ui', ref: 'SHARED123' }, { authorization: 'Bearer good.token.value.123456' }); await fresh('./pack.js').handler(mkf('stranger'))(q, r);
  assert.equal(r.code, 409); assert.equal(r.body.questions, undefined);
  [q, r] = mockH({ school: 'ui', ref: 'SHARED123' }, { authorization: 'Bearer good.token.value.123456' }); await fresh('./pack.js').handler(mkf('owner'))(q, r);
  assert.equal(r.code, 200); assert.equal(r.body.questions.length, 15);
  delete process.env.SUPABASE_SECRET_KEY;
});

// ---- /api/ev (analytics) ----
test('ev: clean() keeps only allow-listed events and safe fields', () => {
  const ev = require('./ev.js');
  assert.equal(ev.clean({ e: 'hack' }), null);
  assert.equal(ev.clean({ e: 'pv', p: '/<script>' }), null);
  assert.deepEqual(ev.clean({ e: 'pv', p: '/daily/c/:x', x: 'waec', m: 'quick!!', v: '250', f: 1, a: 0, email: 'a@b.c', name: 'Ada' }), { e: 'pv', p: '/daily/c/:x', x: 'waec', m: 'quick', v: '250', f: 1, a: 0 });
  assert.equal(ev.clean({ e: 'pv', x: 'evil' }).x, 'jamb');
});
test('ev: falls back to the storage bucket when the RPC is missing, and never stores the IP', async () => {
  const ev = require('./ev.js');
  const calls = [];
  const f = async (u, o) => { calls.push([u, o]); return { ok: !u.includes('/rpc/'), status: u.includes('/rpc/') ? 404 : 200 }; };
  const where = await ev.store({ e: 'pv', p: '/', x: 'jamb', m: null, v: null, f: 1, a: 0 }, 'svc', f);
  assert.equal(where, 'bucket');
  assert.match(calls[1][0], /storage\/v1\/object\/crackit-analytics\/ev\/\d{4}-\d\d-\d\d\//);
  assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(calls[1][1].body));
});
