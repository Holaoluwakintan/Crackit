// GET /api/auth-status -> { google: true | false | null }
// Google sign-in needs https://rlbrhpjljjgpqpqjrpkc.supabase.co/auth/v1/callback on the Google OAuth client.
// Until Michael adds it, Google answers "redirect_uri_mismatch". This asks Google the same question a phone would
// (no sign-in happens) and caches the answer at the edge for 10 minutes, so the button switches itself on once it's fixed.
const SUPA_URL = (process.env.SUPABASE_URL || 'https://rlbrhpjljjgpqpqjrpkc.supabase.co').replace(/\/+$/, '');
async function probe(f) {
  const a = await f(SUPA_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent('https://crackit-ng.vercel.app/'), { redirect: 'manual' });
  const loc = a.headers.get('location') || '';
  if (!/^https:\/\/accounts\.google\.com\//.test(loc)) return null;
  const g = await f(loc, { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Mobile Safari/537.36' } });
  const body = await g.text();
  if (/redirect_uri_mismatch|invalid_client|deleted_client|disabled_client/.test(body + ' ' + g.url)) return false;
  return true;
}
function handler(f) {
  return async (req, res) => {
    let google = null;
    if (process.env.GOOGLE_SIGNIN === 'on') google = true;
    else if (process.env.GOOGLE_SIGNIN === 'off') google = false;
    else { try { google = await probe(f); } catch (e) { google = null; } }
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400');
    res.status(200).json({ google });
  };
}
module.exports = handler((u, o) => fetch(u, o));
module.exports.handler = handler;
module.exports.probe = probe;
