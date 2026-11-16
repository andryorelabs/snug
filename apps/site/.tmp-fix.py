import json,re,collections,os
root='/home/andryore/code/snug/.claude/worktrees/agent-a29b2c207dfd4c2ce/'
d=json.load(open('/tmp/lb.json'))['diagnostics']
CODES={'typescript(no-non-null-assertion)':'nn','typescript(no-confusing-void-expression)':'void','typescript(non-nullable-type-assertion-style)':'nnstyle'}
by=collections.defaultdict(list)
for x in d:
    k=CODES.get(x['code'])
    if k and x['labels']:
        s=x['labels'][0]['span']; by[x['filename']].append((s['offset'],s['length'],k))
for f,spans in by.items():
    b=open(root+f,'rb').read()
    spans=sorted(set(spans))
    sel=[s for s in spans if not any(o!=s and o[0]>=s[0] and o[0]+o[1]<=s[0]+s[1] for o in spans)]
    used=False
    for off,ln,k in sorted(sel,reverse=True):
        t=b[off:off+ln].decode()
        if k=='nn':
            if not t.endswith('!'):
                print('skip nn',f,t[:40]); continue
            new='requireValue('+t[:-1]+')'; used=True
        elif k=='nnstyle':
            m=re.match(r'^(.*) as \w+$',t,re.S)
            if not m:
                print('skip nnstyle',f,t[:40]); continue
            new='requireValue('+m[1]+')'; used=True
        else:
            new='{ '+t+'; }'
        b=b[:off]+new.encode()+b[off+ln:]
    s=b.decode()
    if used and 'import { requireValue }' not in s:
        rel=os.path.relpath(root+'apps/site/e2e/require',os.path.dirname(root+f))
        if not rel.startswith('.'): rel='./'+rel
        ls=s.split('\n')
        last=max(k for k,x in enumerate(ls) if re.match(r'^(import .*;|\} from ".*";)$',x))
        ls.insert(last+1,'import { requireValue } from "'+rel+'";')
        s='\n'.join(ls)
    open(root+f,'w').write(s)
