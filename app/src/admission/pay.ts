// Paystack inline checkout for premium Post-UTME packs. OFF unless the server says it's on (see /api/config).
// No key lives in this code: the public key comes from Vercel env vars, the secret key never leaves the server.
import { APP } from '../config';
import { authHeader } from '../auth';
export interface PayConfig { enabled: boolean; key: string; price: number; mode: 'test' | 'live' | 'off' }
let cfgP: Promise<PayConfig> | null = null;
const OFF = (price = 700): PayConfig => ({ enabled: false, key: '', price, mode: 'off' });
export function payConfig(): Promise<PayConfig> {
  return cfgP || (cfgP = fetch('/api/config', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => (j && j.enabled && j.key ? j : OFF((j && j.price) || 700))).catch(() => OFF()));
}
const PKEY = (sid: string) => APP.storageKey + ':pack:' + sid;
export function unlockedPack(sid: string): any[] | null {
  try { const j = JSON.parse(localStorage.getItem(PKEY(sid)) || 'null'); return j && Array.isArray(j.q) ? j.q : null; } catch { return null; }
}
let scriptP: Promise<void> | null = null;
function loadPaystack() {
  return scriptP || (scriptP = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://js.paystack.co/v2/inline.js'; s.onload = () => res(); s.onerror = () => { scriptP = null; rej(new Error('load')); }; document.head.appendChild(s);
  }));
}
export async function startCheckout(cfg: PayConfig, sid: string, email: string): Promise<string> {
  try { await loadPaystack(); } catch { return 'Could not load Paystack. Check your connection and try again.'; }
  const Pop = (window as any).PaystackPop; if (!Pop) return 'Paystack did not load.';
  return new Promise<string>(resolve => {
    new Pop().newTransaction({
      key: cfg.key, email, amount: cfg.price * 100, currency: 'NGN',
      metadata: { school: sid, pack: 'postutme', custom_fields: [{ display_name: 'Pack', variable_name: 'pack', value: sid + ' Post-UTME' }] },
      onSuccess: async (t: any) => {
        try {
          const r = await fetch(`/api/pack?school=${encodeURIComponent(sid)}&ref=${encodeURIComponent(t.reference)}`, { cache: 'no-store', headers: await authHeader() });
          if (!r.ok) { resolve('Payment received, but unlocking failed. Keep this reference and email it to ' + APP.contact + ': ' + t.reference); return; }
          const j = await r.json(); localStorage.setItem(PKEY(sid), JSON.stringify({ ref: t.reference, q: j.questions })); resolve('ok');
        } catch { resolve('Network problem after payment. Keep this reference and email it to ' + APP.contact + ': ' + t.reference); }
      },
      onCancel: () => resolve('Payment cancelled.'),
      onError: (e: any) => resolve('Paystack error: ' + ((e && e.message) || 'unknown')),
    });
  });
}

/** packs bought on another phone: the account says which, the server hands them over after checking the account owns them */
export async function restorePacks(packs: string[]) {
  for (const sid of packs) {
    if (unlockedPack(sid)) continue;
    try {
      const r = await fetch(`/api/pack?school=${encodeURIComponent(sid)}`, { cache: 'no-store', headers: await authHeader() });
      if (r.ok) { const j = await r.json(); localStorage.setItem(PKEY(sid), JSON.stringify({ ref: 'account', q: j.questions })); }
    } catch { /* try again next sync */ }
  }
}
