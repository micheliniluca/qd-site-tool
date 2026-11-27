import json,re
from collections import OrderedDict
d=json.load(open('raw.json'))
EFF=['blast','debris','p121','p122','t131','t132']
def norm(s): return re.sub(r'\s+',' ',s or '').strip()
LEVELS=[(r'virtual(?:ly)? complete protection(?: for personnel)?','V'),(r'high degree of protection(?: for personnel)?','H'),
        (r'limited degree of protection(?: for personnel)?','L'),(r'limited protection only','L')]
TOK=re.compile(r'(?P<cond>MCE\s*[≤>]\s*50\s*kg|For PES internal volume\s*[>≤]\s*20m³)'
               r'|(?P<ref>\b(?:BD|DFD|P1D|P2D|TD)\d+)\s*(?P<cap>\((?:≤\s*60\s*m|25m≤D≤60m)\))?'
               r'|(?P<na>Not\s+applicable(?: \(see 1\.3\.1\.11\))?)'
               r'|(?P<noqd>No QD(?: \(D>60m\))?)'
               r'|(?P<fixed>\b\d+\s*m\b)'
               r'|(?P<lvl>'+'|'.join(l for l,_ in LEVELS)+r')'
               r'|(?P<or>\b[Oo]r\b)', re.I)
def parse(txt):
    t=norm(txt); opts=[]; cond=None; pos=0; cur=None
    def addnote(s):
        s=s.strip(' ,.')
        if s and cur is not None: cur['notes'].append(s)
    for m in TOK.finditer(t):
        addnote(t[pos:m.start()]); pos=m.end()
        g=m.lastgroup if m.lastgroup!='cap' else 'ref'
        if m.group('cond'):
            c=m.group('cond')
            if c.startswith('MCE'): cond={'k':'mce','op':'le' if '≤' in c else 'gt','v':50}
            else: cond={'k':'vol','op':'gt' if '>' in c else 'le','v':20}
            continue
        if m.group('ref'):
            cur={'t':'f','ref':m.group('ref'),'notes':[],'cond':cond,'lvl':None}
            if m.group('cap'): cur['cap']=60
            opts.append(cur)
        elif m.group('na'):
            cur={'t':'na','notes':[],'cond':cond,'lvl':None}; opts.append(cur)
        elif m.group('noqd'):
            cur={'t':'noqd','notes':[],'cond':cond,'lvl':None}; opts.append(cur)
        elif m.group('fixed'):
            cur={'t':'fixed','d':int(re.sub(r'\D','',m.group('fixed'))),'notes':[],'cond':cond,'lvl':None}; opts.append(cur)
        elif m.group('lvl'):
            s=m.group('lvl').lower()
            for rx,code in LEVELS:
                if re.fullmatch(rx,s,re.I):
                    if cur is None: continue
                    if cur['lvl'] and cur['t']!='noqd': pass
                    cur['lvl']=code; cur['pers']='personnel' in s
        elif m.group('or'): pass
    addnote(t[pos:])
    return opts
out={'tables':{}, 'es':OrderedDict()}
for x in d:
    T=x['table']; ncol=3 if T in '12' else 2
    hdr=[norm(c) for c in x['tables'][0][0][2:2+ncol]]
    rows=[r for t in x['tables'][1:] for r in t if len(r)>5]
    esraw=norm(rows[0][0]); m=re.match(r'^(\d+[a-c]?)\s+(.*)$',esraw)
    esid,eslab=m.group(1),m.group(2)
    if esid=='8' and eslab.startswith('E '): eslab=eslab[2:]
    out['es'].setdefault(esid,eslab)
    eslabel_this=eslab
    tab=out['tables'].setdefault(T,{'title':x['title'],'cols':hdr,'rows':{}})
    cells={}
    for e,r in zip(EFF,rows):
        cells[e]=[]
        for j in range(ncol):
            c=r[2+j]
            if c is None: cells[e].append({'merged':True})
            else: cells[e].append({'raw':norm(c),'opts':parse(c)})
    # post-fixes
    for e in cells:
        for c in cells[e]:
            o=c.get('opts')
            if not o: continue
            if 'TD1(25m≤D≤60m)' in c['raw'].replace(' ',''):
                c['opts']=[dict(t='f',ref='TD1',cap=60,lvl='V',notes=['TD1 tra 25 e 60 m; oltre 60 m nessuna QD'],cond=None),
                           dict(t='fixed',d=25,lvl='H',notes=[],cond=None)]
            if any(oo['cond'] and oo['cond']['k']=='vol' for oo in o):
                lv=[oo for oo in o if oo['lvl']]
                if lv:
                    for oo in o:
                        if not oo['lvl']: oo['lvl']=lv[0]['lvl']; oo['pers']=lv[0].get('pers',False)
    tab['rows'][esid]={'page':x['page'],'annex':'I-A-%d'%(x['page']-95),'label':eslabel_this,'cells':cells}
json.dump(out,open('matrix.json','w'),ensure_ascii=False,indent=1)
# show unique parse results
seen={}
for T,tab in out['tables'].items():
    for es,row in tab['rows'].items():
        for e,cs in row['cells'].items():
            for c in cs:
                if 'raw' in c: seen[c['raw']]=c['opts']
for k,v in seen.items():
    print('»',k); 
    for o in v: print('    ',{kk:vv for kk,vv in o.items() if vv not in (None,[],False)})
