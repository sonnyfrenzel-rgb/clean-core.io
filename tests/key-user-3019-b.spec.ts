/**
 * Roadmap 3.0.19, part B — "When the decision is key user …".
 *
 * When the decision is key user, Transformation generates no code — no
 * scaffold, no model fill, no lease — and shows the engine-built step list;
 * Testing turns the same steps into acceptance checks a key user runs; Economics
 * prices configuration, not a build; the delivery package carries the step list
 * as a document; the phases read sensibly. A program that splits generates code
 * only for the code parts. Design shows key user as the fourth option with its
 * limits, and Analyze says "Level A by construction" beside the score.
 *
 * Behind `KEY_USER_FROM`: a project analysed by an older engine sees no change,
 * which every block below asks too.
 *
 * Server-free: pure modules, plus source guards where the behaviour lives in a
 * page or a route that needs Firebase.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import type { Project } from '../lib/types';
import { artefactDigest, sha256Hex } from '../lib/artefact-digest';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { contractOfProject } from '../lib/contract-build';
import { generationDirection, offTrackRefusal } from '../lib/generation-direction';
import { assembleTransformationContext } from '../lib/transformation-context-build';
import { buildTransformationContext, type TransformationContextInput } from '../lib/transformation-context';
import { handoverBlockers, workflowSteps } from '../lib/workflow-steps';
import { buildHandoverChain, type HandoverProject } from '../lib/handover';
import { buildKeyUserSteps, keyUserStepsMarkdown } from '../lib/key-user-steps';
import {
  KEY_USER_STEPS_PATH,
  isKeyUserDecision,
  keyUserContextOf,
  keyUserEffortLine,
  keyUserGateOpen,
  keyUserModeOf,
  keyUserStepsOf,
} from '../lib/key-user-route';
import { createDeliveryBundle, finishDeliveryPackage } from '../lib/delivery-package';
import { deliveryFactsOf, ruleFactsOf, scoreFactsOf } from '../lib/delivery-facts';
import { readExample } from './helpers/starter-example-files';

const NEW = 'v3.0.19';
const OLD = 'v3.0.18';
const EXAMPLE = 'Z_SD_DELIVERY_PRIORITY.abap';
const WHOLE = readExample(EXAMPLE);

/** One key-user part (a custom field on VBAK) and three that stay code (part A's SPLIT). */
const SPLIT = `REPORT z_order_fix.
PARAMETERS p_vbeln TYPE vbeln_va.

CLASS lcl_im_order DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES if_ex_badi_sd_sales_x.
ENDCLASS.

CLASS lcl_im_order IMPLEMENTATION.
  METHOD if_ex_badi_sd_sales_x~save_document.
    UPDATE vbak SET zz_checked = 'X' WHERE vbeln = p_vbeln.
    CALL FUNCTION 'Z_NOTIFY_CRM' DESTINATION 'CRM_PROD'
      EXPORTING iv_vbeln = p_vbeln.
    COMMIT WORK.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  SELECT SINGLE vbeln, netwr FROM vbak WHERE vbeln = @p_vbeln INTO @DATA(ls_vbak).
  UPDATE zorder_log SET checked = 'X' WHERE vbeln = @p_vbeln.
  WRITE: / ls_vbak-vbeln, ls_vbak-netwr.`;

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function project(extra: Record<string, unknown> = {}, source = WHOLE, engine = NEW): HandoverProject {
  return {
    id: 'p-ku',
    name: 'Delivery priority',
    userId: 'owner-uid',
    legacyCode: source,
    activeRunId: 'run-ku-0001',
    extensibilityRoute: 'In-App ABAP Cloud (RAP)',
    originalRecommendation: 'rap',
    cleanCoreScore: 90,
    s4Deployment: 'private',
    analyzerVersion: engine,
    solutionDesign: '# Design',
    targetArchitecture: 'keyuser',
    approvedByArchitect: true,
    architectJustifiedOverride: 'Every part is a key-user candidate.',
    auditMetadata: {
      inputFingerprint: { sha256: sha256Hex(source), fileName: EXAMPLE, lineCount: source.split('\n').length, uploadedAt: '2026-10-19T08:00:00.000Z', objectType: 'Report' },
      modelCard: { provider: null, model: null, modelParticipation: 'none', engineVersion: engine, byokUsed: false },
    },
    ...extra,
  } as unknown as HandoverProject;
}

const evidenceOf = (source: string, engine = NEW) => buildAbapEvidence(source, 'ZTEST.abap', 'private', undefined, engine);
const phase = (p: Project | null, key: string) => workflowSteps(p).find((s) => s.key === key)!;

/* ------------------------------------------------------------------ gate */

test.describe('behind KEY_USER_FROM: a run of an older engine sees no change', () => {
  test('no decision, no list, no mode, no context, and the phases of before', () => {
    const old = project({}, WHOLE, OLD);
    expect(keyUserGateOpen(old)).toBe(false);
    expect(isKeyUserDecision(old)).toBe(false);
    expect(keyUserStepsOf(evidenceOf(WHOLE, OLD), old)).toBeNull();
    // Even handed a reading, an old run's project answers none.
    expect(keyUserStepsOf(evidenceOf(WHOLE, NEW), old)).toBeNull();
    expect(keyUserModeOf(old, buildKeyUserSteps(evidenceOf(WHOLE, NEW).keyUser))).toBe('none');
    expect(keyUserContextOf(evidenceOf(SPLIT, NEW), project({ targetArchitecture: 'rap' }, SPLIT, OLD))).toBeNull();
    expect(phase(old, 'transformation').badge).toBe('Not started');
    expect(phase(old, 'testing').badge).toBe('Not started');
    const chain = buildHandoverChain(old, workflowSteps(old));
    expect(chain.find((l) => l.key === 'transformation')!.state).toBe('open');
  });

  test('an older engine\'s PLATFORM KNOWLEDGE block is the one it always was', () => {
    const p = project({ targetArchitecture: 'rap' }, SPLIT, OLD);
    const built = contractOfProject(p, null);
    if (!built.ok) throw new Error('the fixture builds no contract');
    expect(built.evidence.keyUser).toBeUndefined();
    const { context } = assembleTransformationContext({
      source: SPLIT, project: p, answers: { basis: 'source', revision: null, entries: [] },
      evidence: built.evidence, contract: built.contract, isAbapCloud: true, grade: () => 'D',
    });
    expect(context.text).not.toContain('KEY-USER');
  });
});

/* ------------------------------------------------------- 1. Transformation */

test.describe('Transformation: a key-user decision generates no code — no scaffold, no model fill, no lease', () => {
  test('the contract refuses the decision, so neither the token, the lease nor a model call is reached', () => {
    const p = project();
    expect(isKeyUserDecision(p)).toBe(true);
    const built = contractOfProject(p, null);
    expect(built).toEqual({ ok: false, code: 'off-track', decided: 'keyuser' });
    const refusal = offTrackRefusal('keyuser');
    expect(refusal.ok).toBe(false);
    expect(refusal.sentence).toContain('No code is generated');
    // The same project decided for RAP does build a contract (the refusal is the decision's, not the source's).
    const rap = contractOfProject(project({ targetArchitecture: 'rap' }), null);
    expect(rap.ok).toBe(true);
    if (rap.ok) expect(generationDirection(rap.contract).ok).toBe(false); // no manifest bound: blocked, as before
  });

  test('the lease route refuses before it issues a lease, charges a unit or calls a model', () => {
    const route = read('app/api/transformation/lease/route.ts');
    const at = (s: string) => {
      const i = route.indexOf(s);
      expect(i, s).toBeGreaterThan(-1);
      return i;
    };
    const refuse = at('if (!built.ok) {');
    expect(at('const built = contractOfProject(')).toBeLessThan(refuse);
    expect(refuse).toBeLessThan(at('const outcome = await issueLease('));
    expect(refuse).toBeLessThan(at('await assertRateLimit(hourly.key'));
    expect(refuse).toBeLessThan(at('await confirmLeaseCharge('));
  });

  test('the stage cannot start a generation, read a plan or scaffold — it shows the step list instead', () => {
    const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page).toContain('const keyUserWhole = isKeyUserDecision(project);');
    expect(page).toContain('const canGenerate = project !== null && !keyUserWhole &&');
    // The plan read (contract + scaffold) and the automatic start both stand on canGenerate.
    expect(page).toContain('const planWanted = canGenerate && !loading;');
    expect(page).toMatch(/const canStart = canGenerate && /);
    expect(page).toContain('if (!canStart) return;');
    const early = page.slice(page.indexOf('if (keyUserWhole) return ('), page.indexOf('/** The legacy source beside the generated code'));
    expect(early).toContain('<KeyUserSteps list={keyUserList} mode="whole" view="steps" />');
    expect(early).toContain('<StageHeader stage="transformation" tools={{ steps: phases, current: \'transformation\' }}');
    for (const call of ['generateTransformation', 'fetchGenerationDecision', 'prepareScaffold', 'requestLease', 'callGemini']) expect(early).not.toContain(call);
  });

  test('the step list: app, object and context, entries, the lines each step replaces, limits', () => {
    const list = keyUserStepsOf(evidenceOf(WHOLE), project())!;
    expect(list.scope).toBe('whole-program');
    expect(list.levelByConstruction).toBe('A');
    expect(keyUserModeOf(project(), list)).toBe('whole');
    expect(list.steps.length).toBeGreaterThan(0);
    for (const s of list.steps) {
      expect(s.app).toBeTruthy();
      expect(s.object.name).toBeTruthy();
      expect(s.context.text).toBeTruthy();
      expect(s.anchors.length).toBeGreaterThan(0);
      expect(s.checks.length).toBeGreaterThan(0);
    }
    expect(list.codeParts).toEqual([]);
  });

  test('Transformation is done with the step list, never proven, and no "generated code" blocker remains', () => {
    const p = project();
    const tf = phase(p, 'transformation');
    expect(tf).toMatchObject({ state: 'done', badge: 'Key-user steps', proven: false });
    expect(tf.detail).toContain('No code is generated');
    // Nothing on the rail asks for code: the next open step is not Transformation.
    expect(workflowSteps(p).find((s) => s.key === 'delivery')!.detail).not.toContain('no generated code');
    // A package left from an earlier decision, stale for the source, blocks no handover of a key-user route.
    // The same package does block the handover under a code decision, so the check is not vacuous.
    const code = JSON.stringify([{ path: 'src/a.ts', content: 'export const a = 1;\n' }]);
    const leftover = (extra: Record<string, unknown>) => project({
      generatedCode: code,
      auditMetadata: {
        ...(project().auditMetadata as object),
        sourceChange: { artefacts: { generatedCode: artefactDigest('generatedCode', code) } },
      },
      ...extra,
    });
    expect(handoverBlockers(leftover({ targetArchitecture: 'rap' }))).toContain('the generated code');
    expect(handoverBlockers(leftover({}))).not.toContain('the generated code');
  });
});

/* ------------------------------------------------- the split: code parts only */

test.describe('a program that splits generates code for its code parts only', () => {
  test('a code decision over a partial reading is a split; the block names the key-user parts as not generated', () => {
    const p = project({ targetArchitecture: 'rap', architectJustifiedOverride: '' }, SPLIT);
    const list = keyUserStepsOf(evidenceOf(SPLIT), p)!;
    expect(list.scope).toBe('partial');
    expect(keyUserModeOf(p, list)).toBe('split');
    const ctx = keyUserContextOf(evidenceOf(SPLIT), p)!;
    expect(ctx.steps.map((s) => s.app)).toEqual(['Custom Fields']);
    expect(ctx.codeParts.length).toBe(3);

    const built = contractOfProject(p, null);
    if (!built.ok) throw new Error('the fixture builds no contract');
    const { context } = assembleTransformationContext({
      source: SPLIT, project: p, answers: { basis: 'source', revision: null, entries: [] },
      evidence: built.evidence, contract: built.contract, isAbapCloud: true, grade: () => 'D',
    });
    expect(context.text).toContain('KEY-USER PARTS — NOT GENERATED');
    expect(context.text).toContain('S1 Custom Fields');
    expect(context.text).toContain('Build only the parts that stay code: KU-R1');
    expect(context.text).toContain('" KEY USER: <step id> (<app>) — configured, not generated');
  });

  test('a whole-program reading under a code decision, and a key-user decision, are no split', () => {
    expect(keyUserContextOf(evidenceOf(WHOLE), project({ targetArchitecture: 'rap' }))).toBeNull();
    expect(keyUserContextOf(evidenceOf(SPLIT), project({}, SPLIT))).toBeNull();
    expect(keyUserModeOf(project({}, SPLIT), keyUserStepsOf(evidenceOf(SPLIT), project({}, SPLIT)))).toBe('whole');
  });

  test('without a split the block says nothing of key user, and the line is a head that is never cut', () => {
    const base: TransformationContextInput = {
      track: 'rap',
      rules: { basis: 'source', revision: null, items: [] },
      decision: { route: { chosen: 'in-app-rap', recommended: 'in-app-rap', deviationReason: null }, record: null, signedOff: 'rap', reference: null },
      summary: null,
      objects: [],
      nfr: null,
      accepted: null,
      dataMode: null,
      originalFactsBelow: false,
    };
    expect(buildTransformationContext(base).text).not.toContain('KEY-USER');
    expect(buildTransformationContext({ ...base, keyUser: null }).text).toBe(buildTransformationContext(base).text);
    const ku = { steps: [{ id: 'S1', app: 'Custom Fields', title: 'Create the custom field ZZ_X on VBAK', lines: 'L4' }], codeParts: [{ id: 'KU-R1', part: 'IF_X~SAVE', lines: 'L9–14' }] };
    const tight = buildTransformationContext({ ...base, keyUser: ku }, 1_000);
    expect(tight.text).toContain('KEY-USER PARTS — NOT GENERATED');
  });
});

/* ---------------------------------------------------------------- 2. Testing */

test.describe('Testing: the same steps as acceptance checks, no generated test code for the key-user part', () => {
  test('every step carries given / when / then checks anchored to the lines it re-tests', () => {
    const list = keyUserStepsOf(evidenceOf(WHOLE), project())!;
    const checks = list.steps.flatMap((s) => s.checks);
    expect(checks.length).toBe(list.effort.checks);
    for (const c of checks) {
      expect(c.id).toMatch(/^S\d+\.\d+$/);
      expect(c.given && c.when && c.then).toBeTruthy();
    }
    expect(checks.some((c) => c.lines.length > 0)).toBe(true);
  });

  test('the phase says a key user runs them; the stage writes no suite', () => {
    const t = phase(project(), 'testing');
    expect(t).toMatchObject({ state: 'partial', badge: 'Key-user checks', proven: false });
    expect(t.detail).toContain('No test code');
    const page = read('app/(app)/project/[projectId]/testing/page.tsx');
    expect(page).toContain('const generateBlocked = keyUserWhole ||');
    const early = page.slice(page.indexOf('if (keyUserWhole) return ('));
    expect(early.slice(0, early.indexOf('</StageFrame>'))).toContain('view="checks"');
    expect(early.slice(0, early.indexOf('</StageFrame>'))).not.toContain('handleGenerate');
  });
});

/* -------------------------------------------------------------- 3. Economics */

test.describe('Economics: configuration effort, not a build — counts and the account\'s own day rate', () => {
  test('the engine gives counts and no amount', () => {
    const list = keyUserStepsOf(evidenceOf(WHOLE), project())!;
    const line = keyUserEffortLine(list);
    expect(line).toContain(`${list.effort.steps} step`);
    expect(line).toContain(`${list.effort.checks} acceptance check`);
    expect(line).not.toMatch(/[€$£]|\bEUR\b|\bdays?\b/);
  });

  test('the card prices only the reader\'s days with the reader\'s key-user rate', () => {
    const card = read('components/keyuser/KeyUserEffort.tsx');
    expect(card).toContain('days.low * keyUserRate');
    expect(card).toContain('Clean-Core.io proposes no number of days for key-user work.');
    // No figure of its own: every number on the card is a prop.
    expect(card).not.toMatch(/\*\s*\d|\d\s*\*/);
    const page = read('app/(app)/project/[projectId]/tco/page.tsx');
    expect(page).toContain('keyUserRate={userRate}');
    expect(page).toContain("rebuild={assumptions.options.find((o) => o.kind === 'rebuild')}");
  });
});

/* --------------------------------------------------------------- 4. Delivery */

test.describe('Delivery: the package carries the step list as a document', () => {
  const facts = (p: HandoverProject) =>
    deliveryFactsOf(p, {
      phases: workflowSteps(p),
      rules: ruleFactsOf(null, 'not read in this test.'),
      score: scoreFactsOf(p, null, 'not read in this test'),
      generatedAt: '2026-10-19T09:00:00.000Z',
      appVersion: NEW,
      referenceSection: '',
      documentationFromEngine: true,
    });
  const bundle = () => {
    const b = createDeliveryBundle();
    b.folder('docs').file('solution-design.md', '# Design\n');
    return b.entries;
  };

  test('docs/key-user-steps.md is in the files, the manifest, README and STATUS; no code is claimed', () => {
    const p = project({ documentation: '# Process' });
    const list = keyUserStepsOf(evidenceOf(WHOLE), p)!;
    const markdown = keyUserStepsMarkdown(list, 'Delivery priority');
    const out = finishDeliveryPackage({
      entries: bundle(),
      facts: { ...facts(p), keyUser: { whole: true, markdown, steps: list.effort.steps, checks: list.effort.checks, codeParts: 0 } },
      layout: 'flat',
    });
    const file = (name: string) => out.files.find((f) => f.path === name)?.content ?? null;
    expect(file(KEY_USER_STEPS_PATH)).toBe(markdown);
    expect(out.manifest.find((f) => f.path === KEY_USER_STEPS_PATH)).toMatchObject({ kind: 'key-user-steps', origin: 'engine', status: 'proposed' });
    expect(file('README.md')).toContain('docs/key-user-steps.md');
    const status = file('STATUS.md')!;
    expect(status).toContain(`Configure the ${list.effort.steps} key-user step`);
    expect(status).toContain('No code: the decision is key-user extensibility.');
    expect(status).not.toContain('The code was generated by a language model');
  });

  test('without a step list the package is the one it always was', () => {
    const p = project({}, WHOLE, OLD);
    const out = finishDeliveryPackage({ entries: bundle(), facts: facts(p), layout: 'flat' });
    expect(out.files.map((f) => f.path)).not.toContain(KEY_USER_STEPS_PATH);
    expect(out.files.find((f) => f.path === 'STATUS.md')!.content).not.toContain('key-user step');
  });

  test('the handover lists the step list and the checks; Delivery is ready with them, never proven', () => {
    const p = project({ documentation: '# Process' });
    const chain = buildHandoverChain(p, workflowSteps(p));
    const tf = chain.find((l) => l.key === 'transformation')!;
    expect(tf).toMatchObject({ state: 'on-record', provenance: 'reconstructed', by: 'The deterministic engine' });
    expect(tf.missing).toContain(KEY_USER_STEPS_PATH);
    expect(chain.find((l) => l.key === 'tests')!.value).toBe('Acceptance checks of the key-user step list');
    expect(phase(p, 'delivery')).toMatchObject({ state: 'done', badge: 'Ready · key-user steps', proven: false });
    expect(phase(project(), 'delivery')).toMatchObject({ state: 'partial', detail: 'Review material only: no documentation.' });
    const page = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(page).toContain('facts: { ...facts, keyUser },');
  });
});

/* ------------------------------------------------------ 5. Design and Analyze */

test.describe('Design shows the fourth option with its limits; Analyze says Level A by construction', () => {
  test('the sign-off offers key user only where the engine read a key-user part', () => {
    const panel = read('components/ArchitectSignOff.tsx');
    expect(panel).toContain(".filter((opt) => opt.value !== 'keyuser' || keyUserOffered)");
    const page = read('app/(app)/project/[projectId]/design/page.tsx');
    expect(page).toContain('keyUserOffered={!!keyUserList && keyUserList.steps.length > 0}');
    expect(page).toContain('keyUser: keyUser ? keyUserRouteBasis(keyUser) : null,');
    const comparison = read('components/design/OptionComparison.tsx');
    expect(comparison).toContain('{keyUser ? <KeyUserLimits list={keyUser} /> : null}');
  });

  test('"Level A by construction" beside the score, only where the whole program is key user', () => {
    expect(keyUserStepsOf(evidenceOf(WHOLE), project())!.levelByConstruction).toBe('A');
    expect(keyUserStepsOf(evidenceOf(SPLIT), project({}, SPLIT))!.levelByConstruction).toBeNull();
    const page = read('app/(app)/project/[projectId]/analyze/page.tsx');
    expect(page).toContain('keyUserLevel: keyUserStepsOf(evidenceReport, project)?.levelByConstruction ?? null,');
    const hero = read('components/analyze/AnalysisAnswer.tsx');
    expect(hero).toContain('data-key-user-level={keyUserLevel}');
  });
});
