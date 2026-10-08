import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { APP } from './config';
import { loadMeta, loadSubject, loadSubjects, loaded } from './data';
import type { Exam, MockRecord, Q, SubjectData, SubjectMeta } from './types';
import { activeKeys, bestScore, finishExam, isOn, loadExam, markActive, pick, progress, recordAnswer, resetProgress, save, saveExam, streak, todayCount, toggleBookmark, weakTopics } from './store';
import { clearAuthError, deleteMyData, resetEverywhere, signInWithGoogle, signOut, subscribe, SUPA_KEY, syncInfo, syncNow, user } from './auth';
import type { Progress } from './types';
import { buzz, isDark, setTheme, theme } from './fx';

const L = ['A', 'B', 'C', 'D'];

// ---------- routing (hash URLs + pushState so Android back walks the app's own history) ----------
type Listener = (h: string) => void;
const routeListeners = new Set<Listener>();
const curHash = () => location.hash.slice(1) || '/';
let lastRoute = curHash();
function depth(): number { return (history.state && history.state.d) || 0; }
function emit() { const h = curHash(); lastRoute = h; routeListeners.forEach(f => f(h)); window.scrollTo(0, 0); }
export const go = (p: string) => { history.pushState({ d: depth() + 1 }, '', '#' + p); emit(); };
export const replace = (p: string) => { history.replaceState({ d: depth() }, '', '#' + p); emit(); };
export const back = (fallback = '/') => { if (depth() > 0) history.back(); else replace(fallback); };
if (!history.state) history.replaceState({ d: 0 }, '', location.href);
addEventListener('popstate', () => {
  const to = curHash();
  const ssceLeaving = lastRoute.startsWith('/ssce/exam') && !to.startsWith('/ssce/exam') && !to.startsWith('/ssce/result') && examGuard();
  if (ssceLeaving) {
    if (!confirm('Leave the paper?\n\nYour answers are saved and you can continue from Home, but the timer keeps running.')) {
      history.pushState({ d: depth() + 1 }, '', '#/ssce/exam'); return;
    }
  } else if (lastRoute.startsWith('/exam') && !to.startsWith('/exam') && !to.startsWith('/result') && loadExam()) {
    if (!confirm('Leave the mock?\n\nYour answers are saved and you can continue from Home, but the timer keeps running.')) {
      history.pushState({ d: depth() + 1 }, '', '#/exam'); return;
    }
  }
  emit();
});
let examGuard: () => boolean = () => false;
export function setExamGuard(f: () => boolean) { examGuard = f; }
addEventListener('hashchange', () => { if (curHash() !== lastRoute) emit(); });
document.addEventListener('click', e => {
  const a = (e.target as HTMLElement).closest?.('a[href^="#/"]') as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  const to = a.getAttribute('href')!.slice(1);
  if (a.dataset.replace) replace(to); else if (to !== curHash()) go(to);
});
function useHash() {
  const [h, setH] = useState(curHash());
  useEffect(() => { routeListeners.add(setH); return () => { routeListeners.delete(setH); }; }, []);
  return h;
}
function parentOf(parts: string[]): string {
  if (parts[0] === 'ssce') {
    if (parts[1] === 'review') return '/ssce/result/' + parts[2];
    if (parts[1] === 'practice' && parts[3] !== undefined) return '/ssce/practice/' + parts[2];
    if (parts[1] === 'paper') return '/ssce/papers';
    return '/';
  }
  if (parts[0] === 'admission') return parts[1] === 'd' ? '/admission/r' : parts[1] ? '/admission' : '/';
  if (parts[0] === 'postutme') return parts[2] === 't' ? '/postutme/' + parts[1] : parts[1] ? '/postutme' : '/';
  if (parts[0] === 'practice' && parts[2] === 'wrong') return '/wrong';
  if (parts[0] === 'practice' && parts[2] === 'saved') return '/saved';
  if (parts[0] === 'practice' && parts[2] !== undefined) return '/practice/' + parts[1];
  if (parts[0] === 'practice' && parts[1]) return '/practice';
  if (parts[0] === 'review') return '/result/' + parts[1];
  if ((parts[0] === 'wrong' || parts[0] === 'saved') && parts[1]) return '/' + parts[0];
  return '/';
}

// ---------- share ----------
export const SITE = location.origin;
export function shareText(text: string) { return share(text); }
async function share(text: string, url = SITE) {
  const nav = navigator as any;
  if (nav.share) { try { await nav.share({ title: APP.name, text, url }); return; } catch (e: any) { if (e && e.name === 'AbortError') return; } }
  open('https://wa.me/?text=' + encodeURIComponent(text + ' ' + url), '_blank');
}
const inviteText = () => `Practise for JAMB, WAEC and NECO free with ${APP.name}: real CBT mocks, grades A1 to F9, explanations in English or Pidgin, and it works offline 📚`;

// ---------- exam mode: JAMB / WAEC / NECO ----------
export type Mode = 'jamb' | 'waec' | 'neco';
const MKEY = APP.storageKey + ':mode';
export function mode(): Mode { try { const m = localStorage.getItem(MKEY); return m === 'waec' || m === 'neco' ? m : 'jamb'; } catch { return 'jamb'; } }
const modeListeners = new Set<() => void>();
export function setMode(m: Mode) { try { localStorage.setItem(MKEY, m); } catch { /* ignore */ } modeListeners.forEach(f => f()); }
function useMode() { const [m, setM] = useState<Mode>(mode()); useEffect(() => { const f = () => setM(mode()); modeListeners.add(f); return () => { modeListeners.delete(f); }; }, []); return m; }
function ExamSwitch() {
  const m = useMode();
  const opts: [Mode, string, string][] = [['jamb', 'JAMB', 'UTME'], ['waec', 'WAEC', 'WASSCE'], ['neco', 'NECO', 'SSCE']];
  const i = opts.findIndex(o => o[0] === m);
  return (
    <div class="xswitch" role="tablist" aria-label="Choose your exam" style={{ '--i': i } as any}>
      <i class="xs-thumb" aria-hidden="true" />
      {opts.map(([k, l, s]) => <button role="tab" aria-selected={m === k} class={m === k ? 'on' : ''} onClick={() => { buzz(8); setMode(k); }}><b>{l}</b><small>{s}</small></button>)}
    </div>
  );
}
let ssceMod: any = null;
function SsceLazy({ parts, exam }: { parts: string[]; exam: 'waec' | 'neco' }) {
  const [m, setM] = useState<any>(ssceMod);
  const [err, setErr] = useState(false);
  useEffect(() => { if (!m) import('./ssce/ui').then(x => { ssceMod = x; setM(x); }).catch(() => setErr(true)); }, []);
  if (err) return <div class="card">Couldn't load this page. Check your connection and try again.</div>;
  if (!m) return <Skeleton rows={5} />;
  const C = m.default;
  return <C parts={parts} exam={exam} />;
}
function ssceTitle(parts: string[]) {
  const k = parts[1];
  return k === 'subjects' ? 'Your subjects' : k === 'paper' ? 'Timed paper' : k === 'papers' ? 'Timed papers' : k === 'result' ? 'Your result' : k === 'review' ? 'Review' : k === 'practice' ? 'Practice' : k === 'credits' ? '5 credits tracker' : k === 'premium' ? 'CrackIt Premium' : 'WAEC / NECO';
}

// ---------- shared premium UI bits ----------
export function Ring({ pct, size = 64, stroke = 6, cls = '', children }: { pct: number; size?: number; stroke?: number; cls?: string; children?: ComponentChildren }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, pct || 0));
  return (
    <div class={'pring ' + cls} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle class="ring-bg" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} fill="none" />
        <circle class="ring-fg" cx={size / 2} cy={size / 2} r={r} stroke-width={stroke} fill="none" stroke-linecap="round" stroke-dasharray={c} stroke-dashoffset={c * (1 - v / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div class="ring-c">{children}</div>
    </div>
  );
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div class="stack skel" aria-busy="true" aria-label="Loading">
      <div class="sk sk-hero" />
      {Array.from({ length: rows }, (_, i) => <div class="sk sk-row" style={{ animationDelay: i * 90 + 'ms' }} />)}
    </div>
  );
}
function ThemeBtn() {
  const [t, setT] = useState(theme());
  const next = t === 'auto' ? (isDark() ? 'light' : 'dark') : t === 'dark' ? 'light' : 'dark';
  return <button class="iconbtn themebtn" aria-label={isDark() ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => { setTheme(next as any); setT(next as any); }}>{isDark() ? '☀️' : '🌙'}</button>;
}

function useMeta() {
  const [m, setM] = useState<SubjectMeta[] | null>(null);
  useEffect(() => { loadMeta().then(setM); }, []);
  return m;
}

function useAuth() {
  const [, tick] = useState(0);
  useEffect(() => subscribe(() => tick(x => x + 1)), []);
  return { u: user(), info: syncInfo() };
}
export function App() {
  const h = useHash();
  useAuth();
  const meta = useMeta();
  const parts = h.split('/').filter(Boolean);
  const md = useMode();
  let page: ComponentChildren;
  let title = '';
  if (!meta) page = <Skeleton rows={5} />;
  else if (parts[0] === 'ssce') { page = <SsceLazy parts={parts} exam={md === 'neco' ? 'neco' : 'waec'} />; title = ssceTitle(parts); }
  else if (parts[0] === 'mock') { page = <MockSetup meta={meta} quick={parts[1] === 'quick'} />; title = parts[1] === 'quick' ? 'Quick test' : 'Full mock'; }
  else if (parts[0] === 'exam') page = <ExamScreen meta={meta} />;
  else if (parts[0] === 'result') { page = <Result meta={meta} id={parts[1]} />; title = 'Your score'; }
  else if (parts[0] === 'review') { page = <Review meta={meta} id={parts[1]} filter={parts[2] || 'all'} />; title = 'Review'; }
  else if (parts[0] === 'practice' && parts[2] !== undefined) { page = <Practice meta={meta} sid={parts[1]} topic={parts[2]} diff={parts[3] || 'all'} />; title = parts[2] === 'wrong' ? 'Retry wrong answers' : parts[2] === 'saved' ? 'Saved questions' : 'Practice'; }
  else if (parts[0] === 'account') { page = <Account meta={meta} />; title = 'Your account'; }
  else if (parts[0] === 'wrong') { page = <ListPage meta={meta} kind="wrong" />; title = 'My wrong answers'; }
  else if (parts[0] === 'saved') { page = <ListPage meta={meta} kind="saved" />; title = 'Saved questions'; }
  else if (parts[0] === 'practice' && parts[1]) { page = <Topics meta={meta} sid={parts[1]} />; title = meta.find(m => m.id === parts[1])?.name || 'Practice'; }
  else if (parts[0] === 'practice') { page = <PracticeHome meta={meta} />; title = 'Practice'; }
  else if (parts[0] === 'progress') { page = <ProgressPage meta={meta} />; title = 'Progress'; }
  else if (parts[0] === 'about') { page = <About meta={meta} />; title = 'About'; }
  else if (parts[0] === 'c') { page = <ChallengeLanding meta={meta} code={parts.slice(1).join('/')} />; title = 'Challenge'; }
  else if (parts[0] === 'admission' || parts[0] === 'postutme') { page = <AdmissionLazy parts={parts} />; title = admTitle(parts); }
  else page = md === 'jamb' ? <div class="stack"><ExamSwitch /><Home meta={meta} /></div> : <div class="stack"><ExamSwitch /><SsceLazy parts={['ssce']} exam={md} /></div>;
  const bare = parts[0] === 'exam' || (parts[0] === 'ssce' && parts[1] === 'exam');
  return (
    <div class={'shell' + (bare ? ' bare' : '')}>
      {!bare && <TopBar title={title} parent={parentOf(parts)} />}
      <main><div class="page" key={parts[0] === 'ssce' ? parts.slice(0, 3).join('/') : parts.slice(0, 2).join('/') + (parts.length ? '' : md)}>{page}</div></main>
      {!bare && <Footer />}
    </div>
  );
}

// ---------- admission checker + Post-UTME (loaded on demand so the JAMB practice stays as light as before) ----------
function admTitle(parts: string[]) {
  if (parts[0] === 'postutme') return parts[2] === 't' ? 'Timed practice' : 'Post-UTME practice';
  return parts[1] === 'r' ? 'Your chances' : parts[1] === 'd' ? 'Course check' : parts[1] === 's' ? 'School cut-offs' : 'Admission checker';
}
let admMod: any = null;
function AdmissionLazy({ parts }: { parts: string[] }) {
  const [m, setM] = useState<any>(admMod);
  const [err, setErr] = useState(false);
  useEffect(() => { if (!m) import('./admission/ui').then(x => { admMod = x; setM(x); }).catch(() => setErr(true)); }, []);
  if (err) return <div class="card">Couldn't load this page. Check your connection and try again.</div>;
  if (!m) return <Loading />;
  const C = m.default;
  return <C parts={parts} />;
}

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#0b5d3b" />
      <path d="M17 33.5 27.5 44 47 22" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="49" cy="15" r="5" fill="#f5b700" />
    </svg>
  );
}
function TopBar({ title, parent }: { title: string; parent: string }) {
  if (title) {
    return (
      <header class="top">
        <button class="iconbtn" aria-label="Back" onClick={() => back(parent)}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <span class="toptitle">{title}</span>
        <a href="#/" class="iconbtn" aria-label="Home"><Logo size={26} /></a>
      </header>
    );
  }
  return (
    <header class="top">
      <a href="#/" class="brand"><Logo /><span>{APP.name}</span></a>
      <nav>
        <a href="#/practice">Practice</a>
        <a href="#/progress">Progress</a>
        <AccountChip />
        <ThemeBtn />
        <button class="iconbtn share" aria-label="Share" onClick={() => share(inviteText())}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6" /><circle cx="6" cy="12" r="2.6" /><circle cx="18" cy="19" r="2.6" /><path d="M8.3 10.7l7.4-4.2M8.3 13.3l7.4 4.2" /></g></svg>
        </button>
      </nav>
    </header>
  );
}
function Avatar({ size = 30 }: { size?: number }) {
  const u = user();
  if (!u) return null;
  const ini = (u.name || u.email || '?').trim().charAt(0).toUpperCase();
  return u.avatar
    ? <img class="avatar" src={u.avatar} width={size} height={size} alt="" referrerpolicy="no-referrer" loading="lazy" />
    : <span class="avatar ini" style={{ width: size, height: size }}>{ini}</span>;
}
function AccountChip() {
  const u = user();
  return u
    ? <a href="#/account" class="acct" aria-label="Your account"><Avatar size={28} /></a>
    : <a href="#/account" class="acct signin" aria-label="Sign in">Sign in</a>;
}
function GoogleG() {
  return <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>;
}
// Google readiness: /api/auth-status asks Google whether the redirect is set up (cached at the edge).
let gReady: Promise<boolean | null> | null = null;
function googleReady() {
  return gReady || (gReady = fetch('/api/auth-status').then(r => (r.ok ? r.json() : null)).then(j => (j ? j.google : null)).catch(() => null));
}
function useGoogleReady() {
  const [g, setG] = useState<boolean | null | undefined>(undefined);
  useEffect(() => { googleReady().then(setG); }, []);
  return g;
}
function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const g = useGoogleReady();
  const [busy, setBusy] = useState(false);
  if (g === false) return <p class="notice small">Google sign-in is being switched on. Keep practising: your progress is safe on this phone and moves into your account the first time you sign in.</p>;
  return (
    <button class="btn gbtn" disabled={busy || !navigator.onLine} onClick={async () => { setBusy(true); try { await signInWithGoogle(); } catch { setBusy(false); } }}>
      <GoogleG /><span>{busy ? 'Opening Google…' : navigator.onLine ? label : 'Connect to the internet to sign in'}</span>
    </button>
  );
}
function SignInCard({ compact = false }: { compact?: boolean }) {
  const p = progress();
  const [hide, setHide] = useState(() => sessionStorage.getItem('crackit:hideSignin') === '1');
  if (user() || hide) return null;
  const has = p.practiced > 0 || p.history.length > 0;
  return (
    <section class="card signcard">
      <button class="x" aria-label="Not now" onClick={() => { sessionStorage.setItem('crackit:hideSignin', '1'); setHide(true); }}>×</button>
      <b>☁️ Sign in to save your progress</b>
      {!compact && <span>{has ? `Your ${p.history.length ? p.history.length + ' mock' + (p.history.length > 1 ? 's' : '') + ', ' : ''}streak and weak topics move into your account` : 'Keep your scores, streak, saved questions and packs'}, so they work on any phone.</span>}
      <GoogleButton label="Sign in with Google" />
    </section>
  );
}

function Footer() {
  return (
    <footer class="foot">
      <p>{APP.disclaimer}</p>
      <p><a href="#/about">About {APP.name}</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a> · v{APP.version} · works offline</p>
    </footer>
  );
}
function Loading() { return <Skeleton rows={4} />; }

// ---------- install prompt (Android Chrome) ----------
let deferredPrompt: any = null;
const installListeners = new Set<() => void>();
addEventListener('beforeinstallprompt', (e: Event) => { e.preventDefault(); deferredPrompt = e; installListeners.forEach(f => f()); });
addEventListener('appinstalled', () => { deferredPrompt = null; installListeners.forEach(f => f()); });
function InstallCard() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick(x => x + 1); installListeners.add(f); return () => { installListeners.delete(f); }; }, []);
  if (!deferredPrompt) return null;
  return (
    <button class="card install" onClick={async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice.catch(() => null); deferredPrompt = null; tick(x => x + 1); }}>
      <b>📲 Install {APP.name}</b><span>One tap from your home screen, works with data off.</span>
    </button>
  );
}

// ---------- home ----------
function Home({ meta }: { meta: SubjectMeta[] }) {
  const p = progress();
  const st = streak(p);
  const best = bestScore(p);
  const pending = loadExam();
  const weak = weakTopics(p, (sid, t) => meta.find(m => m.id === sid)?.topics[t]?.name).slice(0, 3);
  const total = meta.reduce((n, m) => n + m.count, 0);
  const u = user();
  const lv = level(p);
  const nWrong = activeKeys(p.wrong).length, nSaved = activeKeys(p.bm).length;
  return (
    <div class="stack">
      <section class="hero">
        {u ? <p class="hi">Welcome back, {u.name.split(' ')[0]} 👋</p> : null}
        <h1>Practise like it's the real JAMB CBT.</h1>
        <p>{total.toLocaleString()} original questions · {meta.filter(m => m.count).length} subjects · works offline.</p>
        <div class="stats">
          <div><b>{st}</b><span>day streak {st > 0 ? '🔥' : ''}</span></div>
          <div><b>{best >= 0 ? best : '–'}</b><span>best /400</span></div>
          <div><b class="lv">{lv.name}</b><span>level {lv.n}</span></div>
        </div>
        <div class="lvbar" aria-label={`${lv.toNext} questions to the next level`}><i style={{ width: lv.pct + '%' }} /></div>
        <small class="lvnote">{lv.next ? `${lv.toNext} more answers to reach ${lv.next}` : 'Top level reached. Legend!'}</small>
      </section>
      <DailyGoal />
      <SignInCard />
      <a class="card newcard" href="#/admission">
        <b>🎯 Admission Chance Checker <span class="new">NEW</span></b>
        <span>Type your JAMB score: see cut-offs and your chances at 25 universities.</span>
      </a>
      <a class="card newcard alt" href="#/postutme">
        <b>📝 Post-UTME practice by school</b>
        <span>UNILAG, UI, OAU, UNN and more. Timed, with explanations. 5 free per school.</span>
      </a>
      <InstallCard />
      {pending && (
        <a class="card resume" href="#/exam">
          <b>Continue your mock</b>
          <span>{Object.keys(pending.answers).length} answered · {fmtLeft(pending.startedAt + pending.duration - Date.now())} left</span>
        </a>
      )}
      <a class="btn big primary" href="#/mock">
        <span>Full UTME mock</span><small>English + 3 subjects · 180 questions · 2 hrs</small>
      </a>
      <a class="btn big" href="#/mock/quick">
        <span>Quick 20-question test</span><small>Timed, scored out of 400, about 15 minutes</small>
      </a>
      <a class="btn big" href="#/practice">
        <span>Practise by topic</span><small>Pick a subject, topic and difficulty. Instant explanations</small>
      </a>
      <div class="duo">
        <a class="card tile" href="#/wrong"><b>❌ {nWrong}</b><span>Review my wrong answers</span></a>
        <a class="card tile" href="#/saved"><b>⭐ {nSaved}</b><span>Saved questions</span></a>
      </div>
      {weak.length > 0 && (
        <section class="card">
          <h3>Work on these next</h3>
          {weak.map(w => (
            <a class="row link" href={`#/practice/${w.sid}/${w.t}`}>
              <span>{w.name}<small>{meta.find(m => m.id === w.sid)?.name}</small></span><em class="bad">{Math.round(w.acc * 100)}%</em>
            </a>
          ))}
        </section>
      )}
      <section class="card">
        <h3>Subjects</h3>
        {meta.map(m => (
          <a class={'row link' + (m.count ? '' : ' off')} href={m.count ? `#/practice/${m.id}` : undefined}>
            <span>{m.name}{m.compulsory && <small>compulsory</small>}</span>
            <em>{m.count ? m.count + ' questions' : 'coming soon'}</em>
          </a>
        ))}
      </section>
    </div>
  );
}

// ---------- motivation: levels + daily goal ----------
const LEVELS: [number, string][] = [[0, 'Starter'], [50, 'Learner'], [150, 'Reader'], [400, 'Scholar'], [800, 'Achiever'], [1500, 'Ace'], [3000, 'Cracker'], [6000, 'Legend']];
function answeredTotal(p: Progress) { return Object.values(p.topics).reduce((n, s) => n + s.n, 0); }
function level(p: Progress) {
  const a = answeredTotal(p);
  let i = 0; while (i + 1 < LEVELS.length && a >= LEVELS[i + 1][0]) i++;
  const next = LEVELS[i + 1];
  const pct = next ? Math.round(((a - LEVELS[i][0]) / (next[0] - LEVELS[i][0])) * 100) : 100;
  return { n: i + 1, name: LEVELS[i][1], next: next ? next[1] : '', toNext: next ? next[0] - a : 0, pct };
}
function DailyGoal() {
  const p = progress();
  const [goal, setGoal] = useState(p.goal || 20);
  const [edit, setEdit] = useState(false);
  const done = todayCount(p);
  const pct = Math.min(100, Math.round((done / goal) * 100));
  return (
    <section class={'card goal' + (done >= goal ? ' met' : '')}>
      <div class="goal-ring" style={{ '--p': pct / 100 } as any}><b>{done >= goal ? '✓' : done}</b></div>
      <div class="goal-txt">
        <b>{done >= goal ? 'Daily goal done! 🎉' : "Today's goal"}</b>
        <span>{done} of {goal} questions{done < goal ? ` · ${goal - done} to go` : ''}</span>
        {edit ? (
          <div class="seg tiny">
            {[10, 20, 40, 60].map(g => <button class={g === goal ? 'on' : ''} onClick={() => { const pp = progress(); pp.goal = g; save(pp); setGoal(g); setEdit(false); }}>{g}</button>)}
          </div>
        ) : <button class="linkbtn" onClick={() => setEdit(true)}>Change goal</button>}
      </div>
      {done < goal && <a class="btn sm primary" href="#/practice">Go</a>}
    </section>
  );
}

// ---------- account ----------
function ago(ts: number) {
  if (!ts) return 'not yet';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : new Date(ts).toLocaleDateString('en-NG');
}
function Account({ meta }: { meta: SubjectMeta[] }) {
  const { u, info } = useAuth();
  const p = progress();
  const [busy, setBusy] = useState(false);
  const saved = activeKeys(p.bm).length, wrong = activeKeys(p.wrong).length;
  const what = (
    <ul class="ticks">
      <li>Mock scores and history ({p.history.length})</li>
      <li>Day streak, level and daily goal</li>
      <li>Topic scores and weak topics</li>
      <li>Saved questions ({saved}) and wrong answers to retry ({wrong})</li>
      <li>Post-UTME packs you buy</li>
    </ul>
  );
  const err = info.error ? (
    <p class="notice bad small">Sign-in didn't finish: {info.error} <button class="linkbtn" onClick={clearAuthError}>OK</button></p>
  ) : null;
  if (!u) {
    return (
      <div class="stack">
        <section class="card center accthero">
          <div class="bigicon">☁️</div>
          <h2>Save your progress</h2>
          <p class="muted">Sign in once and your progress follows you to any phone. You can still practise without an account.</p>
          {err}
          <GoogleButton />
        </section>
        <section class="card"><h3>What gets saved</h3>{what}</section>
        <p class="muted small center">We only use your name, email and photo from Google to show your account and save your progress. Under 18? Ask a parent or guardian before signing in. <a href="/privacy/">Privacy policy</a> · <a href="/terms/">Terms</a></p>
      </div>
    );
  }
  const label = info.state === 'syncing' ? 'Saving…' : info.state === 'saved' ? `Saved to your account · ${ago(info.lastSynced)}` : info.state === 'offline' ? 'Offline: will save when you reconnect' : info.state === 'error' ? 'Could not save just now. Tap Sync now.' : 'Not synced yet';
  return (
    <div class="stack">
      <section class="card accthero">
        <div class="me"><Avatar size={56} /><div><b>{u.name}</b><span class="muted small">{u.email}</span></div></div>
        <p class={'sync ' + info.state}><i />{label}</p>
        <button class="btn" disabled={info.state === 'syncing'} onClick={() => syncNow()}>🔄 Sync now</button>
      </section>
      {err}
      <section class="card"><h3>Saved in your account</h3>{what}</section>
      <section class="card stats4">
        <div><b>{streak(p)}</b><span>day streak</span></div>
        <div><b>{level(p).name}</b><span>level</span></div>
        <div><b>{answeredTotal(p)}</b><span>answered</span></div>
        <div><b>{meta.filter(m => m.count).length}</b><span>subjects</span></div>
      </section>
      <button class="btn" disabled={busy} onClick={async () => { if (!confirm('Sign out?\n\nYour progress stays safe in your account. This phone goes back to a fresh guest.')) return; setBusy(true); await signOut(); setBusy(false); replace('/'); }}>Sign out</button>
      <button class="btn ghost danger" disabled={busy} onClick={async () => {
        if (!confirm('Delete all your CrackIt data?\n\nThis removes your saved progress, scores and purchases from your account and this phone. It cannot be undone.')) return;
        setBusy(true);
        try { await deleteMyData(); alert('Done. Your CrackIt data has been deleted.'); replace('/'); } catch { alert('Could not delete right now. Check your connection and try again.'); }
        setBusy(false);
      }}>Delete my CrackIt data</button>
    </div>
  );
}

// ---------- wrong answers + saved questions ----------
function ListPage({ meta, kind }: { meta: SubjectMeta[]; kind: 'wrong' | 'saved' }) {
  const p = progress();
  const map = kind === 'wrong' ? p.wrong : p.bm;
  const by = meta.map(m => ({ m, n: activeKeys(map, m.id).length })).filter(x => x.n > 0);
  const total = by.reduce((n, x) => n + x.n, 0);
  return (
    <div class="stack">
      <p class="muted">{kind === 'wrong'
        ? 'Every question you got wrong, in practice or a mock. Get it right on a retry and it leaves this list.'
        : 'Questions you starred ⭐. Tap the star on any question to save it here.'}</p>
      {total === 0 && <div class="card center">{kind === 'wrong' ? 'No wrong answers waiting. 🎉 Practise a topic and anything you miss shows up here.' : 'Nothing saved yet. Tap ☆ on a question while practising.'}<p><a class="btn primary" href="#/practice">Practise now</a></p></div>}
      {by.map(({ m, n }) => (
        <a class="card row link" href={`#/practice/${m.id}/${kind}`}>
          <span><b>{m.name}</b><small>{n} question{n > 1 ? 's' : ''}</small></span><em>{kind === 'wrong' ? 'Retry ›' : 'Practise ›'}</em>
        </a>
      ))}
    </div>
  );
}

// ---------- mock setup ----------
function MockSetup({ meta, quick }: { meta: SubjectMeta[]; quick: boolean }) {
  const avail = meta.filter(m => m.count > 0);
  const others = avail.filter(m => !m.compulsory);
  const [sel, setSel] = useState<string[]>(others.slice(0, 3).map(m => m.id));
  const [mins, setMins] = useState(quick ? 15 : 120);
  const [busy, setBusy] = useState(false);
  const eng = avail.find(m => m.compulsory);
  const toggle = (id: string) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : s.length >= 3 ? s : [...s, id]);
  const ok = sel.length === 3 && !!eng;
  const start = async () => {
    if (!ok || !eng) return;
    setBusy(true);
    const ids = [eng.id, ...sel];
    const data = await loadSubjects(ids);
    const p = progress();
    const counts = quick ? [5, 5, 5, 5] : [60, 40, 40, 40];
    const e: Exam = {
      id: Date.now().toString(36), mode: quick ? 'quick' : 'full', startedAt: Date.now(), duration: mins * 60000,
      subjects: ids.map((sid, i) => ({ sid, qids: pick(data[sid], counts[i], p).map(q => q.id) })),
      answers: {}, cur: { s: 0, i: 0 },
    };
    saveExam(e);
    go('/exam');
  };
  const nq = quick ? 20 : sel.reduce((n, id) => n + Math.min(40, avail.find(m => m.id === id)!.count), Math.min(60, eng?.count || 0));
  return (
    <div class="stack">
      <h2>{quick ? 'Quick 20-question test' : 'Full UTME mock'}</h2>
      <p class="muted">Use of English is compulsory. Pick 3 more subjects, just like your JAMB combination.</p>
      <div class="card">
        {eng && <label class="check on locked"><input type="checkbox" checked disabled /> {eng.name} <small>compulsory</small></label>}
        {others.map(m => (
          <label class={'check' + (sel.includes(m.id) ? ' on' : '')}>
            <input type="checkbox" checked={sel.includes(m.id)} onChange={() => toggle(m.id)} /> {m.name}
          </label>
        ))}
        {meta.filter(m => !m.count).map(m => <label class="check off"><input type="checkbox" disabled /> {m.name} <small>coming soon</small></label>)}
      </div>
      <div class="card">
        <h3>Time</h3>
        <div class="seg">
          {(quick ? [10, 15, 20] : [60, 90, 120]).map(t => (
            <button class={t === mins ? 'on' : ''} onClick={() => setMins(t)}>{t >= 60 ? (t / 60) + (t === 60 ? ' hour' : ' hours') : t + ' min'}</button>
          ))}
        </div>
        <p class="muted small">{nq} questions. Score is out of 400 (100 per subject). Keyboard: A–D to answer, N next, P previous, S submit.</p>
      </div>
      <button class="btn primary big center" disabled={!ok || busy} onClick={start}>{busy ? 'Preparing…' : ok ? 'Start exam' : `Pick ${3 - sel.length} more subject${3 - sel.length === 1 ? '' : 's'}`}</button>
    </div>
  );
}

function fmtLeft(ms: number) {
  ms = Math.max(0, ms);
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(x).padStart(2, '0');
}

// ---------- exam ----------
function ExamScreen({ meta }: { meta: SubjectMeta[] }) {
  const [exam, setExamState] = useState<Exam | null>(() => loadExam());
  const examRef = useRef<Exam | null>(exam);
  const setExam = (e: Exam) => { examRef.current = e; setExamState(e); };
  const [data, setData] = useState<Record<string, SubjectData> | null>(null);
  const [now, setNow] = useState(Date.now());
  const [confirm, setConfirmState] = useState(false);
  const confirmRef = useRef(false);
  const setConfirm = (v: boolean) => { confirmRef.current = v; setConfirmState(v); };
  const [showGrid, setShowGrid] = useState(true);
  const [calc, setCalc] = useState(false);
  const calcRef = useRef(false); calcRef.current = calc;
  const done = useRef(false);

  useEffect(() => { if (!exam) { replace('/'); return; } loadSubjects(exam.subjects.map(s => s.sid)).then(setData); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const left = exam ? exam.startedAt + exam.duration - now : 0;
  const submit = () => {
    const e = examRef.current;
    if (!e || !data || done.current) return;
    done.current = true;
    const rec = finishExam({ ...e }, data);
    replace('/result/' + rec.id);
  };
  useEffect(() => { if (exam && data && left <= 0) submit(); }, [left <= 0, data]);

  const update = (e: Exam) => { setExam(e); saveExam(e); };
  const cur = exam?.cur || { s: 0, i: 0 };
  const qAt = (e: Exam) => { const sb = e.subjects[e.cur.s]; return data && sb ? data[sb.sid].questions.find(x => x.id === sb.qids[e.cur.i]) : undefined; };
  const sub = exam?.subjects[cur.s];
  const q: Q | undefined = useMemo(() => {
    if (!sub || !data) return undefined;
    return data[sub.sid].questions.find(x => x.id === sub.qids[cur.i]);
  }, [exam, data]);
  const key = sub && q ? sub.sid + ':' + q.id : '';
  const choose = (o: number) => {
    const e = examRef.current; if (!e) return;
    const qq = qAt(e); if (!qq) return;
    update({ ...e, answers: { ...e.answers, [e.subjects[e.cur.s].sid + ':' + qq.id]: o } });
  };
  const move = (d: number) => {
    const e = examRef.current; if (!e) return;
    const sb = e.subjects[e.cur.s];
    let { s, i } = e.cur; i += d;
    if (i >= sb.qids.length) { if (s < e.subjects.length - 1) { s++; i = 0; } else i = sb.qids.length - 1; }
    if (i < 0) { if (s > 0) { s--; i = e.subjects[s].qids.length - 1; } else i = 0; }
    update({ ...e, cur: { s, i } });
  };
  const jump = (s: number, i: number) => { const e = examRef.current; if (e) update({ ...e, cur: { s, i } }); };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || calcRef.current) return;
      const k = ev.key.toLowerCase();
      if (confirmRef.current) {
        if (k === 'y' || k === 'enter') submit();
        else if (k === 'n' || k === 'escape') setConfirm(false);
        return;
      }
      const ix = ['a', 'b', 'c', 'd'].indexOf(k);
      if (ix >= 0) choose(ix);
      else if (k === 'n' || k === 'arrowright') move(1);
      else if (k === 'p' || k === 'arrowleft') move(-1);
      else if (k === 's') setConfirm(true);
      else return;
      ev.preventDefault();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });

  if (!exam || !data || !sub || !q) return <Loading />;
  const answeredIn = (s: number) => exam.subjects[s].qids.filter(id => exam.answers[exam.subjects[s].sid + ':' + id] !== undefined).length;
  const totalQ = exam.subjects.reduce((n, s) => n + s.qids.length, 0);
  const answered = Object.keys(exam.answers).length;
  const name = (sid: string) => meta.find(m => m.id === sid)?.name || sid;
  const isLast = cur.s === exam.subjects.length - 1 && cur.i === sub.qids.length - 1;
  return (
    <div class="exam">
      <div class="exam-top">
        <div class="brand sm"><Logo size={24} /><span>{exam.mode === 'quick' ? 'Quick test' : 'Mock'}</span></div>
        <div class={'timer' + (left < 5 * 60000 ? ' low' : '')} role="timer" aria-label="time left">⏱ {fmtLeft(left)}</div>
        <button class="iconbtn calcbtn" aria-label="Calculator" onClick={() => setCalc(!calc)}>🧮</button>
        <button class="btn sm submit" onClick={() => setConfirm(true)}>Submit</button>
      </div>
      {calc && <Calculator onClose={() => setCalc(false)} />}
      <div class="tabs" role="tablist">
        {exam.subjects.map((s, i) => (
          <button role="tab" class={i === cur.s ? 'on' : ''} onClick={() => jump(i, 0)}>
            {short(name(s.sid))}<small>{answeredIn(i)}/{s.qids.length}</small>
          </button>
        ))}
      </div>
      <div class="progline" aria-hidden="true"><i style={{ width: (answered / totalQ) * 100 + '%' }} /></div>
      <div class="qcard">
        <div class="qmeta">{name(sub.sid)} · Question {cur.i + 1} of {sub.qids.length}</div>
        <QText text={q.q} />
        <div class="opts" role="radiogroup">
          {q.o.map((o, i) => (
            <button role="radio" aria-checked={exam.answers[key] === i} class={'opt' + (exam.answers[key] === i ? ' picked' : '')} onClick={() => choose(i)}>
              <b>{L[i]}</b><span>{o}</span>
            </button>
          ))}
        </div>
        <div class="navbtns">
          <button class="btn" onClick={() => move(-1)} disabled={cur.s === 0 && cur.i === 0}>‹ Previous</button>
          {isLast ? <button class="btn primary" onClick={() => setConfirm(true)}>Submit</button>
            : <button class="btn primary" onClick={() => move(1)}>Next ›</button>}
        </div>
      </div>
      <div class="gridwrap">
        <button class="gridhead" onClick={() => setShowGrid(!showGrid)}>
          <span>{answered} of {totalQ} answered</span><span>{showGrid ? 'Hide' : 'Show'} questions ▾</span>
        </button>
        {showGrid && (
          <div class="grid">
            {sub.qids.map((id, i) => (
              <button class={(exam.answers[sub.sid + ':' + id] !== undefined ? 'ans' : '') + (i === cur.i ? ' cur' : '')} onClick={() => jump(cur.s, i)}>{i + 1}</button>
            ))}
          </div>
        )}
        <p class="keys">Keys: <kbd>A</kbd>–<kbd>D</kbd> answer · <kbd>N</kbd> next · <kbd>P</kbd> previous · <kbd>S</kbd> submit</p>
      </div>
      {confirm && (
        <div class="modal" onClick={() => setConfirm(false)}>
          <div class="sheet" onClick={e => e.stopPropagation()}>
            <h3>Submit your exam?</h3>
            <p>You've answered <b>{answered}</b> of {totalQ} questions{answered < totalQ ? `. ${totalQ - answered} are still blank.` : '.'}</p>
            <p class="muted small">{fmtLeft(left)} left on the clock.</p>
            <div class="navbtns">
              <button class="btn" onClick={() => setConfirm(false)}>No, go back <kbd>N</kbd></button>
              <button class="btn primary" onClick={submit}>Yes, submit <kbd>Y</kbd></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// on-screen calculator, like the one on the real JAMB CBT screen
export function calcEval(expr: string): string {
  const s = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/√\(/g, 'Math.sqrt(').replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
  if (!/^[\d+\-*/().\sMathsqrt]*$/.test(s) || /[a-z]/i.test(s.replace(/Math\.sqrt/g, ''))) return 'Error';
  try { const v = Function('"use strict";return (' + (s || '0') + ')')(); return Number.isFinite(v) ? String(+(+v).toPrecision(10)) : 'Error'; } catch { return 'Error'; }
}
export function Calculator({ onClose }: { onClose: () => void }) {
  const [x, setX] = useState('');
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '%', '+', '(', ')', '√(', '='];
  const press = (k: string) => {
    if (k === '=') setX(v => calcEval(v));
    else setX(v => (v === 'Error' ? '' : v) + k);
  };
  return (
    <div class="calc" role="dialog" aria-label="Calculator">
      <div class="calc-top"><output>{x || '0'}</output><button class="iconbtn" aria-label="Close calculator" onClick={onClose}>✕</button></div>
      <div class="calc-keys">
        <button class="fn" onClick={() => setX('')}>C</button><button class="fn" onClick={() => setX(v => v.slice(0, -1))}>⌫</button>
        {keys.map(k => <button class={k === '=' ? 'eq' : /[÷×−+%()√]/.test(k) ? 'op' : ''} onClick={() => press(k)}>{k === '√(' ? '√' : k}</button>)}
      </div>
    </div>
  );
}
export function QText({ text, cls = 'qtext' }: { text: string; cls?: string }) {
  const i = text.indexOf('\n');
  if (i > 0 && /^(choose|select|which|pick|identify)/i.test(text) && i < 140) {
    return <div class={cls}><span class="instr">{text.slice(0, i)}</span>{text.slice(i + 1)}</div>;
  }
  return <p class={cls}>{text}</p>;
}
function short(n: string) { return n === 'Use of English' ? 'English' : n === 'Mathematics' ? 'Maths' : n === 'Literature-in-English' ? 'Literature' : n === 'Government' ? 'Govt' : n === 'Christian Religious Studies' ? 'CRS' : n === 'Principles of Accounts' ? 'Accounts' : n === 'Geography' ? 'Geog' : n; }

// ---------- result ----------
function findRecord(id: string): MockRecord | undefined { return progress().history.find(h => h.id === id); }
function Result({ meta, id }: { meta: SubjectMeta[]; id: string }) {
  const rec = findRecord(id);
  if (!rec) return <div class="card">Result not found. <a href="#/">Go home</a></div>;
  const p = progress();
  const best = bestScore(p, rec.mode);
  const name = (sid: string) => meta.find(m => m.id === sid)?.name || sid;
  const verdict = rec.total >= 300 ? 'Outstanding! 🎉' : rec.total >= 250 ? 'Excellent work!' : rec.total >= 200 ? 'Good, you are above 200.' : rec.total >= 160 ? 'Getting there. Keep practising.' : 'Every mock makes you stronger. Review and go again.';
  const right = rec.per.reduce((n, s) => n + s.correct, 0), all = rec.per.reduce((n, s) => n + s.total, 0);
  return (
    <div class="stack">
      <section class="score">
        <div class="ring" style={{ '--p': rec.total / 400 } as any}><div><b>{rec.total}</b><span>/ 400</span></div></div>
        <h2>{verdict}</h2>
        <p class="muted">{right} of {all} correct · time used {fmtLeft(rec.timeUsed)}{best === rec.total && p.history.filter(h => h.mode === rec.mode).length > 1 ? ' · new best!' : ''}</p>
      </section>
      <section class="card">
        <h3>By subject</h3>
        {rec.per.map(s => (
          <div class="bar">
            <div class="bar-l"><span>{name(s.sid)}</span><b>{s.score}<small>/100</small></b></div>
            <div class="track"><i style={{ width: s.score + '%' }} class={s.score >= 60 ? 'good' : s.score >= 40 ? 'mid' : 'low'} /></div>
            <small class="muted">{s.correct} of {s.total} correct</small>
          </div>
        ))}
      </section>
      {rec.exam.challenge && <ChallengeBanner rec={rec} right={right} all={all} />}
      {rec.mode === 'quick' && !rec.exam.challenge && <ChallengeButton rec={rec} right={right} all={all} label="⚔️ Challenge a friend on these 20 questions" />}
      <button class="btn" onClick={() => share(`I just scored ${rec.total}/400 on a JAMB ${rec.mode === 'quick' ? 'quick test' : 'mock'} with ${APP.name} 🔥 Practise free (works offline):`)}>📤 Share my score</button>
      <a class="btn primary big" href={`#/review/${rec.id}/wrong`}><span>Review wrong answers</span><small>See the right answer and why</small></a>
      <div class="navbtns">
        <a class="btn" href={`#/review/${rec.id}/all`}>Review all</a>
        <a class="btn" href={rec.mode === 'quick' ? '#/mock/quick' : '#/mock'}>{rec.mode === 'quick' ? 'New quick test' : 'New mock'}</a>
      </div>
      <a class="btn ghost" href="#/">Home</a>
    </div>
  );
}

// ---------- challenge a friend (no server: the link carries the questions) ----------
interface ChallengeCode { v: 1; n: string; c: number; t: number; m: number; q: [string, string[]][] }
function b64e(o: unknown) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64d(s: string): any { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(decodeURIComponent(escape(atob(s)))); }
function challengeLink(rec: MockRecord, name: string, right: number, all: number) {
  const code: ChallengeCode = { v: 1, n: name.slice(0, 24), c: right, t: all, m: Math.round(rec.exam.duration / 60000), q: rec.exam.subjects.map(s => [s.sid, s.qids]) };
  return SITE + '/#/c/' + b64e(code);
}
function askName(): string | null {
  const p = progress();
  if (p.name) return p.name;
  const u = user();
  if (u && u.name) { p.name = u.name.split(' ')[0].slice(0, 24); save(p); return p.name; }
  const n = (prompt('Your first name (your friend will see it):') || '').trim();
  if (!n) return null;
  p.name = n.slice(0, 24); save(p); return p.name;
}
function ChallengeButton({ rec, right, all, label = '⚔️ Challenge a friend' }: { rec: MockRecord; right: number; all: number; label?: string }) {
  return (
    <button class="btn challenge" onClick={() => {
      const n = askName(); if (!n) return;
      const url = challengeLink(rec, n, right, all);
      const vs = rec.exam.challenge ? `I got ${right}/${all} (you got ${rec.exam.challenge.correct}). Rematch?` : `I got ${right}/${all}. Can you beat me?`;
      share(`⚔️ ${APP.name} JAMB challenge: same ${all} questions, ${Math.round(rec.exam.duration / 60000)} minutes. ${vs}`, url);
    }}>{label}</button>
  );
}
function ChallengeBanner({ rec, right, all }: { rec: MockRecord; right: number; all: number }) {
  const c = rec.exam.challenge!;
  const verdict = right > c.correct ? 'You win! 🏆' : right === c.correct ? "It's a draw 🤝" : `${c.from} wins this round 😅`;
  return (
    <section class="card vs">
      <div class="vs-row">
        <div><b>{right}<small>/{all}</small></b><span>You</span></div>
        <em>vs</em>
        <div><b>{c.correct}<small>/{c.total}</small></b><span>{c.from}</span></div>
      </div>
      <h3>{verdict}</h3>
      <div class="navbtns">
        <ChallengeButton rec={rec} right={right} all={all} label={`Send result to ${c.from}`} />
        <a class="btn" href="#/mock/quick">Rematch (new Qs)</a>
      </div>
    </section>
  );
}
function ChallengeLanding({ meta, code }: { meta: SubjectMeta[]; code: string }) {
  const [busy, setBusy] = useState(false);
  let c: ChallengeCode | null = null;
  try { c = b64d(code); if (!c || c.v !== 1 || !Array.isArray(c.q)) c = null; } catch { c = null; }
  if (!c) return <div class="card">This challenge link looks broken. <a href="#/mock/quick">Start a quick test instead</a></div>;
  const ch = c;
  const name = (sid: string) => meta.find(m => m.id === sid)?.name || sid;
  const start = async () => {
    setBusy(true);
    const data = await loadSubjects(ch.q.map(x => x[0]).filter(sid => meta.find(m => m.id === sid && m.count)));
    const subjects = ch.q.filter(([sid]) => data[sid]).map(([sid, ids]) => {
      const have = new Set(data[sid].questions.map(q => q.id));
      return { sid, qids: ids.filter(id => have.has(id)) };
    }).filter(x => x.qids.length);
    const total = subjects.reduce((n, x) => n + x.qids.length, 0);
    if (!total) { alert('These questions are no longer in the app. Try a new quick test.'); go('/mock/quick'); return; }
    const e: Exam = { id: Date.now().toString(36), mode: 'quick', startedAt: Date.now(), duration: Math.max(5, ch.m || 15) * 60000, subjects, answers: {}, cur: { s: 0, i: 0 }, challenge: { from: ch.n || 'Your friend', correct: ch.c, total: ch.t } };
    saveExam(e);
    replace('/exam');
  };
  return (
    <div class="stack">
      <section class="hero">
        <h1>⚔️ {ch.n || 'A friend'} challenged you!</h1>
        <p>Same {ch.t} questions, {ch.m} minutes. Score to beat: <b>{ch.c}/{ch.t}</b></p>
      </section>
      <div class="card">
        <h3>Subjects</h3>
        {ch.q.map(([sid, ids]) => <div class="row"><span>{name(sid)}</span><em>{ids.length} questions</em></div>)}
      </div>
      <button class="btn primary big center" disabled={busy} onClick={start}>{busy ? 'Loading…' : 'Accept challenge'}</button>
      <p class="muted small center">Keys: A–D answer · N next · P previous · S submit</p>
    </div>
  );
}

export function Explain({ q, open = true }: { q: Q; open?: boolean }) {
  const p = progress();
  const [pid, setPid] = useState(p.pidgin && !!q.p);
  if (!open) return null;
  const flip = (v: boolean) => { setPid(v); p.pidgin = v; save(p); };
  return (
    <div class="explain">
      <div class="explain-h">
        <b>Why</b>
        {q.p && (
          <div class="seg tiny">
            <button class={!pid ? 'on' : ''} onClick={() => flip(false)}>English</button>
            <button class={pid ? 'on' : ''} onClick={() => flip(true)}>Pidgin</button>
          </div>
        )}
      </div>
      <p>{pid && q.p ? q.p : q.e}</p>
    </div>
  );
}

// ---------- review ----------
function Review({ meta, id, filter }: { meta: SubjectMeta[]; id: string; filter: string }) {
  const rec = findRecord(id);
  const [data, setData] = useState<Record<string, SubjectData> | null>(null);
  const [s, setS] = useState(0);
  useEffect(() => { if (rec) loadSubjects(rec.exam.subjects.map(x => x.sid)).then(setData); }, [id]);
  if (!rec) return <div class="card">Not found. <a href="#/">Go home</a></div>;
  if (!data) return <Loading />;
  const sub = rec.exam.subjects[s];
  const byId = new Map(data[sub.sid].questions.map(q => [q.id, q]));
  const items = sub.qids.map((qid, i) => ({ i, q: byId.get(qid)!, a: rec.exam.answers[sub.sid + ':' + qid] }))
    .filter(x => x.q && (filter === 'all' || x.a !== x.q.a));
  const name = (sid: string) => meta.find(m => m.id === sid)?.name || sid;
  return (
    <div class="stack">
      <div class="row-h">
        <span class="muted small">{filter === 'all' ? 'Every question' : 'Only the ones you missed'}</span>
        <div class="seg tiny">
          <a class={filter !== 'all' ? 'on' : ''} href={`#/review/${id}/wrong`}>Wrong only</a>
          <a class={filter === 'all' ? 'on' : ''} href={`#/review/${id}/all`}>All</a>
        </div>
      </div>
      <div class="tabs light">
        {rec.exam.subjects.map((x, i) => <button class={i === s ? 'on' : ''} onClick={() => setS(i)}>{short(name(x.sid))}<small>{rec.per[i].score}</small></button>)}
      </div>
      {items.length === 0 && <div class="card center">No wrong answers here. 🎉</div>}
      {items.map(({ i, q, a }) => (
        <div class="card rq">
          <div class="qhead"><div class="qmeta">Question {i + 1} · {data[sub.sid].topics[q.t]}</div><Star sid={sub.sid} qid={q.id} /></div>
          <QText text={q.q} />
          <div class="opts static">
            {q.o.map((o, k) => (
              <div class={'opt' + (k === q.a ? ' right' : '') + (k === a && a !== q.a ? ' wrong' : '')}>
                <b>{L[k]}</b><span>{o}</span>{k === q.a && <em>✓ correct</em>}{k === a && a !== q.a && <em>your answer</em>}
              </div>
            ))}
          </div>
          {a === undefined && <p class="muted small">You didn't answer this one.</p>}
          <Explain q={q} />
        </div>
      ))}
      <a class="btn ghost" href={`#/result/${id}`}>Back to score</a>
    </div>
  );
}

// ---------- practice ----------
function PracticeHome({ meta }: { meta: SubjectMeta[] }) {
  return (
    <div class="stack">
      <h2>Practise by subject</h2>
      <p class="muted">Pick a subject, then a topic. You see the answer and the explanation straight away.</p>
      {meta.map(m => (
        <a class={'card row link' + (m.count ? '' : ' off')} href={m.count ? `#/practice/${m.id}` : undefined}>
          <span><b>{m.name}</b><small>{m.count ? `${m.topics.length} topics` : 'coming soon'}</small></span><em>{m.count ? m.count + ' questions ›' : ''}</em>
        </a>
      ))}
    </div>
  );
}
const DIFFS: [string, string][] = [['all', 'All'], ['e', 'Easy'], ['m', 'Medium'], ['h', 'Hard']];
function Topics({ meta, sid }: { meta: SubjectMeta[]; sid: string }) {
  const m = meta.find(x => x.id === sid);
  const [diff, setDiff] = useState(() => sessionStorage.getItem('crackit:diff') || 'all');
  if (!m) return <div class="card">Unknown subject.</div>;
  const p = progress();
  const sfx = diff === 'all' ? '' : '/' + diff;
  const nw = activeKeys(p.wrong, sid).length;
  return (
    <div class="stack">
      <p class="muted">{m.count} questions in {m.topics.filter(x => x.count).length} topics. Pick one, or mix them all.</p>
      <div class="row-h"><span class="muted small">Difficulty</span>
        <div class="seg tiny">{DIFFS.map(([k, l]) => <button class={k === diff ? 'on' : ''} onClick={() => { sessionStorage.setItem('crackit:diff', k); setDiff(k); }}>{l}</button>)}</div>
      </div>
      <a class="btn primary big" href={`#/practice/${sid}/all${sfx}`}><span>Mixed practice</span><small>{SESSION} {diff === 'all' ? '' : DIFFS.find(d => d[0] === diff)![1].toLowerCase() + ' '}questions at a time, across every topic</small></a>
      {nw > 0 && <a class="btn big" href={`#/practice/${sid}/wrong`}><span>❌ Retry my {nw} wrong answer{nw > 1 ? 's' : ''}</span><small>Clear them one by one</small></a>}
      <section class="card">
        <h3>Topics</h3>
        {m.topics.map((t, i) => {
          const s = p.topics[sid + ':' + i];
          return t.count ? (
            <a class="row link" href={`#/practice/${sid}/${i}${sfx}`}>
              <span>{t.name}<small>{t.count} questions</small></span>
              {s ? <em class={s.c / s.n >= 0.6 ? 'good' : 'bad'}>{Math.round((s.c / s.n) * 100)}%</em> : <em>›</em>}
            </a>
          ) : null;
        })}
      </section>
    </div>
  );
}
const SESSION = 20;
function Star({ sid, qid }: { sid: string; qid: string }) {
  const [on, setOn] = useState(() => isOn(progress().bm, sid + ':' + qid));
  useEffect(() => { setOn(isOn(progress().bm, sid + ':' + qid)); }, [qid]);
  return <button class={'star' + (on ? ' on' : '')} aria-pressed={on} aria-label={on ? 'Remove from saved' : 'Save question'} onClick={() => setOn(toggleBookmark(progress(), sid, qid))}>{on ? '★' : '☆'}</button>;
}
function ReportBtn({ qid }: { qid: string }) {
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [qid]);
  if (sent) return <span class="muted small">Thanks, we'll check it ✓</span>;
  return <button class="linkbtn small" onClick={async () => {
    const why = prompt('What is wrong with this question? (e.g. wrong answer, typo, unclear)');
    if (why === null) return;
    try {
      await fetch('https://rlbrhpjljjgpqpqjrpkc.supabase.co/rest/v1/rpc/crackit_report', { method: 'POST', headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_qid: qid, p_reason: why }) });
    } catch { /* offline: ignore */ }
    setSent(true);
  }}>⚑ Report a problem</button>;
}
function Practice({ meta, sid, topic, diff = 'all' }: { meta: SubjectMeta[]; sid: string; topic: string; diff?: string }) {
  const [data, setData] = useState<SubjectData | null>(loaded[sid] || null);
  const [queue, setQueue] = useState<Q[]>([]);
  const [idx, setIdx] = useState(0);
  const [ans, setAns] = useState<number | undefined>();
  const [score, setScore] = useState({ c: 0, n: 0 });
  const [round, setRound] = useState(0);
  const special = topic === 'wrong' || topic === 'saved';
  const t = topic === 'all' || special ? undefined : +topic;
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    loadSubject(sid).then(d => {
      const p = progress();
      const only = special ? new Set(activeKeys(topic === 'wrong' ? p.wrong : p.bm, sid).map(k => k.slice(sid.length + 1))) : undefined;
      const qs = pick(d, SESSION, p, t, diff, only);
      setData(d); setQueue(qs); setEmpty(qs.length === 0); setIdx(0); setAns(undefined); setScore({ c: 0, n: 0 });
    });
  }, [sid, topic, diff, round]);
  const q = queue[idx];
  const finished = queue.length > 0 && idx >= queue.length;
  const choose = (o: number) => {
    if (ans !== undefined || !q) return;
    setAns(o);
    const p = progress(); recordAnswer(p, sid, q, o === q.a); markActive(p);
    p.practiced++; if (o === q.a) p.practiceCorrect++; save(p);
    setScore(s => ({ c: s.c + (o === q.a ? 1 : 0), n: s.n + 1 }));
  };
  const next = () => { setAns(undefined); setIdx(i => i + 1); window.scrollTo(0, 0); };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey || finished) return;
      const k = ev.key.toLowerCase(); const ix = ['a', 'b', 'c', 'd'].indexOf(k);
      if (ix >= 0) choose(ix); else if ((k === 'n' || k === 'enter') && ans !== undefined) next(); else return;
      ev.preventDefault();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });
  const m = meta.find(x => x.id === sid);
  if (empty) return <div class="card center">{topic === 'wrong' ? 'All cleared here! 🎉 No wrong answers left in this subject.' : topic === 'saved' ? 'No saved questions in this subject.' : 'No questions match this filter yet.'}<p><a class="btn" href={`#/practice/${sid}`}>Other topics</a></p></div>;
  if (!data || !m || !queue.length) return <Loading />;
  const topicName = topic === 'wrong' ? 'Wrong answers' : topic === 'saved' ? 'Saved questions' : t === undefined ? 'Mixed practice' : data.topics[t];
  if (finished) {
    const pct = Math.round((score.c / Math.max(1, score.n)) * 100);
    return (
      <div class="stack">
        <section class="score">
          <div class="ring" style={{ '--p': score.c / Math.max(1, score.n) } as any}><div><b>{score.c}</b><span>/ {score.n}</span></div></div>
          <h2>{pct >= 80 ? 'Excellent! 🎉' : pct >= 60 ? 'Good work!' : 'Keep going, you are learning.'}</h2>
          <p class="muted">{short(m.name)} · {topicName}</p>
        </section>
        {topic === 'wrong' && <p class="muted center">{activeKeys(progress().wrong, sid).length} still to clear in {short(m.name)}.</p>}
        <button class="btn primary big center" onClick={() => setRound(r => r + 1)}>{special ? 'Go again' : `Practise ${SESSION} more`}</button>
        <div class="navbtns">
          <a class="btn" href={`#/practice/${sid}`} data-replace="1">Other topics</a>
          <a class="btn" href="#/mock/quick">Quick test</a>
        </div>
      </div>
    );
  }
  return (
    <div class="stack">
      <div class="row-h">
        <span class="qcount">Question {idx + 1} of {queue.length}</span>
        <span class="pill">{score.c}/{score.n} correct</span>
      </div>
      <div class="progline in" aria-hidden="true"><i style={{ width: ((idx + (ans !== undefined ? 1 : 0)) / queue.length) * 100 + '%' }} /></div>
      <div class="qcard">
        <div class="qhead"><div class="qmeta">{short(m.name)} · {t === undefined ? data.topics[q.t] : topicName} · <span class={'diff ' + q.d}>{q.d === 'e' ? 'easy' : q.d === 'm' ? 'medium' : 'hard'}</span></div><Star sid={sid} qid={q.id} /></div>
        <QText text={q.q} />
        <div class="opts">
          {q.o.map((o, i) => {
            const cls = ans === undefined ? '' : i === q.a ? ' right' : i === ans ? ' wrong' : ' dim';
            return <button class={'opt' + cls} onClick={() => choose(i)} disabled={ans !== undefined}><b>{L[i]}</b><span>{o}</span></button>;
          })}
        </div>
        {ans !== undefined && (
          <>
            <div class={'verdict ' + (ans === q.a ? 'good' : 'bad')}>{ans === q.a ? 'Correct! ✓' : `Not quite. The answer is ${L[q.a]}.`}</div>
            <Explain q={q} />
            <div class="qfoot"><ReportBtn qid={q.id} /></div>
            <button class="btn primary big center" onClick={next}>{idx + 1 < queue.length ? 'Next question ›' : 'See my score'}</button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- progress ----------
function ProgressPage({ meta }: { meta: SubjectMeta[] }) {
  const [, force] = useState(0);
  const p = progress();
  const name = (sid: string) => meta.find(m => m.id === sid)?.name || sid;
  const weak = weakTopics(p, (sid, t) => meta.find(m => m.id === sid)?.topics[t]?.name);
  const best = bestScore(p), bestQ = bestScore(p, 'quick');
  return (
    <div class="stack">
      <h2>Your progress</h2>
      <div class="stats card">
        <div><b>{streak(p)}</b><span>day streak</span></div>
        <div><b>{best >= 0 ? best : '–'}</b><span>best full mock</span></div>
        <div><b>{bestQ >= 0 ? bestQ : '–'}</b><span>best quick test</span></div>
        <div><b>{p.practiced ? Math.round((p.practiceCorrect / p.practiced) * 100) + '%' : '–'}</b><span>practice accuracy</span></div>
      </div>
      <section class="card">
        <h3>Weak topics</h3>
        {weak.length === 0 && <p class="muted small">Answer a few more questions and your weak topics will show here.</p>}
        {weak.slice(0, 8).map(w => (
          <a class="row link" href={`#/practice/${w.sid}/${w.t}`}><span>{w.name}<small>{name(w.sid)} · {w.n} answered</small></span><em class="bad">{Math.round(w.acc * 100)}%</em></a>
        ))}
      </section>
      <section class="card">
        <h3>Mock history</h3>
        {p.history.length === 0 && <p class="muted small">No mocks yet. <a href="#/mock/quick">Try a quick test</a>.</p>}
        {p.history.map(h => (
          <a class="row link" href={`#/result/${h.id}`}>
            <span>{h.mode === 'quick' ? 'Quick test' : 'Full mock'}<small>{new Date(h.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} · {h.per.map(x => short(name(x.sid))).join(', ')}</small></span>
            <em>{h.total}/400</em>
          </a>
        ))}
      </section>
      <a class="btn" href="#/account">{user() ? '☁️ Your account' : '☁️ Sign in to save your progress'}</a>
      <button class="btn ghost" onClick={async () => {
        if (!confirm(user() ? 'Clear all your progress on this phone AND in your account?' : 'Clear all your progress on this phone?')) return;
        if (user()) { try { await resetEverywhere(); } catch { alert('Could not reach your account. Try again when online.'); return; } } else resetProgress();
        force(x => x + 1);
      }}>Reset progress</button>
    </div>
  );
}

function About({ meta }: { meta: SubjectMeta[] }) {
  return (
    <div class="stack prose">
      <h2>About {APP.name}</h2>
      <p class="notice">{APP.disclaimer}</p>
      <p>{APP.name} helps you prepare for the UTME with timed CBT mocks that feel like the real exam screen, practice by topic, and short explanations for every answer, in simple English or Pidgin.</p>
      <h3>How the questions are made</h3>
      <p>Every question is new, written to the topics in the official JAMB syllabus. None is copied from past papers. Each answer was checked by independent solvers that did not see the answer key, and any question where they did not agree, or that was unclear, was thrown away. Calculation answers (Maths, Physics, Chemistry, Accounting and more) were also re-computed.</p>
      <p>Spotted a mistake? Tell us and we'll fix it.</p>
      <h3>What's inside</h3>
      <ul>{meta.map(m => <li>{m.name}: {m.count ? m.count + ' questions' : 'coming soon'}</li>)}</ul>
      <h3>Offline</h3>
      <p>After your first visit, {APP.name} works without data: each subject is saved on your phone the first time you open it. Add it to your home screen for one-tap access.</p>
      <p><button class="btn" onClick={async (e) => { const b = e.currentTarget as HTMLButtonElement; b.disabled = true; b.textContent = 'Saving…'; await Promise.all(meta.filter(m => m.count).map(m => loadSubject(m.id).catch(() => null))); b.textContent = '✓ All subjects saved for offline'; }}>⬇️ Save all subjects for offline</button></p>
      <h3>Your account</h3>
      <p>Signing in with Google is optional. If you sign in, your progress is saved to your account so it works on any phone. If you are under 18, ask a parent or guardian before you sign in or buy a pack. <a href="/privacy/">Privacy policy</a> · <a href="/terms/">Terms and refunds</a></p>
      <h3>Contact</h3>
      <p>{APP.name} is made by Olaoluwa Michael in Nigeria. Questions, refunds or data requests: <a href={'mailto:' + APP.contact}>{APP.contact}</a></p>
      <h3>Open-source software</h3>
      <p class="small">Built with Preact (MIT licence) and Vite (MIT). The Android app uses Google's Android Browser Helper and AndroidX libraries (Apache 2.0). Icons and artwork are CrackIt's own; text uses your phone's system font.</p>
      <p class="muted small">Version {APP.version}</p>
    </div>
  );
}
