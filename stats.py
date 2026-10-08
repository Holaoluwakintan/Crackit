#!/usr/bin/env python3
"""CrackIt traction counts. Usage: python3 stats.py [days]   (needs SUPABASE_SECRET_KEY in env or files/.blossom-supabase-secret.env)
Reads crackit.events via crackit_stats() once the growth SQL has been run; until then reads the private storage bucket crackit-analytics."""
import os, sys, json, collections, datetime, requests
U = 'https://rlbrhpjljjgpqpqjrpkc.supabase.co'
K = os.environ.get('SUPABASE_SECRET_KEY') or [l.split('=', 1)[1].strip() for l in open('/home/user/tab/files/.blossom-supabase-secret.env') if l.startswith('SUPABASE_SECRET_KEY=')][0]
H = {'apikey': K, 'Authorization': 'Bearer ' + K}
days = int(sys.argv[1]) if len(sys.argv) > 1 else 7
r = requests.post(U + '/rest/v1/rpc/crackit_stats', headers=H, json={'p_days': days}, timeout=30)
rows = []
if r.ok:
    rows = [(x['day'], x['e'], x['n'], x['phones']) for x in r.json()]
    src = 'table'
else:
    src = 'bucket'; agg = collections.Counter(); ph = collections.Counter()
    for k in range(days):
        d = (datetime.datetime.utcnow() - datetime.timedelta(days=k)).strftime('%Y-%m-%d'); off = 0
        while True:
            lr = requests.post(U + '/storage/v1/object/list/crackit-analytics', headers=H, json={'prefix': f'ev/{d}/', 'limit': 1000, 'offset': off}, timeout=30).json()
            if not isinstance(lr, list) or not lr: break
            for o in lr:
                b = requests.get(f"{U}/storage/v1/object/crackit-analytics/ev/{d}/{o['name']}", headers=H, timeout=30)
                if b.ok:
                    e = b.json(); agg[(d, e['e'])] += 1; ph[(d, e['e'])] += 1 if e.get('f') else 0
            if len(lr) < 1000: break
            off += 1000
    rows = sorted([(d, e, n, ph[(d, e)]) for (d, e), n in agg.items()], reverse=True)
print(f'source: {src}, last {days} days')
for d, e, n, p in rows: print(f'{d}  {e:15s} {n:6d}   first-visit-today phones: {p}')
