"""Aufschlüsselung der Benchmark-Messung für den Bericht.

    python tests/prozess-benchmark/report.py <results.json> [<results-vorher.json>] [--korpus <korpus-results.json>]

Liest die Ausgabe von evaluate.ts und schreibt Markdown-Tabellen auf stdout: gesamt,
je Welle, je Band, je Modul/Domäne, je Hälfte (Lern/Prüf), je Soll-Knotenart, je
Grenzfall-Konstrukt (Welle 2) und die Fehlerbilder. Mit einer zweiten Datei zusätzlich
die Differenz vorher → nachher. Kanten zwischen Ereignisblöcken (Soll: end → start eines
anderen Ereignisses) werden getrennt gezählt, weil die Sollantworten sie uneinheitlich führen.
"""
import collections, json, os, re, sys

sys.stdout.reconfigure(encoding='utf-8')
HERE = os.path.dirname(os.path.abspath(__file__))
args = [a for a in sys.argv[1:]]
korpus = None
if '--korpus' in args:
    i = args.index('--korpus'); korpus = args[i + 1]; del args[i:i + 2]
after = json.load(open(args[0], encoding='utf-8'))['outcomes']
before = json.load(open(args[1], encoding='utf-8'))['outcomes'] if len(args) > 1 else None
split = json.load(open(os.path.join(HERE, 'split.json')))
LEARN = set(split['learn'])


def expected(cid):
    return json.load(open(os.path.join(HERE, 'cases', cid, 'expected.json'), encoding='utf-8'))


EXP = {o['id']: expected(o['id']) for o in after}


def wave(o):
    return 1 if int(o['id'][3:]) <= 100 else 2


PACKS = ['SD / Order-to-Cash', 'MM / Lager', 'FI/CO', 'PP / PM / QM', 'Querschnitt (IDoc, HR, Workflow, Stammdaten)',
         'W2: PM vertieft / CS / EHS', 'W2: PS / RE-FX / PSM / FSCM / TRM', 'W2: HCM (PY, PT, OM, Reise, PE, ESS)',
         'W2: Branchen (IS-U, Retail, Oil, Automotive, VC, GTS, TRA, HU, Rebates)', 'W2: Technik (Formulare, OData, BOPF, WD, CIF, BW, Jobs)']


def module(o):
    return PACKS[(int(o['id'][3:]) - 1) // 20]


def nfiles(o):
    return len([f for f in os.listdir(os.path.join(HERE, 'cases', o['id'])) if f.endswith('.abap')])


def stats(outs):
    nodes = [n for o in outs for n in o['nodes']]
    c = collections.Counter(n['outcome'] for n in nodes)
    comp = c['hit'] + c['missed'] + c['wrong-kind']
    e = [o['edges'] for o in outs]
    ec = sum(x['comparable'] for x in e); eh = sum(x['hit'] for x in e)
    sk = sum(1 for o in outs if o['classes'].get('skelett', {}).get('state') == 'agree')
    fs = collections.defaultdict(lambda: [0, 0])
    for o in outs:
        for a in o['classes'].get('fachsaetze', {}).get('aspects', []):
            fs[a['name']][0] += a['compared']; fs[a['name']][1] += a['total']
    return dict(n=len(outs), soll=len(nodes), comp=comp, hit=c['hit'], wrong=c['wrong-kind'], miss=c['missed'],
                nobridge=c['no-bridge'], located=sum(1 for n in nodes if n['located']), ec=ec, eh=eh, sk=sk,
                cov=fs['fachsatzabdeckung'], inh=fs['fachsatzinhalt'], forb=fs['verbotene-aussagen'],
                extra=sum(o['engine']['extraNodes'] for o in outs), engine=sum(o['engine']['nodes'] for o in outs))


def pct(a, b):
    return '—' if not b else f'{100 * a / b:.1f} %'


def row(label, s, b=None):
    cells = [label, str(s['n']), str(s['soll']), pct(s['comp'], s['soll']), pct(s['hit'], s['comp']),
             pct(s['hit'], s['soll']), pct(s['eh'], s['ec']), f"{s['sk']}/{s['n']}",
             pct(s['cov'][0], s['cov'][1]), pct(s['inh'][0], s['inh'][1])]
    if b:
        d = 100 * s['hit'] / max(s['comp'], 1) - 100 * b['hit'] / max(b['comp'], 1)
        de = 100 * s['eh'] / max(s['ec'], 1) - 100 * b['eh'] / max(b['ec'], 1)
        cells += [f'{d:+.1f} pp', f'{de:+.1f} pp']
    return '| ' + ' | '.join(cells) + ' |'


HEAD = ['Gruppe', 'Fälle', 'Sollknoten', 'vergleichbar', 'Knoten-Treffer (vergl.)', 'Knoten-Treffer (alle)',
        'Kanten-Treffer', 'Skelett agree', 'Fachsatz-Abdeckung', 'Fachsatz-Inhalt']


def table(title, groups):
    print(f'\n### {title}\n')
    head = HEAD + (['Δ Knoten', 'Δ Kanten'] if before else [])
    print('| ' + ' | '.join(head) + ' |')
    print('|' + '---|' * len(head))
    bmap = {o['id']: o for o in before} if before else None
    for label, ids in groups:
        outs = [o for o in after if o['id'] in ids]
        if not outs:
            continue
        b = stats([bmap[i] for i in ids if i in bmap]) if bmap else None
        print(row(label, stats(outs), b))


ALL = {o['id'] for o in after}
table('Gesamt', [('alle 200', ALL), ('Welle 1 (Kernmodule)', {o['id'] for o in after if wave(o) == 1}),
                 ('Welle 2 (Randmodule, Grenzfälle)', {o['id'] for o in after if wave(o) == 2}),
                 ('Lernhälfte', ALL & LEARN), ('Prüfhälfte', ALL - LEARN)])
table('Je Band', [(b, {o['id'] for o in after if o['meta'].get('band') == b}) for b in ['einfach', 'mittel', 'komplex', 'sehr komplex']])
mods = collections.defaultdict(set)
for o in after:
    mods[module(o)].add(o['id'])
table('Je Themenpaket (je 20 Fälle)', [(p, mods[p]) for p in PACKS])
table('Ein- und Mehrdateifälle', [('eine Datei', {o['id'] for o in after if nfiles(o) == 1}),
                                  ('2–3 Dateien', {o['id'] for o in after if 2 <= nfiles(o) <= 3}),
                                  ('4+ Dateien', {o['id'] for o in after if nfiles(o) >= 4})])

# Je Soll-Knotenart
print('\n### Je Soll-Knotenart (alle 200)\n')
print('| Art | Soll | vergleichbar | getroffen | andere Art | ohne Knoten | ohne Brücke | Treffer (vergl.) |')
print('|---|---|---|---|---|---|---|---|')
by = collections.defaultdict(collections.Counter)
for o in after:
    for n in o['nodes']:
        by[n['type']][n['outcome']] += 1
for t, c in sorted(by.items(), key=lambda kv: -sum(kv[1].values())):
    comp = c['hit'] + c['wrong-kind'] + c['missed']
    print(f"| {t} | {sum(c.values())} | {comp} | {c['hit']} | {c['wrong-kind']} | {c['missed']} | {c['no-bridge']} | {pct(c['hit'], comp)} |")

# Grenzfall-Konstrukte (Welle 2)
print('\n### Welle 2 je Grenzfall-Konstrukt (Fälle, die es tragen)\n')
edge = collections.defaultdict(set)
for o in after:
    for k in o['meta'].get('edge_constructs', []) or []:
        key = re.split(r'[ (/:,]', str(k).strip())[0].upper()
        edge[key].add(o['id'])
table('Grenzfälle', sorted(((k, v) for k, v in edge.items() if len(v) >= 3), key=lambda kv: -len(kv[1])))

# Fehlerbilder
print('\n### Häufigste Fehlerbilder (Soll-Art, Anweisung → Engine)\n')
kw = lambda s: (re.match(r'\s*([A-Za-z-]+(?:\s+(?:FUNCTION|METHOD|TRANSACTION|SCREEN|TO\s+SCREEN))?)', s or '') or [None, '?'])[1].upper()
fails = collections.Counter()
for o in after:
    for n in o['nodes']:
        if n['outcome'] in ('missed', 'wrong-kind'):
            fails[(n['outcome'], n['type'], kw(n['statement']), ','.join(sorted(n['engineKinds'])) or '—')] += 1
print('| Ergebnis | Soll-Art | Anweisung | Engine | Anzahl |')
print('|---|---|---|---|---|')
for (oc, t, k, e), v in fails.most_common(25):
    print(f'| {oc} | {t} | {k} | {e} | {v} |')

# Ereignisverkettung
chain = 0
for o in after:
    ex = EXP[o['id']]; types = {n['id']: n['type'] for n in ex['skeleton']['nodes']}
    chain += sum(1 for e in ex['skeleton']['edges'] if types.get(e['from']) == 'end' and types.get(e['to']) == 'start')
print(f'\nSollkanten end → start (Ereignis- bzw. Rücksprungverkettung, uneinheitlich geführt): {chain}')

if korpus:
    k = json.load(open(korpus, encoding='utf-8'))['outcomes']
    print('\n### Referenzkorpus zum Vergleich\n')
    print('| ' + ' | '.join(HEAD) + ' |'); print('|' + '---|' * len(HEAD))
    print(row('Referenzkorpus (68)', stats(k)))
