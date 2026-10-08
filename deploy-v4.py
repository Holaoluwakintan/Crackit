#!/usr/bin/env python3
"""CrackIt v0.4 production deploy by Vercel REST API (no CLI). Uploads app/dist + api/*.js (not *.test.js).
Repoint to another Vercel account with env vars: VERCEL_TOKEN, VERCEL_TEAM (team id, or empty for a personal account), VERCEL_PROJECT.
Defaults: token from /home/user/tab/files/.vercel-new-account.env, team team_Z8w5vQEijLwxTPREwdQDqCe8, project crackit-ng.
Usage: python3 deploy-v4.py [--dry]     Build first: cd app && npm install && npm run build
Remember the Vercel env vars the API needs on a NEW project: SUPABASE_SECRET_KEY (purchases/restore); Paystack stays OFF unless PAYMENTS_ENABLED=1 + keys."""
import os, sys, json, hashlib, time, requests
SRC = os.environ.get('CRACKIT_SRC', os.path.dirname(os.path.abspath(__file__)) if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'app')) else '/home/user/work/score300')
TEAM = os.environ.get('VERCEL_TEAM', 'team_Z8w5vQEijLwxTPREwdQDqCe8'); PROJECT = os.environ.get('VERCEL_PROJECT', 'crackit-ng')
tok = os.environ.get('VERCEL_TOKEN') or [l.split('=', 1)[1].strip().strip('"') for l in open('/home/user/tab/files/.vercel-new-account.env') if l.startswith('VERCEL_TOKEN_NEW=')][0]
Q = f'?teamId={TEAM}' if TEAM else ''
H = {'Authorization': 'Bearer ' + tok}
files = []
dist = os.path.join(SRC, 'app/dist')
for root, _, fs in os.walk(dist):
    for f in fs:
        p = os.path.join(root, f); files.append((os.path.relpath(p, dist), p))
for f in sorted(os.listdir(os.path.join(SRC, 'api'))):
    if f.endswith('.js') and not f.endswith('.test.js'): files.append(('api/' + f, os.path.join(SRC, 'api', f)))
print(len(files), 'files', sum(os.path.getsize(p) for _, p in files), 'bytes ->', PROJECT, TEAM or '(personal)')
if '--dry' in sys.argv: sys.exit(0)
meta = []
for rel, p in files:
    b = open(p, 'rb').read(); sha = hashlib.sha1(b).hexdigest()
    for a in range(4):
        r = requests.post(f'https://api.vercel.com/v2/files{Q}', headers={**H, 'x-vercel-digest': sha, 'Content-Type': 'application/octet-stream'}, data=b, timeout=120)
        if r.status_code in (200, 201): break
        print('upload retry', rel, r.status_code, r.text[:200]); time.sleep(3)
    else: sys.exit('upload failed: ' + rel)
    meta.append({'file': rel, 'sha': sha, 'size': len(b)})
body = {'name': PROJECT, 'project': PROJECT, 'target': 'production', 'files': meta,
        'projectSettings': {'framework': None, 'buildCommand': None, 'installCommand': None, 'outputDirectory': None}}
r = requests.post(f'https://api.vercel.com/v13/deployments{Q}{"&" if Q else "?"}skipAutoDetectionConfirmation=1', headers=H, json=body, timeout=120)
print('deploy', r.status_code, r.text[:600])
if r.status_code not in (200, 201): sys.exit(1)
d = r.json(); did = d['id']; print('id', did, d.get('url'))
st = None
for i in range(60):
    s = requests.get(f'https://api.vercel.com/v13/deployments/{did}{Q}', headers=H, timeout=30).json()
    st = s.get('readyState') or s.get('status'); print(i, st)
    if st in ('READY', 'ERROR', 'CANCELED'): break
    time.sleep(5)
json.dump({'id': did, 'state': st, 'url': d.get('url')}, open('/tmp/crackit-last-deploy.json', 'w'))
