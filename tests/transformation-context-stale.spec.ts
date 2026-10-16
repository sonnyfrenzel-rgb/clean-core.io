import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { withContextDigest, withStoredGeneration } from '../lib/project-loader';
import { basisSlotChanged, storedContextDigest, type BasisSlot } from '../lib/transformation/generation-record';
import type { Project } from '../lib/types';
import { codeStaleWords, nextPhaseKey, phaseActionLabel, staleness, workflowSteps } from '../lib/workflow-steps';
import { contractOfProject } from '../lib/contract-build';
import { assembleTransformationContext } from '../lib/transformation-context-build';
import { sha256Hex } from '../lib/artefact-digest';

/**
 * Roadmap 3.0.13, item 3: the Transformation phase goes stale on a changed
 * context digest. Until now only the Built-on card marked the changed tools
 * *Stale*; `staleness()` read the project document alone, so the tool bar,
 * the rail, the dashboard row and Delivery — all of which read
 * `workflowSteps` (docs/ARCHITECTURE.md §2) — went on calling a package
 * generated before a rule decision changed "Generated".
 *
 * Now the loader asks the server for the digest of the PLATFORM KNOWLEDGE block
 * as it would be built now (`GET /api/projects/{id}/contract?for=context`,
 * `_contextDigest`), and `staleness().context` compares it with the digest the
 * store wrote into the binding. Both digests are the server's. Server-free.
 *
 * Also QA caa5712913ad: the Built-on card compared only the first fact of a
 * tool, so a change in any later fact went unseen.
 */

const ROOT = path.join(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

function generated(binding: Record<string, unknown> | undefined, current?: string | null): Project {
  const project = {
    id: 'p1',
    name: 'Context',
    legacyCode: 'REPORT zctx.\nWRITE / 1.',
    activeRunId: 'run-1',
    solutionDesign: '# Design',
    approvedByArchitect: true,
    generatedCode: JSON.stringify([{ path: 'srv/process.ts', content: 'export {};' }]),
    ...(binding ? { generationBinding: binding } : {}),
  } as unknown as Project;
  return withContextDigest(project, current);
}

const transformation = (p: Project) => workflowSteps(p).find((s) => s.key === 'transformation')!;
const engineLed = (digest: string) => ({ path: 'engine-led', contextDigest: digest, engine: null, basis: [] });

test.describe('the Transformation phase reads the context digest', () => {
  test('changed since the generation: stale, everywhere the phases are read', () => {
    const p = generated(engineLed(A), B);
    expect(staleness(p).context).toBe(true);
    const step = transformation(p);
    expect(step).toMatchObject({ state: 'stale', done: false, proven: false, badge: 'Stale' });
    expect(step.detail).toBe('Generated before a rule decision, the decision record or an accepted requirement changed — regenerate it to build on what is decided now.');
    // The tool bar's action and "continue" read the same state.
    expect(phaseActionLabel(step, true)).toBe('Bring Transformation up to date');
    expect(nextPhaseKey(workflowSteps(p))).toBe('transformation');
    // Without the change, the same project reads generated.
    expect(transformation(generated(engineLed(A), A))).toMatchObject({ state: 'done', badge: 'Generated' });
    // The single call names its context too, and goes stale the same way.
    expect(transformation(generated({ path: 'single-call', contextDigest: A, fallbackReason: 'x' }, B)).state).toBe('stale');
  });

  test('unknown is never stale: no current digest read, a failed read, a package from before 3.0.12', () => {
    // A bare project document (the dashboard) — nobody read the current digest.
    expect(transformation(generated(engineLed(A))).state).toBe('done');
    // The read failed.
    expect(transformation(generated(engineLed(A), null)).state).toBe('done');
    // Before 3.0.12: the binding names no path and no context — never made stale by it (design §18).
    expect(transformation(generated({ contractFingerprint: 'f' }, B)).state).toBe('done');
    expect(storedContextDigest({ generationBinding: { contextDigest: A } })).toBeNull();
    // No generated code: nothing to make stale.
    const empty = { ...generated(engineLed(A), B), generatedCode: '' } as Project;
    expect(transformation(empty).state).toBe('empty');
  });

  test('a source change still wins: the sentence names the source, not the context', () => {
    const p = { ...generated(engineLed(A), B), auditMetadata: { inputFingerprint: { sha256: '0'.repeat(64) } } } as unknown as Project;
    expect(staleness(p).sourceChanged).toBe(true);
    expect(transformation(p).detail).toMatch(/^Generated from a previous source/);
  });

  test('after a store: the binding the server wrote is the current context, so the phase reads current at once', () => {
    const before = generated(engineLed(A), A);
    const after = withStoredGeneration(before as unknown as Record<string, unknown>, { generatedCode: before.generatedCode, generationBinding: engineLed(B) }) as unknown as Project;
    expect(after._contextDigest).toBe(B);
    expect(transformation(after).state).toBe('done');
    // A store without a context (a binding from before 3.0.12) leaves the digest as it was.
    expect(withStoredGeneration({ _contextDigest: A }, { generationBinding: { contractFingerprint: 'f' } })._contextDigest).toBe(A);
  });

  test('the loader asks for the current digest only for a generation that names one; the route answers the digest alone', () => {
    const loader = read('lib/project-loader.ts');
    expect(loader).toContain('const context = storedContextDigest(data) ? readCurrentContextDigest(projectId) : null;');
    expect(loader).toContain('/contract?for=context');
    const route = read('app/api/projects/[projectId]/contract/route.ts');
    const block = route.slice(route.indexOf("if (purpose === 'context') {"), route.indexOf("if (!decision.ok || purpose !== 'generation') {"));
    expect(block).toContain('platformContextOf(db, projectId, data, built, decision.isAbapCloud)');
    expect(block).toContain('NextResponse.json({ contextDigest: sha256Hex(platform.stamp.text) })');
    // The POST digests the same block the same way into the binding.
    expect(route).toContain('contextDigest: sha256Hex(platform.stamp.text),');
    // Its own rate budget: a reader browsing the stages never uses up the budget of a generation.
    expect(route).toContain("authorise(req, purpose === 'context' ? 'project-context' : 'project-contract')");
    // The page merges a store through the helper that carries the digest.
    expect(read('app/(app)/project/[projectId]/transformation/page.tsx')).toContain('setProject((prev: any) => prev ? withStoredGeneration(prev, stored) : prev);');
  });
});

test.describe('the Built-on card compares every fact (QA caa5712913ad)', () => {
  const slot = (facts: string[], when = 'need revision 3'): BasisSlot => ({ key: 'rules', title: 'Business rules', when, facts, attention: false });
  const now = (facts: string[], when: string | null = 'need revision 3', state = 'ready') => [{ key: 'rules', state, when, facts: facts.map((text) => ({ text })) }];

  test('a change in a later fact marks the tool stale; the same facts do not', () => {
    expect(basisSlotChanged(slot(['31 objects', '2 gaps']), now(['31 objects', '3 gaps']))).toBe(true);
    expect(basisSlotChanged(slot(['31 objects', '2 gaps']), now(['31 objects', '2 gaps']))).toBe(false);
    // A fact added or gone is a change.
    expect(basisSlotChanged(slot(['31 objects']), now(['31 objects', '1 gap']))).toBe(true);
    expect(basisSlotChanged(slot(['31 objects', '1 gap']), now(['31 objects']))).toBe(true);
    // The date moved.
    expect(basisSlotChanged(slot(['31 objects']), now(['31 objects'], 'need revision 4'))).toBe(true);
  });

  test('compared in the form the record keeps: four facts, each cut as stored — no false stale', () => {
    const long = 'x'.repeat(400);
    const stored = slot(['a', 'b', 'c', `${'x'.repeat(299)}…`]);
    expect(basisSlotChanged(stored, now(['a', 'b', 'c', long, 'a fifth fact the record never keeps']))).toBe(false);
    // Nothing is known yet while the tool loads or was not read.
    expect(basisSlotChanged(slot(['a']), now(['b'], 'x', 'loading'))).toBe(false);
    expect(basisSlotChanged(slot(['a']), now(['b'], 'x', 'unread'))).toBe(false);
    expect(basisSlotChanged(slot(['a']), [])).toBe(false);
  });

  test('the card reads the shared comparison, not the first fact', () => {
    const card = read('components/transformation/BuiltOnCard.tsx');
    expect(card).toContain('return basisSlotChanged(b, now);');
    expect(card).not.toContain("(current.facts[0]?.text ?? '') !== (b.facts[0] ?? '')");
  });
});

/*
 * Owner, 16.10.2026 (dev, SD reference project): after the generation he walked Documentation, Testing,
 * Economics and Delivery, and the code then read "Built for a previous source". The source had not moved.
 * The Cloud Run request log of the walk shows two `commands` POSTs from the Management view 15 minutes after
 * the store (5.5 kB and 5.8 kB answers: `record-decision-draft`, then `confirm-decision`) — the decision was
 * confirmed after the generation. That moves the PLATFORM KNOWLEDGE block, as it should (the block names the
 * decision record); what was wrong is the sentence: it blamed the source.
 */
test.describe('stale code says what moved (owner 16.10.2026)', () => {
  const SD = `REPORT zsd_orders.
PARAMETERS p_min TYPE i.
START-OF-SELECTION.
  SELECT * FROM vbak INTO TABLE @DATA(lt_orders) UP TO 10 ROWS.
  LOOP AT lt_orders INTO DATA(ls_order).
    IF ls_order-auart = 'TA'.
      WRITE: / ls_order-vbeln.
    ENDIF.
  ENDLOOP.
`;
  const digestOf = (project: Record<string, unknown>) => {
    const built = contractOfProject({ legacyCode: SD, s4Deployment: 'private', activeRunId: 'run-1' }, null);
    if (!built.ok) throw new Error('the fixture builds no contract');
    const { stamp } = assembleTransformationContext({
      source: SD, project, answers: { basis: 'source', revision: null, entries: [] },
      evidence: built.evidence, contract: built.contract, isAbapCloud: true, grade: () => 'D',
    });
    return sha256Hex(stamp.text);
  };
  const atGeneration = { legacyCode: SD, activeRunId: 'run-1', targetArchitecture: 'rap', approvedByArchitect: true, solutionDesign: '# Design' };

  test('the later tools write nothing the block reads; the confirmed decision does', () => {
    const built = digestOf(atGeneration);
    // What the store and the later tools write onto the project document — none of it is read by the block.
    const walked = {
      ...atGeneration,
      status: 'transformed',
      generatedCode: '[]',
      testSuite: 'suite',
      generationBinding: engineLed(built),
      artefactStore: { documentation: { rev: 'r1', parts: 1, kind: 'string', bytes: 10 } },
      documentation: '# Docs',
      businessDocumentation: '# Business',
      testCases: [{ id: 'TC-1' }],
      outsideTestResult: { passed: 1 },
      testingClosure: { v: 1, reason: 'not-testable-here' },
      requirementsSpec: { revision: 1 },
      updatedAt: new Date('2026-10-16T03:36:00Z'),
    };
    expect(digestOf(walked)).toBe(built);
    // The decision confirmed in Management after the generation: the block names it, so it moves.
    const confirmed = { ...walked, decision: { decisionId: 'DEC-1', revision: 1, status: 'confirmed', summary: 'Rebuild in-app on RAP.', fingerprint: 'f1', bindings: [] } };
    expect(digestOf(confirmed)).not.toBe(built);
  });

  test('a moved decision is not called a previous source; a moved source still is', () => {
    const p = generated(engineLed(A), B);
    expect(staleness(p)).toMatchObject({ context: true, code: false, sourceChanged: false });
    const words = codeStaleWords(p)!;
    expect(words.title).toBe('Built before the latest decisions');
    for (const text of [words.title, words.reason, words.short]) expect(text).not.toMatch(/previous source/);
    expect(words.reason).toContain('the source is the same');
    // A source change wins and keeps its words.
    const moved = { ...p, auditMetadata: { inputFingerprint: { sha256: '0'.repeat(64) } } } as unknown as Project;
    expect(codeStaleWords(moved)).toMatchObject({ title: 'Built for a previous source', short: 'Generated from a previous source' });
    // Current code: nothing to say.
    expect(codeStaleWords(generated(engineLed(A), A))).toBeNull();
  });

  test('the Transformation page and Delivery say it through codeStaleWords', () => {
    const page = read('app/(app)/project/[projectId]/transformation/page.tsx');
    expect(page).toContain('codeStaleWords(project)');
    expect(page).not.toContain('The code shown here was generated from ${previousBasis(project)}');
    expect(page).toContain('title={blockers.length === 0 && codeWords ? codeWords.title : `Built for ${previousBasis(project)}`}');
    const delivery = read('app/(app)/project/[projectId]/delivery/page.tsx');
    expect(delivery).toContain('codeStaleWords(project)?.short');
  });
});
