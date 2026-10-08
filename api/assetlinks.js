// GET /.well-known/assetlinks.json (rewritten here by vercel.json) -> Digital Asset Links for the CrackIt Android app,
// so the Play Store app opens full-screen (no browser bar). The upload key is built in; the Play App Signing key
// (Play Console > Test and release > App integrity > App signing key certificate > SHA-256) can be added later
// WITHOUT a redeploy: insert it into crackit.config key 'assetlinks_extra_sha256' (a JSON array of fingerprints).
const PKG = 'com.holaoluwakintan.crackit';
const BUILTIN = ['97:82:27:CF:56:E2:BB:88:E4:AD:70:9E:A2:19:88:26:84:CA:EF:52:B0:C5:03:22:10:5D:9E:4D:3F:05:9C:36'];
const SUPA_URL = 'https://rlbrhpjljjgpqpqjrpkc.supabase.co';
const PUB = 'sb_publishable_NT2VXfEUwWEEdcuft2VdDA_9DXSaMq4';
function handler(f) {
  return async (req, res) => {
    let extra = [];
    try {
      const r = await f(SUPA_URL + '/rest/v1/rpc/crackit_assetlinks_extra', { method: 'POST', headers: { apikey: PUB, 'Content-Type': 'application/json' }, body: '{}' });
      if (r.ok) { const j = await r.json(); if (Array.isArray(j)) extra = j.filter(x => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(String(x))); }
    } catch (e) { /* built-in key still works */ }
    const fps = [...new Set([...BUILTIN, ...extra])];
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.status(200).send(JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PKG, sha256_cert_fingerprints: fps } }]));
  };
}
module.exports = handler((u, o) => fetch(u, o));
module.exports.handler = handler;
