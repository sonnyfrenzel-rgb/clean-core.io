import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { readCustomerTexts } from '../lib/abap/customer-texts';
import { ENGINE_READS_310_FROM } from '../lib/abap/engine-reads-310-gate';
import { explainBusinessRules } from '../lib/abap/business-rule-set-explain';
import { readProcess, readRules } from '../lib/first-look';
import { processStory } from '../lib/process-story';
import { programSummaryFactsOf } from '../lib/program-summary-facts';
import { businessInShort, programSummary } from '../lib/program-summary-text';
import { pastedFileName } from '../lib/home-start-handoff';
import { readUploadedFile } from '../lib/own-code-zip';
import { assembleOwnCode, assemblyReady } from '../lib/own-code-import';
import { DEMO_STORAGE_KEY } from '../lib/demo-marks';
import { readWorkspaceDemoState, writeWorkspaceDemoState } from '../lib/demo-workspace-state';

/** QA review of 966eea0fa5c9, the UI slice: each test fails without its fix or names the coverage that was missing. */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('the first view is not chosen from an own list whose listener failed after answering empty', () => {
  const src = read('components/workspace/WorkspaceListReport.tsx');
  const first = /if \(([^)]*)\) \{\s*return <HomeFirstView/.exec(src);
  expect(first, 'the condition that opens the first view').toBeTruthy();
  expect(first![1]).toContain('!ownFailed');
});

test('Analyze, Business offers the outline toggle on every width, since it folds the outline on every width', () => {
  const src = read('components/process-map/ProcessMap.tsx');
  // The column is hidden on every width on that page when folded …
  expect(src).toContain("outlineOpen ? '' : page ? ' hidden' : ' lg:hidden'");
  // … so the toggle that opens and closes it is not a desktop-only one there.
  const wrapper = /<span className=\{([^}]*)\}>\s*<CcIconButton\s+data-process-outline-toggle/.exec(src);
  expect(wrapper, 'the toggle\'s wrapper').toBeTruthy();
  expect(wrapper![1]).toMatch(/page \? 'inline-flex' : 'hidden lg:inline-flex'/);
});

test.describe('the demo state keeps legacy rule confirmations on a write of another field', () => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as { window?: unknown };
  let had: unknown;
  test.beforeAll(() => {
    had = g.window;
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
  });
  test.afterAll(() => {
    g.window = had;
  });

  test('a target confirmation written over a legacy state carries its confirmed rules into the answers', () => {
    store.set(DEMO_STORAGE_KEY, JSON.stringify({ confirmedRules: ['R1', 'R2'], other: 7 }));
    expect(Object.keys(readWorkspaceDemoState().ruleAnswers).sort()).toEqual(['R1', 'R2']);
    writeWorkspaceDemoState({ targetConfirmed: true });
    const stored = JSON.parse(store.get(DEMO_STORAGE_KEY)!) as Record<string, unknown>;
    expect(stored.confirmedRules).toBeUndefined();
    expect(stored.other).toBe(7);
    const after = readWorkspaceDemoState();
    expect(after.targetConfirmed).toBe(true);
    expect(after.ruleAnswers.R1?.state).toBe('keep');
    expect(after.ruleAnswers.R2?.state).toBe('keep');
  });

  test('answers written in the same patch win over the carried ones', () => {
    store.set(DEMO_STORAGE_KEY, JSON.stringify({ confirmedRules: ['R1'] }));
    writeWorkspaceDemoState({ ruleAnswers: { R3: { state: 'keep', note: 'mine' } } });
    expect(Object.keys(readWorkspaceDemoState().ruleAnswers)).toEqual(['R3']);
  });
});

test.describe('the first look reads the project\'s customer texts', () => {
  const NEW = ENGINE_READS_310_FROM;
  const PROGRAM = [
    'REPORT zsd_check_minimum.',
    'PARAMETERS p_kdgrp TYPE c LENGTH 2.',
    'DATA: lt_min TYPE STANDARD TABLE OF zsd_minmenge, ls_min TYPE zsd_minmenge.',
    'START-OF-SELECTION.',
    '  SELECT * FROM zsd_minmenge INTO TABLE lt_min WHERE kdgrp = p_kdgrp.',
    '  LOOP AT lt_min INTO ls_min.',
    '    IF ls_min-zzqx IS NOT INITIAL.',
    "      WRITE / 'held'.",
    '    ENDIF.',
    "    IF ls_min-zzart = 'B'.",
    "      WRITE / 'blocked'.",
    '    ENDIF.',
    '  ENDLOOP.',
  ].join('\n');
  const xml = (body: string) => `<?xml version="1.0" encoding="utf-8"?>\n<abapGit version="v1.0.0"><asx:abap xmlns:asx="http://www.sap.com/abapxml" version="1.0"><asx:values>${body}</asx:values></asx:abap></abapGit>`;
  const TEXTS = readCustomerTexts([
    { name: 'src/zsd_minmenge.tabl.xml', text: xml('<DD02V><TABNAME>ZSD_MINMENGE</TABNAME><DDTEXT>Minimum quantities per customer group</DDTEXT></DD02V><DD03P_TABLE><DD03P><FIELDNAME>ZZQX</FIELDNAME><ROLLNAME>ZQX_HOLD</ROLLNAME></DD03P><DD03P><FIELDNAME>ZZART</FIELDNAME><ROLLNAME>ZMIN_ART</ROLLNAME></DD03P></DD03P_TABLE>') },
    { name: 'src/zqx_hold.dtel.xml', text: xml('<DD04V><ROLLNAME>ZQX_HOLD</ROLLNAME><DDTEXT>Quality hold</DDTEXT><SCRTEXT_L>Quality hold for the customer group</SCRTEXT_L></DD04V>') },
    { name: 'src/zmin_art.dtel.xml', text: xml('<DD04V><ROLLNAME>ZMIN_ART</ROLLNAME><DOMNAME>ZMIN_ART</DOMNAME><SCRTEXT_L>Minimum type</SCRTEXT_L></DD04V>') },
    { name: 'src/zmin_art.doma.xml', text: xml('<DD01V><DOMNAME>ZMIN_ART</DOMNAME></DD01V><DD07V_TAB><DD07V><DOMVALUE_L>A</DOMVALUE_L><DDTEXT>Advisory</DDTEXT></DD07V><DD07V><DOMVALUE_L>B</DOMVALUE_L><DDTEXT>Blocking</DDTEXT></DD07V></DD07V_TAB>') },
    { name: 'src/zsd_check_minimum.prog.xml', text: xml('<TPOOL><item><ID>R</ID><ENTRY>Check minimum quantities</ENTRY></item><item><ID>S</ID><KEY>P_KDGRP</KEY><ENTRY>        Customer group</ENTRY></item></TPOOL>') },
  ]);

  test('FirstLook hands the texts to the story, the summary and the rule explanation', () => {
    const src = read('components/workspace/FirstLook.tsx');
    expect(src).toContain('const customerTexts = useCustomerTexts(projectId);');
    expect(src).toMatch(/processStory\(\s*process\.skeleton,\s*source,[\s\S]{0,200}?engineVersion,\s*customerTexts,\s*\)/);
    expect(src).toContain('inShortOf(source, process, rules, project?.analysis, engineVersion, customerTexts)');
    expect(src).toContain('explanationOf(source, process, rules, engineVersion, customerTexts)');
    expect(src).toContain('programSummaryFactsOf(source, { skeleton: process.skeleton, ruleSet: rules, engineVersion, customerTexts })');
    expect(src).toContain('explainBusinessRules(source, rules, process.facts, engineVersion, customerTexts)');
    expect(src).toMatch(/\[hasSource, source, process, named, rules, access, project, engineVersion, customerTexts\]/);
  });

  test('what FirstLook computes says the customer\'s words with the texts, and reads as before without them', () => {
    const process = readProcess(PROGRAM);
    const rules = readRules(PROGRAM, process, NEW);
    const story = (texts: typeof TEXTS | null) => JSON.stringify(processStory(process.skeleton, PROGRAM, new Map(), NEW, texts));
    const inShort = (texts: typeof TEXTS | null) =>
      JSON.stringify(businessInShort(programSummary(programSummaryFactsOf(PROGRAM, { skeleton: process.skeleton, ruleSet: rules, engineVersion: NEW, customerTexts: texts })), { codes: false }));
    const explanation = (texts: typeof TEXTS | null) => JSON.stringify(explainBusinessRules(PROGRAM, rules, process.facts, NEW, texts));

    // The absent case: no texts reads exactly as the engine did before them.
    expect(story(null)).not.toMatch(/Quality hold|Blocking|Customer text/);
    expect(explanation(null)).not.toMatch(/Minimum type|Customer text/);

    expect(story(TEXTS)).not.toBe(story(null));
    expect(story(TEXTS)).toMatch(/Quality hold|Blocking|Minimum quantities/i);
    expect(explanation(TEXTS)).not.toBe(explanation(null));
    expect(explanation(TEXTS)).toContain('Customer text: ZZART “Minimum type”');
    // The summary names the program's inputs and objects from the texts where it says them; it never says less.
    expect(inShort(TEXTS).length).toBeGreaterThan(0);
    expect(inShort(null).length).toBeGreaterThan(0);
  });
});

test('pasted code enters the same assembly as an uploaded file; an empty paste adds nothing', async () => {
  const text = read('public/starter-examples/Z_MATERIAL_STOCK_CALC.txt');
  const pasted = await readUploadedFile(new File([text.trim()], pastedFileName(text.trim()), { type: 'text/plain' }), 'p1');
  const uploaded = await readUploadedFile(new File([text], 'Z_MATERIAL_STOCK_CALC.abap', { type: 'text/plain' }), 'u1');
  const a = assembleOwnCode([pasted]);
  const b = assembleOwnCode([uploaded]);
  expect(assemblyReady(a)).toBe(true);
  expect(a.main?.object).toBe(b.main?.object);
  expect(a.source.trim()).toBe(b.source.trim());

  const importer = read('components/workspace/OwnCodeImport.tsx');
  // Add: the trimmed text as a file, through the one `addFiles` every upload takes; empty is refused twice.
  expect(importer).toMatch(/const text = \(pasted \?\? ''\)\.trim\(\);\s*if \(!text\) return;\s*void addFiles\(\[new File\(\[text\], pastedFileName\(text\)/);
  expect(importer).toContain("disabled={pasted.trim() === ''} data-own-code-paste-add");
  // The home page's paste handoff opens the field; a file handoff is read as a drop.
  expect(importer).toMatch(/if \(handoff\.kind === 'files'\) void addFiles\(handoff\.files\);\s*else setPasted\(''\);/);
});
