-- CrackIt growth SQL (Oct 8, 2026). Paste the whole file into Supabase → SQL Editor → Run, once.
-- Project: Blossom (rlbrhpjljjgpqpqjrpkc), schema crackit. Safe to run twice (IF NOT EXISTS / OR REPLACE).
-- 1) crackit.events: anonymous usage counts (no cookies, no user id, no IP). Anyone may INSERT through RLS; nobody can read via the API.
-- 2) Referrals: a signed-in friend who joined through your link and finishes 3 real tests earns you one free Post-UTME pack.

-- ---------- 1. events ----------
create table if not exists crackit.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  e text not null check (e in ('pv','start_test','finish_test','share','pay_click','d5_start','d5_done','card_share','challenge_open','remind_on','ref_land','install')),
  path text not null check (length(path) <= 60),
  exam text not null default 'jamb' check (exam in ('jamb','waec','neco')),
  m text check (m is null or length(m) <= 20),
  v text check (v is null or length(v) <= 12),
  first_today boolean not null default false,
  installed boolean not null default false
);
create index if not exists events_at_idx on crackit.events (at);
create index if not exists events_e_at_idx on crackit.events (e, at);
alter table crackit.events enable row level security;
drop policy if exists events_insert_anon on crackit.events;
create policy events_insert_anon on crackit.events for insert to anon, authenticated with check (true);
revoke all on crackit.events from anon, authenticated;  -- rows arrive only through crackit_track(); RLS allows insert only, never select

-- the server (/api/ev) and the app call this; it validates and inserts one row
create or replace function public.crackit_track(p_e text, p_path text, p_exam text default 'jamb', p_m text default null, p_v text default null, p_first boolean default false, p_app boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_e not in ('pv','start_test','finish_test','share','pay_click','d5_start','d5_done','card_share','challenge_open','remind_on','ref_land','install') then return false; end if;
  if p_path is null or length(p_path) > 60 or p_path !~ '^/[a-z0-9/:._-]*$' then return false; end if;
  insert into crackit.events (e, path, exam, m, v, first_today, installed)
  values (p_e, p_path, case when p_exam in ('jamb','waec','neco') then p_exam else 'jamb' end, left(p_m, 20), left(p_v, 12), coalesce(p_first, false), coalesce(p_app, false));
  return true;
end $$;
revoke all on function public.crackit_track(text, text, text, text, text, boolean, boolean) from public;
grant execute on function public.crackit_track(text, text, text, text, text, boolean, boolean) to anon, authenticated, service_role;

-- daily totals for Michael (service role / SQL editor only)
create or replace function public.crackit_stats(p_days int default 30)
returns table (day date, e text, n bigint, phones bigint) language sql security definer set search_path = '' as $$
  select (at at time zone 'Africa/Lagos')::date, e, count(*), count(*) filter (where first_today)
  from crackit.events where at > now() - make_interval(days => least(greatest(p_days, 1), 400))
  group by 1, 2 order by 1 desc, 3 desc;
$$;
revoke all on function public.crackit_stats(int) from public, anon, authenticated;
grant execute on function public.crackit_stats(int) to service_role;

-- keep at most 24 months (privacy policy)
create or replace function crackit.events_prune() returns void language sql security definer set search_path = '' as $$
  delete from crackit.events where at < now() - interval '24 months';
$$;

-- ---------- 2. referrals ----------
create table if not exists crackit.referrals (
  referred uuid primary key references auth.users(id) on delete cascade,   -- one referrer per person, ever
  referrer uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rewarded_at timestamptz,
  reward_pack text,
  check (referred <> referrer)
);
create index if not exists referrals_referrer_idx on crackit.referrals (referrer);
alter table crackit.referrals enable row level security;
drop policy if exists referrals_own on crackit.referrals;
create policy referrals_own on crackit.referrals for select to authenticated using (referrer = (select auth.uid()));
revoke insert, update, delete on crackit.referrals from anon, authenticated;

-- "real tests" a referred friend has finished, read from their own synced progress:
-- JAMB quick/full mocks and WAEC/NECO papers with at least 3 minutes used and at least 10 questions, on 2+ different days
create or replace function crackit.ref_tests_done(p_user uuid) returns int language sql stable security definer set search_path = '' as $$
  with t as (
    select (h->>'date')::bigint as d from crackit.state s, jsonb_array_elements(coalesce(s.data->'history', '[]'::jsonb)) h
      where s.user_id = p_user and coalesce((h->>'timeUsed')::bigint, 0) >= 180000
        and coalesce((select sum((x->>'total')::int) from jsonb_array_elements(coalesce(h->'per', '[]'::jsonb)) x), 0) >= 10
    union all
    select (h->>'date')::bigint from crackit.state s, jsonb_array_elements(coalesce(s.data->'ssce'->'history', '[]'::jsonb)) h
      where s.user_id = p_user and coalesce((h->>'timeUsed')::bigint, 0) >= 180000 and coalesce((h->>'total')::int, 0) >= 10
  )
  select case when count(distinct to_timestamp(d / 1000.0)::date) >= 2 then count(*)::int else least(count(*)::int, 2) end from t;
$$;

-- the friend (signed in) claims the code from the link they opened. Only NEW accounts (made in the last 14 days) can be referred.
create or replace function public.crackit_ref_claim(p_code text) returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); them uuid; made timestamptz; n int;
begin
  if me is null then return 'sign_in'; end if;
  if p_code is null or p_code !~ '^[0-9a-f]{12}$' then return 'bad_code'; end if;
  if exists (select 1 from crackit.referrals where referred = me) then return 'already'; end if;
  select created_at into made from auth.users where id = me;
  if made < now() - interval '14 days' then return 'not_new'; end if;
  select id into them from auth.users where replace(id::text, '-', '') like p_code || '%' limit 2;
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  select count(*) into n from crackit.referrals where referrer = them and created_at > now() - interval '30 days';
  if n >= 30 then return 'cap'; end if;
  insert into crackit.referrals (referred, referrer) values (me, them) on conflict do nothing;
  return 'ok';
end $$;

-- the referrer's own numbers: invited, finished 3 tests, rewards used, rewards available (max 5 ever)
create or replace function public.crackit_ref_status() returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r record; inv int := 0; done int := 0; used int := 0;
begin
  if me is null then return null; end if;
  for r in select * from crackit.referrals where referrer = me loop
    inv := inv + 1;
    if r.completed_at is null and crackit.ref_tests_done(r.referred) >= 3 then
      update crackit.referrals set completed_at = now() where referred = r.referred; r.completed_at := now();
    end if;
    if r.completed_at is not null then done := done + 1; end if;
    if r.rewarded_at is not null then used := used + 1; end if;
  end loop;
  return jsonb_build_object('invited', inv, 'completed', done, 'rewarded', used, 'available', greatest(0, least(done, 5) - used));
end $$;

-- spend one earned reward on a Post-UTME pack of the referrer's choice (recorded like a ₦0 purchase, so it restores on any phone)
create or replace function public.crackit_ref_redeem(p_pack text) returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); r record; used int;
begin
  if me is null then return 'sign_in'; end if;
  if p_pack not in ('unilag','ui','oau','unn','uniben','unilorin','uniport','oou','funaab','unizik') then return 'bad_pack'; end if;
  if public.crackit_owns_pack(me, p_pack) then return 'owned'; end if;
  perform public.crackit_ref_status();
  select count(*) into used from crackit.referrals where referrer = me and rewarded_at is not null;
  if used >= 5 then return 'cap'; end if;
  select * into r from crackit.referrals where referrer = me and completed_at is not null and rewarded_at is null order by completed_at limit 1 for update;
  if not found then return 'none'; end if;
  update crackit.referrals set rewarded_at = now(), reward_pack = p_pack where referred = r.referred;
  perform public.crackit_add_purchase(me, p_pack, 'ref:' || r.referred::text, 0);
  return 'ok';
end $$;

revoke all on function public.crackit_ref_claim(text) from public, anon;
revoke all on function public.crackit_ref_status() from public, anon;
revoke all on function public.crackit_ref_redeem(text) from public, anon;
grant execute on function public.crackit_ref_claim(text) to authenticated;
grant execute on function public.crackit_ref_status() to authenticated;
grant execute on function public.crackit_ref_redeem(text) to authenticated;
revoke all on function crackit.ref_tests_done(uuid) from public, anon, authenticated;

-- Note: referral rows are removed automatically when an auth user is deleted (on delete cascade).
