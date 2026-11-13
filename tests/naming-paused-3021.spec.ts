import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  NAMING_ASKED_IN_THIS_BUILD,
  NAMING_FACTS_PROMPT_MARK,
  NAMING_FORMAT_VERSION,
  NAMING_MADE_FROM_FACTS,
  NAMING_PAUSED_CODE,
  NAMING_PAUSED_REASON,
  NAMING_WITHOUT_FACTS_PAUSED,
  TECHNICAL_NAMES_KEPT,
  applyNaming,
  buildNamingPrompt,
  namingContextOf,
  namingFactsApply,
  namingPaused,
  namingPromptAllowed,
  namingRecordApplies,
  runNamingRequest,
  shouldAskNaming,
  type NamingSubmission,
  type ProcessNamingRecord,
} from '../lib/process-naming';
import { NOT_GENERATED } from '../lib/model-stages';
import { aiNamesOfNaming, buildBpmnExportFromSource, buildReadingExports } from '../lib/bpmn/export';
import { aiMarkingOf } from '../lib/ai-marking';
import { buildProcessMapModel } from '../lib/process-map';
import { APP_VERSION } from '../lib/version';
import { engineReads310Apply } from '../lib/abap/engine-reads-310-gate';
import { PRIVACY_EN } from '../lib/legal/texts/privacy.en';

/**
 * Release 3.0.21, owner decision 06.11.2026: the model's business names for the
 * process map are paused until they can be built from the code's facts only.
 *
 * One switch, `NAMING_WITHOUT_FACTS_PAUSED` in `lib/process-naming.ts`, and five
 * claims held here without a server:
 *
 *   1. nothing asks — neither by itself nor on a click, and the request
 *      sequence makes no model call and stores nothing;
 *   2. `/api/gemini` refuses a naming prompt without facts before a key is
 *      loaded — and the prompt this build writes has none;
 *   3. the naming route refuses to store, with 403 `naming-paused`, before the
 *      receipt is checked or anything is written;
 *   4. a naming stored before is not applied: the map shows the engine's names;
 *   5. no element carries an AI mark — on the map, in the plain or technical
 *      BPMN download.
 *
 * 3.1.0 (roadmap item 1): the pause stays for every context without facts —
 * the five claims below hold for one, whatever the release. A context read for
 * engine 3.1.0 carries the facts (`namingFactsApply`), and that one passes: the
 * page asks with `withFacts`, the prompt carries the facts mark, and the
 * request reaches the model and the store (claim 6).
 *
 * Against the running routes: `tests/process-naming-route.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SOURCE = [
  'REPORT z_paused_probe.',
  'START-OF-SELECTION.',
  '  PERFORM check_access.',
  '  PERFORM release.',
  'FORM check_access.',
  "  AUTHORITY-CHECK OBJECT 'M_BANF_EKG' ID 'ACTVT' FIELD '02'.",
  '  IF sy-subrc <> 0.',
  '    MESSAGE e001(zmm).',
  '  ENDIF.',
  'ENDFORM.',
  'FORM release.',
  "  UPDATE eban SET frgkz = 'X' WHERE banfn = gv_banfn.",
  'ENDFORM.',
].join('\n');

/** A context without the engine's facts — what every build before 3.1.0 reads, and what the pause holds back. */
const context = namingContextOf(SOURCE, { facts: false });
/** The same source read for engine 3.1.0: the facts are attached. */
const withFacts = namingContextOf(SOURCE, { engineVersion: '3.1.0' });
const nodeId = (kind: string, label: string) => context.skeleton.nodes.find((n) => n.kind === kind && n.label === label)!.id;

/** A naming as the route stored it before 3.0.21: verified receipt, this reading, no `madeFrom`. */
const EARLIER: ProcessNamingRecord = {
  formatVersion: NAMING_FORMAT_VERSION,
  digest: context.digest,
  names: [
    { id: nodeId('gateway', 'IF sy-subrc <> 0'), technicalName: 'IF sy-subrc <> 0', name: 'Not authorised?' },
    { id: nodeId('write', 'EBAN'), technicalName: 'EBAN', name: 'Release the requisition' },
  ],
  lanes: [{ key: 'lane-1', name: 'Approver', authorityCheck: 'ac-1', nodes: [nodeId('gateway', 'IF sy-subrc <> 0')] }],
  discarded: { total: 0, byRule: {} },
  origin: {
    source: 'model',
    receipt: 'verified',
    provider: 'google-gemini',
    modelId: 'gemini-receipt-model',
    byok: false,
    issuedAt: Date.parse('2026-10-22T09:30:00.000Z'),
    textSha256: 'a'.repeat(64),
  },
  namedAt: '2026-10-22T09:30:05.000Z',
};

const PAUSED_NOTICE = `${NOT_GENERATED}. ${NAMING_PAUSED_REASON} ${TECHNICAL_NAMES_KEPT}`;

test.describe('3.0.21: business names paused until they are built from the code\'s facts', () => {
  test('the switch is on; a context without facts is paused, and this build asks only once it hands the facts over', () => {
    expect(NAMING_WITHOUT_FACTS_PAUSED).toBe(true);
    // 3.0.x builds say the names are paused; from 3.1.0 the build hands the facts over and asks.
    expect(NAMING_ASKED_IN_THIS_BUILD).toBe(engineReads310Apply(APP_VERSION));
    expect(namingFactsApply(null)).toBe(engineReads310Apply(APP_VERSION));
    expect(namingFactsApply('3.0.21')).toBe(false);
    expect(namingFactsApply('3.0.23')).toBe(false);
    expect(namingFactsApply('3.1.0')).toBe(true);
    expect(namingPaused(context)).toBe(true);
    expect('facts' in context).toBe(false);
    // The reason is plain product wording: no review, no lawyer, no percentage.
    expect(NAMING_PAUSED_REASON).toBe("Business names are paused until they can be built from the code's facts only.");
    expect(NAMING_PAUSED_REASON).not.toMatch(/review|lawyer|legal|%|\d/i);
  });

  test('1. nothing asks: not by itself, not on a click, and the request makes no call', async () => {
    for (const state of ['not-named', 'stale', 'named', null] as const) {
      expect(shouldAskNaming({ owner: true, modelEnabled: true, state })).toBe(false);
    }
    const calls = { model: 0, store: [] as NamingSubmission[] };
    const outcome = await runNamingRequest(
      context,
      {
        callModel: async () => { calls.model += 1; return { text: '{"names":[]}', receipt: {} }; },
        store: async (s) => { calls.store.push(s); return { ok: false, status: 500, error: 'not used' }; },
      },
      { known: true, keyAvailable: true, stages: { naming: true } },
    );
    expect(outcome).toEqual({ ok: false, absence: 'paused', message: NAMING_PAUSED_REASON });
    expect(calls.model, 'a paused naming called the model').toBe(0);
    expect(calls.store).toEqual([]);
    // 3.1.0: the page passes `withFacts` by the same rule the context attaches the facts by — for a run of an
    // older engine it is false, so the hook neither asks nor offers a click there.
    expect(read('components/workspace/WorkspaceProcess.tsx')).toContain('withFacts: namingFactsApply(engineVersionOfProject(project))');
    expect(read('hooks/useAutoProcessNaming.ts')).toContain('shouldAskNaming({ owner, modelEnabled, state, withFacts })');
  });

  test('2. /api/gemini refuses a naming prompt without facts, before any key is loaded', () => {
    const prompt = buildNamingPrompt(context);
    expect(prompt).not.toContain(NAMING_FACTS_PROMPT_MARK);
    expect(namingPromptAllowed(prompt)).toBe(false);
    expect(namingPromptAllowed('Name these steps.')).toBe(false);
    expect(namingPromptAllowed(`… ${NAMING_FACTS_PROMPT_MARK} …`)).toBe(true);

    const route = read('app/api/gemini/route.ts');
    const refusal = route.indexOf('stage === NAMING_STAGE && !namingPromptAllowed(prompt)');
    expect(refusal, 'the proxy has no naming refusal').toBeGreaterThan(0);
    expect(route.slice(refusal, refusal + 300)).toContain('code: NAMING_PAUSED_CODE }, { status: 403 }');
    // Before the test stub and before the key: nothing of the prompt leaves the server.
    expect(refusal).toBeLessThan(route.indexOf('const stubbed = geminiTestStubActive('));
    expect(route.indexOf('await loadOwnModelKey(')).toBeGreaterThan(0);
    expect(refusal).toBeLessThan(route.indexOf('await loadOwnModelKey('));
  });

  test('3. the naming route refuses to store, with 403 naming-paused, before the receipt or a write', () => {
    const route = read('app/api/projects/[projectId]/process-naming/route.ts');
    const post = route.slice(route.indexOf('export async function POST('));
    const refusal = post.indexOf('if (namingPaused(context))');
    expect(refusal, 'the POST has no pause').toBeGreaterThan(0);
    expect(post.slice(refusal, refusal + 200)).toContain('{ error: NAMING_PAUSED_REASON, code: NAMING_PAUSED_CODE }, { status: 403 }');
    expect(refusal).toBeLessThan(post.indexOf('verifyModelReceipt('));
    expect(refusal).toBeLessThan(post.indexOf('.set('));
    expect(NAMING_PAUSED_CODE).toBe('naming-paused');
    // The GET still hands out what is stored — nothing is deleted.
    const get = route.slice(route.indexOf('export async function GET('), route.indexOf('export async function POST('));
    expect(get).not.toMatch(/delete\(|namingPaused/);
    expect(route).not.toMatch(/\.delete\(\)/);
  });

  test('4. a naming stored before is not applied: the engine\'s names, one calm notice', () => {
    expect(namingRecordApplies(EARLIER)).toBe(false);
    const view = applyNaming(context, EARLIER);
    expect(view.state).toBe('not-named');
    expect(view.notice).toBe(PAUSED_NOTICE);
    expect(view.counts.named).toBe(0);
    expect(view.counts.discarded).toBeNull();
    expect(view.lanes).toEqual([]);
    expect(view.origin).toBeNull();
    for (const [i, node] of view.nodes.entries()) {
      expect(node.technicalName).toBe(context.skeleton.nodes[i].label);
      expect(node.businessName).toBeNull();
      expect(node.nameProvenance).toBeNull();
    }
    // The same notice without any stored naming, whatever the key says.
    expect(applyNaming(context, null).notice).toBe(PAUSED_NOTICE);
    expect(applyNaming(context, null, 'no-key').notice).toBe(PAUSED_NOTICE);
    // A naming the route marked as built from the facts is the only kind applied.
    expect(namingRecordApplies({ ...EARLIER, madeFrom: NAMING_MADE_FROM_FACTS })).toBe(true);
    expect(applyNaming(context, { ...EARLIER, madeFrom: NAMING_MADE_FROM_FACTS }).state).toBe('named');
  });

  test('5. no AI mark: not on the map, not in the plain or the technical download', () => {
    const options = { processName: 'Paused probe', sourceFileName: 'z_paused_probe.abap', exporterVersion: 'v3.0.21' };
    const engine = buildBpmnExportFromSource(SOURCE, { ...options, names: 'plain' });
    const withEarlier = buildBpmnExportFromSource(SOURCE, { ...options, names: 'plain', naming: EARLIER });
    expect(aiNamesOfNaming(context, EARLIER)).toBeUndefined();
    expect(withEarlier.xml).toBe(engine.xml);
    expect(withEarlier.xml).not.toContain('cc:origin');
    expect(aiMarkingOf(withEarlier.xml)).toBeNull();
    for (const name of ['Not authorised?', 'Release the requisition', 'Approver']) expect(withEarlier.xml).not.toContain(name);

    const reading = buildReadingExports(SOURCE, { ...options, naming: EARLIER });
    expect(reading.bpmn.xml).not.toContain('cc:origin');
    expect(reading.technical.xml).not.toContain('cc:origin');

    const map = buildProcessMapModel({ bpmn: reading.bpmn, technical: reading.technical, named: applyNaming(context, EARLIER), fileName: 'z_paused_probe.abap' });
    // origin: since v3.1.0 the model carries who wrote the names; no naming applied, nobody wrote one.
    expect(map.naming).toEqual({ state: 'not-named', notice: PAUSED_NOTICE, named: 0, origin: null });
    expect(map.elements.every((e) => e.businessName === null)).toBe(true);
  });

  test('6. a context with the facts of the engine passes: asked, allowed through the proxy, sent and stored', async () => {
    expect(withFacts.facts).toBeDefined();
    expect(namingPaused(withFacts)).toBe(false);
    const prompt = buildNamingPrompt(withFacts);
    expect(prompt).toContain(NAMING_FACTS_PROMPT_MARK);
    expect(namingPromptAllowed(prompt)).toBe(true);
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: 'not-named', withFacts: true })).toBe(true);
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: 'stale', withFacts: true })).toBe(true);
    // A named map, an invited reader and a model that cannot be called still ask nothing.
    expect(shouldAskNaming({ owner: true, modelEnabled: true, state: 'named', withFacts: true })).toBe(false);
    expect(shouldAskNaming({ owner: false, modelEnabled: true, state: 'not-named', withFacts: true })).toBe(false);
    expect(shouldAskNaming({ owner: true, modelEnabled: false, state: 'not-named', withFacts: true })).toBe(false);

    const calls = { prompts: [] as string[], store: [] as NamingSubmission[] };
    const stored: ProcessNamingRecord = { ...EARLIER, digest: withFacts.digest, names: [], lanes: [], madeFrom: NAMING_MADE_FROM_FACTS };
    const outcome = await runNamingRequest(
      withFacts,
      {
        callModel: async (p) => { calls.prompts.push(p); return { text: '{"names":[],"lanes":[]}', receipt: { r: 1 } }; },
        store: async (s) => { calls.store.push(s); return { ok: true, record: stored }; },
      },
      { known: true, keyAvailable: true, stages: { naming: true } },
    );
    expect(outcome).toEqual({ ok: true, record: stored });
    expect(calls.prompts).toEqual([prompt]);
    expect(calls.store).toEqual([{ digest: withFacts.digest, text: '{"names":[],"lanes":[]}', receipt: { r: 1 } }]);
    // The route stamps what it stored from a facts context, and only such a record is applied.
    const route = read('app/api/projects/[projectId]/process-naming/route.ts');
    expect(route).toContain('...(namingContextHasFacts(context) ? { madeFrom: NAMING_MADE_FROM_FACTS } : {}),');
    expect(namingRecordApplies(stored)).toBe(true);
  });

  test('names come back only together with privacy wording that no longer calls them paused', () => {
    // From 3.1.0 the product asks for business names by itself again. Privacy section 3 (and the Trust page and
    // the C14 notice) say they are paused; a build that asks must not ship beside that sentence.
    const sayPaused = PRIVACY_EN.includes('Business names, which we also started ourselves, are paused');
    expect(NAMING_ASKED_IN_THIS_BUILD && sayPaused, 'names are asked while the privacy policy says they are paused: the legal texts need their new wording first').toBe(false);
  });

  test('the settings and the own-code import say the names are paused instead of promising them', () => {
    const card = read('components/ModelStagesCard.tsx');
    expect(card).toContain('data-model-stage-paused={stage}');
    expect(card).toContain('{NAMING_PAUSED_REASON}');
    expect(card).toContain('stage === NAMING_STAGE && !NAMING_ASKED_IN_THIS_BUILD');
    const own = read('components/workspace/OwnCodeImport.tsx');
    expect(own).toContain("!NAMING_ASKED_IN_THIS_BUILD ? NAMING_PAUSED_REASON : namingAvailable ? wt('ownCode.namesSwitchHelp')");
  });
});
