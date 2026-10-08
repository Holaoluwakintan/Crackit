// Browser wiring for Google sign-in (Supabase Auth, project shared with Michael's other apps; CrackIt data lives in schema `crackit`).
import * as C from './auth-core.js';
import { mergeProgress, forCloud, sameData, hasProgress } from './sync-core.js';
import { progress, replaceProgress, resetProgress, onSave, blank } from './store';
import type { Progress } from './types';
import { APP } from './config';

export const SUPA_URL = 'https://rlbrhpjljjgpqpqjrpkc.supabase.co';
export const SUPA_KEY = 'sb_publishable_NT2VXfEUwWEEdcuft2VdDA_9DXSaMq4'; // publishable key (safe in the browser; RLS protects the data)
const env = {
  url: SUPA_URL, key: SUPA_KEY, fetch: (u: string, o?: RequestInit) => fetch(u, o), storage: localStorage,
  now: () => Date.now(), subtle: crypto.subtle, random: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
};
const LINKED = APP.storageKey + ':linked:v1';
const SYNCED = APP.storageKey + ':synced:v1';

export interface User { id: string; email: string; name: string; avatar: string }
export type SyncState = 'off' | 'syncing' | 'saved' | 'offline' | 'error';
let state: SyncState = 'off';
let lastSynced = +(localStorage.getItem(SYNCED) || 0);
let authError = '';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(f => f());
export function subscribe(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }
export function user(): User | null { const s = C.loadSession(env); return s ? s.user : null; }
export function syncInfo() { return { state, lastSynced, error: authError }; }
export function clearAuthError() { authError = ''; emit(); }

export async function signInWithGoogle() {
  sessionStorage.setItem(APP.storageKey + ':return', location.hash || '#/');
  location.assign(await C.googleUrl(env, location.origin + '/'));
}
/** call once at startup, before the app renders routes */
export async function handleRedirect(): Promise<boolean> {
  if (!/[?&](code|error|error_description)=/.test(location.search)) return false;
  const res = await C.handleCallback(env, location.search);
  const back = sessionStorage.getItem(APP.storageKey + ':return') || '#/account';
  history.replaceState({ d: 0 }, '', location.pathname + back);
  if (res && res.error) authError = res.error;
  if (res && res.session) { await syncNow(); }
  emit();
  return true;
}
export async function signOut() {
  await pushNow().catch(() => null);
  await C.signOut(env);
  localStorage.removeItem(LINKED); localStorage.removeItem(SYNCED); lastSynced = 0;
  resetProgress(true); // the account keeps the progress; the phone goes back to a clean guest
  for (const k of Object.keys(localStorage)) if (k.startsWith(APP.storageKey + ':pack:')) localStorage.removeItem(k);
  state = 'off'; emit();
}
export async function deleteMyData() {
  await C.rpc(env, 'crackit_delete_my_data');
  await signOut();
}

let packsCb: ((packs: string[]) => void) | null = null;
export function onPacks(f: (packs: string[]) => void) { packsCb = f; }

let busy: Promise<void> | null = null;
export function syncNow(): Promise<void> {
  if (!user()) return Promise.resolve();
  return busy || (busy = (async () => {
    state = 'syncing'; emit();
    try {
      const me = user()!;
      const cloud = await C.rpc(env, 'crackit_get_state');
      const local = progress();
      const linked = localStorage.getItem(LINKED) === me.id;
      let merged: Progress;
      if (!cloud || !cloud.data) merged = local;
      else merged = mergeProgress(local, cloud.data, linked ? 'max' : (hasProgress(local) ? 'sum' : 'max')) as Progress;
      localStorage.setItem(LINKED, me.id);
      if (!sameData(merged, local)) replaceProgress(merged);
      const out = forCloud(merged);
      if (!cloud || !cloud.data || !sameData(out, cloud.data)) await C.rpc(env, 'crackit_put_state', { p_data: out });
      lastSynced = Date.now(); localStorage.setItem(SYNCED, String(lastSynced));
      state = 'saved';
      if (packsCb && cloud && Array.isArray(cloud.packs)) packsCb(cloud.packs);
      claimRef();
    } catch (e: any) {
      state = navigator.onLine === false || !e.status ? 'offline' : e.status === 401 && !user() ? 'off' : 'error';
    } finally { busy = null; emit(); }
  })());
}
// ---------- referral: the friend's side (attribution only; whether the referrer earns anything is decided in the database) ----------
const REF = APP.storageKey + ':ref';
async function claimRef() {
  const code = localStorage.getItem(REF); if (!code) return;
  try {
    const r = await C.rpc(env, 'crackit_ref_claim', { p_code: code });
    localStorage.setItem(REF + ':result', String(r)); localStorage.removeItem(REF);
  } catch (e: any) { /* 404 = referrals not switched on yet: keep the code and try on a later sync */ }
}
export interface RefStatus { invited: number; completed: number; rewarded: number; available: number }
/** null = referrals not switched on (SQL not run yet) or offline */
export async function refStatus(): Promise<RefStatus | null> { try { return await C.rpc(env, 'crackit_ref_status', {}); } catch { return null; } }
export async function refRedeem(pack: string): Promise<string> { try { return String(await C.rpc(env, 'crackit_ref_redeem', { p_pack: pack })); } catch { return 'error'; } }

let timer: any = 0;
let dirty = false;
export async function pushNow() {
  if (!user() || !dirty) return;
  dirty = false;
  try { await C.rpc(env, 'crackit_put_state', { p_data: forCloud(progress()) }); lastSynced = Date.now(); localStorage.setItem(SYNCED, String(lastSynced)); state = 'saved'; }
  catch { dirty = true; state = navigator.onLine === false ? 'offline' : 'error'; }
  emit();
}
export async function authHeader(): Promise<Record<string, string>> {
  const t = await C.accessToken(env); return t ? { Authorization: 'Bearer ' + t } : {};
}
export function startSync() {
  onSave(() => {
    if (!user()) return;
    dirty = true; clearTimeout(timer); timer = setTimeout(pushNow, 5000);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushNow(); else if (user() && Date.now() - lastSynced > 60000) syncNow(); });
  addEventListener('online', () => { if (user()) syncNow(); });
  if (user()) syncNow();
}
export async function resetEverywhere() {
  resetProgress(true);
  if (user()) await C.rpc(env, 'crackit_put_state', { p_data: forCloud(progress()) });
  emit();
}
export { blank };
