"""Gegencheck, deterministischer Teil: prüft jeden Benchmark-Fall, ohne die Engine zu berühren.

    python tests/prozess-benchmark/validate.py [--range 1-100] [--freeze]

Fehler (E) machen einen Fall unbrauchbar, Warnungen (W) sind Hinweise für den inhaltlichen
Gegencheck. --freeze schreibt frozen.json: SHA-256 jeder expected.json und jeder Quelle,
bevor die Engine läuft. evaluate.ts vergleicht nicht gegen eingefrorene Werte — die Datei ist
der Beleg, dass danach nichts an den Sollantworten geändert wurde.
"""
import hashlib, json, os, re, sys
sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cases')
TYPES = {'start', 'end', 'read', 'write', 'gateway', 'loop', 'output', 'action', 'call', 'opaque_call',
         'transaction', 'external_program', 'update_task', 'async', 'rfc', 'lock'}
WORDS = {'always', 'next row', 'next iteration', 'no more rows', 'else'}
BANDS = {'einfach': (8, 40), 'mittel': (40, 150), 'komplex': (150, 400), 'sehr komplex': (400, 900)}

args = sys.argv[1:]
lo, hi = 1, 999
if '--range' in args:
    lo, hi = map(int, args[args.index('--range') + 1].split('-'))
freeze = '--freeze' in args


def is_comment(line):
    s = line.strip()
    return s == '' or line.startswith('*') or s.startswith('"')


def code_part(line):
    # Zeilenende-Kommentar grob abschneiden (ohne Literale mit " zu zerlegen ist das eine Näherung)
    out, quote = [], None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "'`|":
            quote = ch
            out.append(ch)
        elif ch == '"':
            break
        else:
            out.append(ch)
    return ''.join(out).rstrip()


def starts_statement(lines, n):
    """Näherung: die vorige Codezeile endet mit '.', ':' oder ',' (Kettensatz) — oder es gibt keine."""
    for k in range(n - 2, -1, -1):
        if is_comment(lines[k]):
            continue
        tail = code_part(lines[k])
        return tail.endswith('.') or tail.endswith(':') or tail.endswith(',')
    return True


errors = warnings = 0
frozen = {}
report = []
for cid in sorted(os.listdir(ROOT)):
    m = re.fullmatch(r'BM-(\d{3})', cid)
    if not m or not (lo <= int(m.group(1)) <= hi):
        continue
    d = os.path.join(ROOT, cid)
    issues = []
    E = lambda msg: issues.append(('E', msg))
    W = lambda msg: issues.append(('W', msg))
    sources = {}
    for name in sorted(os.listdir(d)):
        if name.endswith('.abap'):
            raw = open(os.path.join(d, name), 'rb').read()
            if b'\r\n' in raw:
                W(f'{name}: CRLF')
            if b'\t' in raw:
                W(f'{name}: Tabs')
            sources[name] = raw.decode('utf-8').replace('\r\n', '\n').split('\n')
    if not sources:
        E('keine .abap-Datei')
    try:
        exp = json.load(open(os.path.join(d, 'expected.json'), encoding='utf-8'))
    except Exception as ex:
        E(f'expected.json: {ex}')
        exp = None
    try:
        meta = json.load(open(os.path.join(d, 'meta.json'), encoding='utf-8'))
    except Exception as ex:
        E(f'meta.json: {ex}')
        meta = {}
    try:
        json.load(open(os.path.join(d, 'profile.json'), encoding='utf-8'))
    except Exception as ex:
        E(f'profile.json: {ex}')

    def anchor(a, where):
        if not a:
            E(f'{where}: ohne Anker')
            return
        f, ln = a.get('file'), a.get('line')
        if f not in sources:
            E(f'{where}: Datei {f} fehlt')
            return
        lines = sources[f]
        if not isinstance(ln, int) or ln < 1 or ln > len(lines):
            E(f'{where}: Zeile {ln} außerhalb von {f} ({len(lines)})')
            return
        if is_comment(lines[ln - 1]):
            E(f'{where}: {f}:{ln} ist leer oder Kommentar')
            return
        if not starts_statement(lines, ln):
            W(f'{where}: {f}:{ln} ist vermutlich nicht die erste Zeile der Anweisung: {lines[ln-1].strip()[:50]}')
        if a.get('raw') != f'{f}:{ln}':
            W(f'{where}: raw „{a.get("raw")}" ≠ {f}:{ln}')

    if exp:
        if exp.get('id') != cid:
            E(f'id {exp.get("id")} ≠ {cid}')
        sk = exp.get('skeleton') or {}
        nodes, edges = sk.get('nodes') or [], sk.get('edges') or []
        ids = [n.get('id') for n in nodes]
        if len(ids) != len(set(ids)):
            E('doppelte Knoten-IDs')
        for n in nodes:
            if n.get('type') not in TYPES:
                E(f'Knoten {n.get("id")}: Art {n.get("type")} unbekannt')
            if not n.get('meaning'):
                W(f'Knoten {n.get("id")}: ohne Bedeutung')
            anchor(n.get('anchor'), f'Knoten {n.get("id")}')
        if not any(n.get('type') == 'start' for n in nodes):
            E('kein Startknoten')
        idset = set(ids)
        for e in edges:
            if e.get('from') not in idset or e.get('to') not in idset:
                E(f'Kante {e.get("from")}→{e.get("to")}: Ende unbekannt')
            c = (e.get('condition') or '').strip()
            if not c:
                E(f'Kante {e.get("from")}→{e.get("to")}: ohne Bedingung')
        reach_in = {e.get('to') for e in edges}
        reach_out = {e.get('from') for e in edges}
        for n in nodes:
            if n.get('type') != 'start' and n.get('id') not in reach_in:
                W(f'Knoten {n.get("id")}: keine eingehende Kante')
            if n.get('type') != 'end' and n.get('id') not in reach_out:
                W(f'Knoten {n.get("id")}: keine ausgehende Kante')
        bs = exp.get('businessStatements') or []
        if not bs:
            E('keine Fachsätze')
        for s in bs:
            if not s.get('text'):
                E(f'Fachsatz {s.get("id")}: leer')
            for a in s.get('anchors') or []:
                anchor(a, f'Fachsatz {s.get("id")}')
        for o in exp.get('objects') or []:
            if o.get('anchor'):
                anchor(o['anchor'], f'Objekt {o.get("name")}')
        if not exp.get('processDescription'):
            W('ohne processDescription')
        loc = sum(len(v) for v in sources.values())
        band = meta.get('band')
        if band in BANDS:
            a, b = BANDS[band]
            if not (a * 0.8 <= loc <= b * 1.25):
                W(f'Band {band}: {loc} Zeilen außerhalb {a}–{b}')
        elif meta:
            W(f'Band „{band}" unbekannt')
        report.append((cid, band, loc, len(sources), len(nodes), len(edges), len(bs)))
    ne = sum(1 for k, _ in issues if k == 'E')
    nw = len(issues) - ne
    errors += ne
    warnings += nw
    for k, msg in issues:
        print(f'{cid} {k} {msg}')
    if freeze and exp and ne == 0:
        h = {name: hashlib.sha256(open(os.path.join(d, name), 'rb').read()).hexdigest()
             for name in sorted(os.listdir(d)) if name.endswith(('.abap', '.json'))}
        frozen[cid] = h

# Die eingefrorenen Hashes: jede Datei, die vor dem ersten Engine-Lauf festgehalten wurde,
# muss noch bitgleich sein. Beim Neu-Einfrieren (--freeze) desselben Bereichs gilt der neue Stand.
drift = 0
if not freeze:
    import glob
    for path in sorted(glob.glob(os.path.join(os.path.dirname(ROOT), 'frozen-*.json'))):
        for cid, hashes in json.load(open(path, encoding='utf-8')).items():
            if not (lo <= int(cid[3:]) <= hi):
                continue
            for name, sha in hashes.items():
                file = os.path.join(ROOT, cid, name)
                if not os.path.exists(file) or hashlib.sha256(open(file, 'rb').read()).hexdigest() != sha:
                    drift += 1
                    print(f'{cid} E {name} weicht vom eingefrorenen Stand ab ({os.path.basename(path)})')
    errors += drift

print(f'\n{len(report)} Fälle, {errors} Fehler, {warnings} Warnungen')
if report:
    tot = lambda i: sum(r[i] for r in report)
    print(f'Zeilen {tot(2)}, Dateien {tot(3)}, Knoten {tot(4)}, Kanten {tot(5)}, Fachsätze {tot(6)}')
if freeze:
    path = os.path.join(os.path.dirname(ROOT), f'frozen-{lo:03d}-{hi:03d}.json')
    json.dump(frozen, open(path, 'w', encoding='utf-8'), indent=1, sort_keys=True)
    print(f'eingefroren: {len(frozen)} Fälle → {path}')
