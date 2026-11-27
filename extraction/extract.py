import pdfplumber, json, re, sys
pdf=pdfplumber.open('/home/claude/src/aastp.pdf')
out=[]
for pn in range(100,232):
    p=pdf.pages[pn-1]
    txt=p.extract_text() or ''
    m=re.search(r'Table (\d) [–-] ([^\n]+)',txt)
    ts=p.extract_tables()
    out.append(dict(page=pn,table=m.group(1) if m else None,title=m.group(2).strip() if m else None,tables=ts))
json.dump(out,open('raw.json','w'),indent=0)
