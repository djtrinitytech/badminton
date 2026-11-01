"""One-time, deterministic import. League data is preserved from the source PDF."""
import json, re, pathlib, pdfplumber
root = pathlib.Path(__file__).resolve().parents[1]
pdf = pdfplumber.open(r'C:\Users\sam\Downloads\FINAL.pdf')
entrants = []
for cat, table in [('MS',pdf.pages[0].extract_tables()[0]),('WS',pdf.pages[0].extract_tables()[1])]:
    for row in table[1:]:
        for i, name in enumerate(row[1:],1):
            entrants.append(dict(id=f'{cat}-{row[0]}-{i}',category=cat,group=row[0],players=[name.strip()]))
for cat, tables in [('MD',[pdf.pages[0].extract_tables()[2]]),('XD',[pdf.pages[0].extract_tables()[3],pdf.pages[1].extract_tables()[0]])]:
    for table in tables:
        for row in table[1:]:
            players = [n.strip() for n in row[2:4]]
            if cat == 'MD' and row[0] == 'A' and row[1] == 'Pair 2':
                players = ['Rian Bangera','Aryan Bhandari']
            entrants.append(dict(id=f'{cat}-{row[0]}-{row[1].split()[-1]}',category=cat,group=row[0],players=players))
def norm(s): return re.sub(r'\s+', ' ', s).strip().lower()
def lookup(cat,group,name):
    if cat=='MD' and norm(name)=='aaryan / vansh': return 'MD-A-2'
    return next(e['id'] for e in entrants if e['category']==cat and e['group']==group and norm(' / '.join(e['players']))==norm(name))
matches=[]
for row in pdf.pages[2].extract_tables()[0][1:]:
    for court, cell in enumerate(row[1:],1):
        cell=re.sub(r'\s+',' ',cell or '').strip()
        m=re.match(r'(MS|MD|WS|XD) ([A-D])(\d+): (.*?) vs (.*)',cell)
        if not m: continue
        cat,group,n,a,b=m.groups()
        matches.append(dict(id=f'{cat}-{group}{n}',label=f'{cat} {group}{n}',category=cat,group=group,stage='league',round=0,
            a=lookup(cat,group,a),b=lookup(cat,group,b),court=court,time=row[0],scoreA=0,scoreB=0,status='scheduled',winner=None,version=0))
assert len(entrants)==78, len(entrants)
assert len(matches)==78, len(matches)
(root/'data').mkdir(exist_ok=True)
(root/'data'/'schedule.json').write_text(json.dumps(dict(entrants=entrants,matches=matches),indent=2,ensure_ascii=False),encoding='utf-8')
print(f'Imported {len(entrants)} entrants and {len(matches)} league fixtures.')
