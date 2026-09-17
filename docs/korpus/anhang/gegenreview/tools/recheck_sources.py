"""Reproduzierbare Text-/Hashprüfung der gelieferten Markdown-Quellen.
Kein ABAP-Parser und keine semantische oder native SAP-Abnahme.
"""
from pathlib import Path
import hashlib,json,re,sys

ROOT=Path(__file__).resolve().parents[1]
INPUT=ROOT/'inputs/referenzkorpus-v2.md'
EXPECTED_HASH='aa36119e45caf3104631d948de3490f2b956cc0374128a9ffe14407f338ad8a9'

def check():
    text=INPUT.read_text(encoding='utf-8')
    heads=list(re.finditer(r'^## (CC-\d{3}) — (.+)$',text,re.M))
    ids=[m.group(1) for m in heads]
    errors=[]
    if ids != [f'CC-{n:03}' for n in range(1,61)]: errors.append('case-ID order/count differs')
    if hashlib.sha256(INPUT.read_bytes()).hexdigest()!=EXPECTED_HASH:errors.append('input hash mismatch')
    extracted=json.loads((ROOT/'evidence/extracted-sources.json').read_text())
    expected_by_case={}
    for row in extracted:expected_by_case.setdefault(row['case_id'],[]).append(row)
    sources=numbered=declared=matches=0
    for idx,head in enumerate(heads):
        cid=head.group(1);body=text[head.start():heads[idx+1].start() if idx+1<len(heads) else len(text)]
        fences=list(re.finditer(r'^```abap\n(.*?)^```\s*$',body,re.M|re.S))
        if len(fences)!=len(expected_by_case[cid]):errors.append(f'{cid}: source count differs')
        for i,m in enumerate(fences):
            content=m.group(1);sources+=1
            info=expected_by_case[cid][i]
            digest=hashlib.sha256(content.encode()).hexdigest()
            if digest!=info['sha256']:errors.append(f'{cid}/{info["filename"]}: embedded source hash differs')
            stored=ROOT/'sources-extracted'/cid/info['filename']
            if stored.read_bytes()!=content.encode():errors.append(f'{cid}: extracted bytes differ')
            if digest in body[:body.find('### Sollbefunde') if '### Sollbefunde' in body else len(body)]:
                declared+=1;matches+=1
            after=body[m.end():]
            nm=re.search(r'^```text\n(.*?)^```\s*$',after,re.M|re.S)
            if not nm:errors.append(f'{cid}: missing numbered copy');continue
            numbered+=1
            copy=[]
            for line in nm.group(1).splitlines():
                mm=re.match(r'^\d{3}\s{2}(.*)$',line)
                if mm:copy.append(mm.group(1))
                else:errors.append(f'{cid}: malformed numbered line')
            if copy!=content.splitlines():errors.append(f'{cid}: numbered copy mismatch')
    rules=json.loads((ROOT/'decisions/rule-verdicts.json').read_text())
    expected_rules=[f'R{n:02}' for n in range(1,35) if n!=13]+['R13a','R13b']
    if sorted(r['rule'] for r in rules)!=sorted(expected_rules):errors.append('active rules differ')
    result={'method':'markdown-source/hash/numbered-copy; no ABAP execution','case_count':len(ids),'extracted_abap_files':sources,'abap_lines':sum(x['line_count'] for x in extracted),'declared_matching_single_file_hashes':matches,'individual_sources_without_separate_declared_hash':sources-declared,'identical_numbered_copies':numbered,'active_reviewed_rules':len(rules),'errors':errors,'passed':not errors}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    return 0 if not errors else 1

if __name__=='__main__':sys.exit(check())
