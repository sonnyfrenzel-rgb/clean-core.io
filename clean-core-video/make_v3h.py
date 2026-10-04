import io, os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))
s = io.open('CleanCore30v3g.tsx', encoding='utf8').read()


def rep(a, b):
    global s
    assert s.count(a) == 1, 'count %d: %s' % (s.count(a), a[:80])
    s = s.replace(a, b)


rep(""" *  Clean-Core.io 3.0 — launch clip, version 3g (final cut)
""", """ *  Clean-Core.io 3.0 — launch clip, version 3h (DRAFT for review)
 *  v3h (04.10.2026): every scene with a product screen re-captured from the
 *  release build v3.0.3 (local production build of the release commit on the
 *  Firebase emulators, demo project Z_MM_PO_APPROVAL, deviceScaleFactor 2,
 *  public/screens30/v3h-*.png). Score 23 (was 28), Business opens with the next
 *  step and numbered steps, Management leads with the decision, a code branch
 *  is a "decision point" (ADR-073), Design and Transformation show the demo
 *  (engine, no model), RAP tests from your own system. Same scenes and timing.
""")
rep("export const CC30V3G_DURATION", "export const CC30V3H_DURATION")

# 2 process
rep("const c = region(42, 690, 1042, 960, 960, 180, 0.02);", "const c = region(42, 690, 1042, 960, 960, 180, 0.02);")
rep("const p = region(1150, 1090, 2150, 1340, 960, 180, 0.02);", "const p = region(1150, 1160, 2150, 1410, 960, 180, 0.02);")
rep('<Cam src="screens30/v3-landing-panel.png" iw={2400} ih={1400} w={960} h={c.h} at={2} keys={c.keys} hl={[{ x: 42, y: 705, w: 1000, h: 40, from: 34 }]} />',
    '<Cam src="screens30/v3h-landing-panel.png" iw={2400} ih={1870} w={960} h={c.h} at={2} keys={c.keys} hl={[{ x: 42, y: 750, w: 1000, h: 44, from: 34 }]} />')
rep('<Cam src="screens30/v3-landing-panel.png" iw={2400} ih={1400} w={960} h={p.h} at={12} keys={p.keys} hl={[{ x: 1325, y: 1215, w: 245, h: 80, from: 60 }]} />',
    '<Cam src="screens30/v3h-landing-panel.png" iw={2400} ih={1870} w={960} h={p.h} at={12} keys={p.keys} hl={[{ x: 1330, y: 1268, w: 232, h: 64, from: 60 }]} />')
rep('Line 78 of the program becomes the decision &quot;Material given?&quot; — no model involved.',
    'Line 78 of the program becomes the decision point &quot;Material given?&quot; — no model involved.')

# 3 editor
rep('src="screens30/v3f-editor-fullscreen.png"', 'src="screens30/v3h-editor-fullscreen.png"')
rep("{ x: 58, y: 42, w: 2227, h: 80, from: 18, to: 70 },", "{ x: 50, y: 50, w: 2235, h: 80, from: 18, to: 70 },")
rep("{ x: 3193, y: 714, w: 445, h: 62, from: 138, to: 168 },", "{ x: 3195, y: 730, w: 445, h: 62, from: 138, to: 168 },")
rep("{ x: 3193, y: 1453, w: 589, h: 144, from: 172 },", "{ x: 3193, y: 1469, w: 589, h: 144, from: 172 },")

# 4 score
rep("const r = region(40, 115, 1664, 760, 960, 180, 0.02);", "const r = region(40, 60, 2000, 750, 960, 180, 0.02);")
rep('lead="28 of 100: far from clean core. Each band says what stands in the way."', 'lead="23 of 100: far from clean core. Each band says what stands in the way."')
rep('<Cam src="screens30/v3b-score.png" iw={1704} ih={1518} w={960} h={r.h} at={2} keys={r.keys} hl={[{ x: 58, y: 318, w: 388, h: 440, from: 50 }]} />',
    '<Cam src="screens30/v3h-score.png" iw={2060} ih={1320} w={960} h={r.h} at={2} keys={r.keys} hl={[{ x: 68, y: 368, w: 463, h: 360, from: 50 }]} />')
rep("<Footnote at={30}>Real signed run of the example program. A grade, not a compliance percentage, and not an SAP measure. Every finding opens the code at its line.</Footnote>",
    "<Footnote at={30}>The engine&apos;s reading of the demo program — a demo is never signed. A grade, not a compliance percentage, and not an SAP measure.</Footnote>")

# 5 views
a = s.index('const VIEWS3 = [')
b = s.index('const VSLOT = 156;')
s = s[:a] + """type View = { name: string; q: string; src: string; iw: number; ih: number; r: readonly [number, number, number, number]; keys?: Key[]; note: string };
const VIEWS3: View[] = [
  {
    name: 'Business',
    q: 'Do I still need this, and what changes for me?',
    src: 'screens30/v3h-business.png',
    iw: 2434,
    ih: 1318,
    r: [0, 0, 2434, 1318] as const,
    keys: [
      { f: 0, cx: 1217, cy: 659, vw: 2434 },
      { f: 70, cx: 1217, cy: 659, vw: 2434 },
      { f: 104, cx: 800, cy: 862, vw: 1600 },
      { f: 166, cx: 790, cy: 862, vw: 1580 },
    ],
    note: 'The next step first, then the process in plain, numbered steps — each with the line it was read from.',
  },
  {
    name: 'IT',
    q: 'What exactly, where to, and is it right?',
    src: 'screens30/v3h-it-uses.png',
    iw: 1646,
    ih: 800,
    r: [0, 0, 1646, 800] as const,
    note: "Every object the code uses, with its lines and its clean core level A to D from SAP's own data.",
  },
  {
    name: 'Management',
    q: 'What do I risk, what do I decide?',
    src: 'screens30/v3h-mgmt-decision.png',
    iw: 2400,
    ih: 1289,
    r: [0, 0, 1200, 650] as const,
    keys: [
      { f: 0, cx: 520, cy: 320, vw: 1040 },
      { f: 377, cx: 520, cy: 320, vw: 1040 },
      { f: 412, cx: 1730, cy: 400, vw: 1360 },
      { f: 480, cx: 1735, cy: 400, vw: 1340 },
    ],
    note: 'The decision first — keep, rebuild, move to SAP standard or retire — and fit to standard as one figure.',
  },
];
""" + s[b:]
rep("<Cam src={v.src} iw={v.iw} ih={v.ih} w={960} h={Math.min(r.h, 520)} keys={r.keys} />",
    "<Cam src={v.src} iw={v.iw} ih={v.ih} w={960} h={v.keys ? 520 : Math.min(r.h, 520)} keys={v.keys ?? r.keys} />")

# 6 look
rep("const r = region(0, 0, 1185, 392, 960, 150, 0.02);", "const r = region(0, 0, 1380, 405, 960, 150, 0.02);")
rep('<Cam src="screens30/v3b-tiles.png" iw={2372} ih={392} w={960} h={r.h} at={2} keys={r.keys} />',
    '<Cam src="screens30/v3h-tiles.png" iw={2760} ih={405} w={960} h={r.h} at={2} keys={r.keys} />')

# 7 design
rep("const r = region(40, 110, 1240, 660, 960, 195, 0.02);", "const r = region(40, 130, 1240, 680, 960, 195, 0.02);")
rep('src="screens30/v3d-design-canvas.png"\n          iw={1924}\n          ih={1006}', 'src="screens30/v3h-design-canvas.png"\n          iw={1985}\n          ih={1114}')
rep("hl={[{ x: 106, y: 292, w: 450, h: 72, from: 50 }]}", "hl={[{ x: 111, y: 319, w: 465, h: 69, from: 50 }]}")
rep("The target architecture, drawn from the run: released APIs take over the table access, line by line.",
    "The target architecture, drawn from the evidence: released APIs take over the table access, line by line.")
rep("<Footnote at={30}>Real run of the example program · fictitious code. The design document is a model proposal; you confirm the target yourself.</Footnote>",
    "<Footnote at={30}>Demo project · fictitious code · the engine&apos;s reading, no model. You confirm the target yourself; in a real run the design document is a model proposal.</Footnote>")

# 8 transformation
rep("const r = region(980, 70, 2420, 830, 960, 195, 0.02);", "const r = region(980, 40, 2790, 1020, 960, 195, 0.02);")
rep("          And the design becomes a code draft.", "          And every finding gets its target for the code draft.")
rep("25 findings at 31 places in the code, their targets, and the 5 files the model wrote — each one marked as a proposal.",
    "25 findings at 31 places in the code, each with its target — the plan the model writes the code against.")
rep('src="screens30/v3d-transf-sankey.png"\n          iw={2430}\n          ih={1366}', 'src="screens30/v3h-transf-sankey.png"\n          iw={2790}\n          ih={1512}')
rep("hl={[{ x: 1983, y: 240, w: 396, h: 137, from: 50 }]}", "hl={[{ x: 1660, y: 200, w: 460, h: 80, from: 50 }]}")
rep("<Footnote at={30}>Real run of the example program · fictitious code. Not compiled and not run here; the Testing tool runs it against mocks.</Footnote>",
    "<Footnote at={30}>Demo project · fictitious code. The demo stops where the model begins; in a real run every file it writes is marked as a proposal, and nothing is compiled here.</Footnote>")

# 9 chain
rep("<Footnote at={90}>Each step says where it came from. The code is a draft for review; tests run in an isolated runner against mocks, not in your S/4HANA system.</Footnote>",
    "<Footnote at={90}>Each step says where it came from. The code is a draft for review; tests run in an isolated runner against mocks, and an ABAP Unit result from your own system is recorded as imported or self-declared.</Footnote>")

rep("export const CleanCore30v3g: React.FC", "export const CleanCore30v3h: React.FC")
io.open('CleanCore30v3h.tsx', 'w', encoding='utf8', newline='').write(s)

r = io.open('Root.tsx', encoding='utf8').read()
if 'CleanCore30v3h' not in r:
    r = r.replace("import { CleanCore30v3g, CC30V3G_DURATION } from './CleanCore30v3g';",
                  "import { CleanCore30v3g, CC30V3G_DURATION } from './CleanCore30v3g';\nimport { CleanCore30v3h, CC30V3H_DURATION } from './CleanCore30v3h';")
    r = r.replace('      <Composition id="CleanCore30v3g"',
                  '      {/* v3h - every product screen re-captured from v3.0.3. */}\n'
                  '      <Composition id="CleanCore30v3h" component={CleanCore30v3h} durationInFrames={CC30V3H_DURATION} fps={FPS} width={1080} height={1080} />\n'
                  '      <Composition id="CleanCore30v3g"')
    io.open('Root.tsx', 'w', encoding='utf8', newline='').write(r)
print('ok')
