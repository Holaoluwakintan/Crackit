// Tiny Supabase Auth client (Google, PKCE) with no SDK. Pure: every side effect comes in through `env`,
// so test/auth.test.mjs can drive it with a mocked fetch + storage.
// env = { url, key, fetch, storage (getItem/setItem/removeItem), now(): ms, subtle, random(n): Uint8Array, origin }
export const SKEY = 'crackit:auth:v1';
export const VKEY = 'crackit:pkce:v1';

export function b64url(bytes) {
  let s = ''; const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeJwt(t) {
  try { const p = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(decodeURIComponent(escape(atob(p + '==='.slice((p.length + 3) % 4))))); } catch { return null; }
}
export function userFrom(j) {
  const u = j.user || {}; const m = u.user_metadata || {};
  return { id: u.id, email: u.email || m.email || '', name: m.full_name || m.name || (u.email || '').split('@')[0] || 'Student', avatar: m.avatar_url || m.picture || '' };
}
export function sessionFrom(j, now) {
  if (!j || !j.access_token || !j.refresh_token) return null;
  const exp = j.expires_at ? j.expires_at * 1000 : now + (j.expires_in || 3600) * 1000;
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: exp, user: userFrom(j) };
}
export function loadSession(env) { try { return JSON.parse(env.storage.getItem(SKEY) || 'null'); } catch { return null; } }
export function saveSession(env, s) { if (s) env.storage.setItem(SKEY, JSON.stringify(s)); else env.storage.removeItem(SKEY); }

/** returns the URL to send the browser to (and stores the PKCE verifier) */
export async function googleUrl(env, redirectTo) {
  const verifier = b64url(env.random(48));
  const digest = await env.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  env.storage.setItem(VKEY, verifier);
  const q = new URLSearchParams({ provider: 'google', redirect_to: redirectTo, code_challenge: b64url(digest), code_challenge_method: 's256' });
  return env.url + '/auth/v1/authorize?' + q.toString();
}
async function token(env, grant, body) {
  const r = await env.fetch(env.url + '/auth/v1/token?grant_type=' + grant, {
    method: 'POST', headers: { apikey: env.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = null; try { j = await r.json(); } catch { j = null; }
  if (!r.ok) { const e = new Error((j && (j.error_description || j.msg || j.message || j.error)) || ('auth ' + r.status)); e.status = r.status; throw e; }
  return j;
}
/** handle ?code=… (or ?error=…) after Google; returns {session} or {error} or null when the URL is not a callback */
export async function handleCallback(env, search) {
  const p = new URLSearchParams(search);
  if (p.get('error') || p.get('error_description')) return { error: p.get('error_description') || p.get('error') };
  const code = p.get('code'); if (!code) return null;
  const verifier = env.storage.getItem(VKEY);
  if (!verifier) return { error: 'Sign-in expired. Please tap Sign in with Google again.' };
  try {
    const j = await token(env, 'pkce', { auth_code: code, code_verifier: verifier });
    env.storage.removeItem(VKEY);
    const s = sessionFrom(j, env.now()); if (!s) return { error: 'Sign-in failed.' };
    saveSession(env, s); return { session: s };
  } catch (e) { return { error: e.message || 'Sign-in failed.' }; }
}
let refreshing = null;
/** a valid access token, refreshing when it is within 60 s of expiry; null when signed out or refresh is refused */
export async function accessToken(env) {
  const s = loadSession(env); if (!s) return null;
  if (s.expires_at - 60000 > env.now()) return s.access_token;
  if (!refreshing) refreshing = (async () => {
    try {
      const j = await token(env, 'refresh_token', { refresh_token: s.refresh_token });
      const ns = sessionFrom(j, env.now()); saveSession(env, ns); return ns && ns.access_token;
    } catch (e) {
      if (e.status && e.status >= 400 && e.status < 500) saveSession(env, null); // refresh token revoked/expired: signed out
      return null;
    } finally { refreshing = null; }
  })();
  return refreshing;
}
export async function signOut(env) {
  const s = loadSession(env); saveSession(env, null);
  if (s) { try { await env.fetch(env.url + '/auth/v1/logout', { method: 'POST', headers: { apikey: env.key, Authorization: 'Bearer ' + s.access_token } }); } catch { /* offline: token just expires */ } }
}
export async function rpc(env, fn, body) {
  const t = await accessToken(env); if (!t) { const e = new Error('signed_out'); e.status = 401; throw e; }
  const r = await env.fetch(env.url + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { apikey: env.key, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), keepalive: true,
  });
  if (!r.ok) { const e = new Error('rpc ' + fn + ' ' + r.status); e.status = r.status; throw e; }
  const txt = await r.text(); return txt ? JSON.parse(txt) : null;
}
