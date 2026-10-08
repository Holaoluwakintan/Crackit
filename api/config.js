// GET /api/config -> whether Paystack payments are switched on, and the PUBLIC key + price.
// Switch on in Vercel > Project crackit-ng > Settings > Environment Variables:
//   PAYMENTS_ENABLED=1, PAYSTACK_PUBLIC_KEY=pk_test_..., PAYSTACK_SECRET_KEY=sk_test_..., PACK_PRICE_NGN=700
// Live keys (pk_live_/sk_live_) are refused unless PAYSTACK_ALLOW_LIVE=1 is also set.
module.exports = (req, res) => {
  const pk = (process.env.PAYSTACK_PUBLIC_KEY || '').trim();
  const sk = (process.env.PAYSTACK_SECRET_KEY || '').trim();
  const price = parseInt(process.env.PACK_PRICE_NGN || '700', 10) || 700;
  const live = pk.startsWith('pk_live_');
  const allowLive = process.env.PAYSTACK_ALLOW_LIVE === '1';
  const enabled = process.env.PAYMENTS_ENABLED === '1' && !!pk && !!sk && (pk.startsWith('pk_test_') || (live && allowLive));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ enabled, key: enabled ? pk : '', price, mode: enabled ? (live ? 'live' : 'test') : 'off' });
};
