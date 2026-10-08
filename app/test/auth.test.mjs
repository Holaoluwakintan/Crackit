import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import * as C from '../src/auth-core.js';

function mem() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; }
function makeEnv(routes, now = 1_000_000) {
  const calls = [];
  const env = {
    url: 'https://x.supabase.co', key: 'sb_publishable_test', storage: mem(), now: () => env._now, _now: now,
    subtle: webcrypto.subtle, random: n => webcrypto.getRandomValues(new Uint8Array(n)),
    fetch: async (u, o = {}) => { calls.push({ u, o }); for (const [re, fn] of routes) if (re.test(u)) return fn(u, o); return { ok: false, status: 404, json: async () => ({}), text: async () => '' }; },
  };
  return { env, calls };
}
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => (body == null ? '' : JSON.stringify(body)) });
const tok = (extra = {}) => ({ access_token: 'acc.' + Math.random(), refresh_token: 'ref1', expires_in: 3600, user: { id: 'u1', email: 'ada@example.com', user_metadata: { full_name: 'Ada Obi', avatar_url: 'https://pic' } }, ...extra });

test('googleUrl: PKCE S256 challenge + redirect + verifier stored', async () => {
  const { env } = makeEnv([]);
  const u = new URL(await C.googleUrl(env, 'https://crackit-ng.vercel.app/'));
  assert.equal(u.pathname, '/auth/v1/authorize'); assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('redirect_to'), 'https://crackit-ng.vercel.app/'); assert.equal(u.searchParams.get('code_challenge_method'), 's256');
  const v = env.storage.getItem(C.VKEY); assert.ok(v && v.length >= 43);
  const d = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  assert.equal(u.searchParams.get('code_challenge'), C.b64url(d));
});
test('callback: exchanges the code with the stored verifier and saves the session', async () => {
  const { env, calls } = makeEnv([[/grant_type=pkce/, () => res(200, tok())]]);
  env.storage.setItem(C.VKEY, 'verifier123');
  const r = await C.handleCallback(env, '?code=abc');
  assert.equal(r.session.user.name, 'Ada Obi'); assert.equal(r.session.user.email, 'ada@example.com');
  assert.deepEqual(JSON.parse(calls[0].o.body), { auth_code: 'abc', code_verifier: 'verifier123' });
  assert.equal(calls[0].o.headers.apikey, 'sb_publishable_test');
  assert.equal(env.storage.getItem(C.VKEY), null, 'verifier is single-use'); assert.ok(C.loadSession(env));
});
test('callback: Google/Supabase errors surface as a message, no session', async () => {
  const { env } = makeEnv([[/grant_type=pkce/, () => res(400, { error_description: 'invalid flow state' })]]);
  assert.deepEqual(await C.handleCallback(env, '?error=access_denied&error_description=User+cancelled'), { error: 'User cancelled' });
  assert.equal(await C.handleCallback(env, '?foo=1'), null, 'not a callback');
  assert.match((await C.handleCallback(env, '?code=x')).error, /expired/);
  env.storage.setItem(C.VKEY, 'v'); assert.equal((await C.handleCallback(env, '?code=x')).error, 'invalid flow state'); assert.equal(C.loadSession(env), null);
});
test('accessToken: fresh token reused; near expiry it refreshes once; revoked refresh signs out', async () => {
  let n = 0;
  const { env } = makeEnv([[/grant_type=refresh_token/, () => { n++; return res(200, tok({ refresh_token: 'ref2' })); }]]);
  C.saveSession(env, C.sessionFrom(tok(), env.now()));
  const t1 = await C.accessToken(env); assert.ok(t1.startsWith('acc.')); assert.equal(n, 0);
  env._now += 3600 * 1000;
  const [a, b] = await Promise.all([C.accessToken(env), C.accessToken(env)]);
  assert.equal(n, 1, 'concurrent callers share one refresh'); assert.equal(a, b); assert.equal(C.loadSession(env).refresh_token, 'ref2');
  const bad = makeEnv([[/grant_type=refresh_token/, () => res(400, { error: 'invalid_grant' })]]);
  C.saveSession(bad.env, { ...C.sessionFrom(tok(), 0), expires_at: 0 });
  assert.equal(await C.accessToken(bad.env), null); assert.equal(C.loadSession(bad.env), null);
});
test('accessToken: offline refresh keeps the session (no surprise sign-out)', async () => {
  const { env } = makeEnv([[/grant_type=refresh_token/, () => { throw new Error('offline'); }]]);
  C.saveSession(env, { ...C.sessionFrom(tok(), 0), expires_at: 0 });
  assert.equal(await C.accessToken(env), null); assert.ok(C.loadSession(env), 'still signed in');
});
test('rpc sends the bearer token; signed-out rpc throws 401; signOut clears + calls logout', async () => {
  const { env, calls } = makeEnv([[/rpc\/crackit_get_state/, () => res(200, { data: { v: 1 }, packs: ['unilag'] })], [/logout/, () => res(204, null)]]);
  await assert.rejects(C.rpc(env, 'crackit_get_state'), e => e.status === 401);
  C.saveSession(env, C.sessionFrom(tok(), env.now()));
  const j = await C.rpc(env, 'crackit_get_state'); assert.deepEqual(j.packs, ['unilag']);
  assert.match(calls.at(-1).o.headers.Authorization, /^Bearer acc\./);
  await C.signOut(env); assert.equal(C.loadSession(env), null); assert.ok(calls.at(-1).u.endsWith('/auth/v1/logout'));
});
test('decodeJwt + userFrom fallbacks', () => {
  const p = Buffer.from(JSON.stringify({ sub: 'u1', email: 'a@b.c' })).toString('base64url');
  assert.equal(C.decodeJwt('h.' + p + '.s').sub, 'u1'); assert.equal(C.decodeJwt('junk'), null);
  assert.equal(C.userFrom({ user: { id: 'x', email: 'kemi@mail.com' } }).name, 'kemi');
});
