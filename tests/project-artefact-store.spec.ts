import { test, expect } from '@playwright/test';
import fs from 'fs';
import { initializeApp as initAdmin, getApps as adminApps } from 'firebase-admin/app';
import { getFirestore as adminFirestore, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-config.json';
import { FIRESTORE_DB_ID } from '../lib/constants';
import {
  ARTEFACT_COLLECTION,
  ARTEFACT_INDEX_FIELD,
  STORED_ARTEFACT_FIELDS,
  artefactIndexKey,
  artefactIndexOf,
  joinArtefact,
  splitArtefact,
} from '../lib/project-artefacts';
import {
  ArtefactReadError,
  planArtefactWrite,
  readStoredArtefacts,
  withStoredArtefacts,
  writeArtefactParts,
} from '../lib/project-artefact-store';
import { storeBusinessLayer, storeDocumentation, storeTestSuite, textDigest } from '../lib/project-artefact-writes';
import {
  checkProjectWrite,
  estimateDocumentSize,
  projectTooLargeMessage,
  PROJECT_DOCUMENT_BUDGET_BYTES,
  stringSize,
  valueSize,
} from '../lib/firestore-doc-size';
import { artefactDigest, buildSourceChangeRecord, sha256Hex, TRACKED_ARTEFACTS } from '../lib/artefact-digest';
import { testRunSubject } from '../lib/test-receipt';
import { generationRevision, generationStateOf } from '../lib/generation-revision';
import { attestationsOf, buildAuditPackContents } from '../lib/audit-pack-build';
import { buildBpmnExportFromSource } from '../lib/bpmn/export';
import { buildProcessMapModel } from '../lib/process-map';
import { applyNaming, namingContextOf } from '../lib/process-naming';
import { buildProcessDocumentation } from '../lib/process-documentation-build';

/**
 * Roadmap 3.0.14, item 9 — large programs fit.
 *
 * One project was one Firestore document, and the SD reference program no
 * longer fit: saving its business documentation would have made the project
 * 1,229 KB (business documentation 435 KB, package 304 KB, documentation
 * 287 KB) against a budget of 1,008 KB. The four large artefacts now live in
 * documents of their own beside the project, written and read by the server.
 *
 *   1. the split and the join, without Firestore;
 *   2. the write plan: what the project document gets, what the parts get;
 *   3. against the Firestore emulator, Admin SDK, no server: a 1.2 MB set is
 *      stored and read back; an old inline project loads as before; digests,
 *      the test-run subject, the generation token and the audit pack are the
 *      same wherever the artefacts are stored; the compare-and-swaps hold
 *      across the split; deleting a project deletes its parts;
 *   4. source guards: every reader and writer goes through the store, and no
 *      browser reads or writes the collection.
 */

/* ------------------------------------------------------------------ data */

/** A text of at least `bytes` UTF-8 bytes with multibyte characters in it, so a cut by characters would be wrong. */
function textOf(bytes: number, seed: string): string {
  const unit = `${seed} — Größe über die Grenze 😀 `;
  return unit.repeat(Math.ceil(bytes / new TextEncoder().encode(unit).byteLength));
}

/**
 * The SD set the roadmap measured, near enough: 435 + 304 + 287 + 204 KB.
 * `scale` shrinks it for a comparison with an inline project, which has to fit
 * one document to exist at all.
 */
function sdArtefacts(scale = 1) {
  const businessDocumentation = textOf(435 * 1024 * scale, 'SOP');
  const files = Array.from({ length: 40 }, (_, i) => ({ path: `src/zcl_sd_${i}.clas.abap`, content: textOf(7_600 * scale, `CLASS zcl_sd_${i}`) }));
  const generatedCode = JSON.stringify(files);
  const documentation = textOf(287 * 1024 * scale, 'Process');
  const testCases = Array.from({ length: 90 }, (_, i) => ({
    id: `TC_${String(i + 1).padStart(3, '0')}`,
    name: `Scenario ${i + 1}`,
    category: 'Unit',
    description: textOf(2_200 * scale, `Given order ${i}`),
    priority: 'High',
    status: i % 3 === 0 ? 'Passed' : 'Pending',
  }));
  return { businessDocumentation, generatedCode, documentation, testCases };
}

/* ---------------------------------------------------- 1. split and join */

test.describe('the split and the join', () => {
  test('a string larger than a document comes back whole, every part within its bound, never cut inside a character', () => {
    const value = textOf(2_500_000, 'Ä😀');
    const limit = 600_000;
    const split = splitArtefact('documentation', value, limit);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.parts.length).toBeGreaterThan(1);
    for (const part of split.parts) {
      expect(stringSize(part as string) - 1).toBeLessThanOrEqual(limit);
      // A lone surrogate at either end would be a cut character.
      const p = part as string;
      expect(/[\uD800-\uDBFF]$/.test(p)).toBe(false);
      expect(/^[\uDC00-\uDFFF]/.test(p)).toBe(false);
    }
    const entry = { rev: 'r1', parts: split.parts.length, kind: split.kind, bytes: split.bytes };
    const stored = split.parts.map((value, part) => ({ field: 'documentation', rev: 'r1', part, parts: split.parts.length, kind: split.kind, value }));
    const joined = joinArtefact('documentation', entry, stored);
    expect(joined).toEqual({ ok: true, value });
  });

  test('a list is cut between entries, and an entry larger than a part is refused by name', () => {
    const cases = Array.from({ length: 30 }, (_, i) => ({ id: `TC_${i}`, text: 'x'.repeat(50_000) }));
    const split = splitArtefact('testCases', cases, 400_000);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect((split.parts as unknown[][]).flat(1)).toEqual(cases);
    for (const part of split.parts) expect(valueSize(part)).toBeLessThanOrEqual(400_000);

    const tooBig = splitArtefact('testCases', [{ id: 'huge', text: 'x'.repeat(500_000) }], 400_000);
    expect(tooBig).toMatchObject({ ok: false, field: 'testCases' });
  });

  test('a part from another write, or a missing part, is a failed read — never a shorter artefact', () => {
    const entry = { rev: 'r2', parts: 2, kind: 'string' as const, bytes: 10 };
    const good = [
      { field: 'generatedCode', rev: 'r2', part: 0, parts: 2, kind: 'string', value: 'ab' },
      { field: 'generatedCode', rev: 'r2', part: 1, parts: 2, kind: 'string', value: 'cd' },
    ];
    expect(joinArtefact('generatedCode', entry, good)).toEqual({ ok: true, value: 'abcd' });
    expect(joinArtefact('generatedCode', entry, [good[0], { ...good[1], rev: 'r1' }]).ok).toBe(false);
    expect(joinArtefact('generatedCode', entry, [good[0]]).ok).toBe(false);
    expect(joinArtefact('generatedCode', entry, [good[1], good[0]]).ok).toBe(false);
  });

  test('the index reads only well-formed entries of the four fields, and its key changes with every write', () => {
    const project = {
      [ARTEFACT_INDEX_FIELD]: {
        generatedCode: { rev: 'a', parts: 1, kind: 'string', bytes: 3 },
        documentation: { rev: '', parts: 1, kind: 'string' },
        testCases: { rev: 'b', parts: 0, kind: 'list' },
        legacyCode: { rev: 'c', parts: 1, kind: 'string' },
      },
    };
    expect(Object.keys(artefactIndexOf(project))).toEqual(['generatedCode']);
    expect(artefactIndexOf({})).toEqual({});
    const before = artefactIndexKey(project);
    const after = artefactIndexKey({ [ARTEFACT_INDEX_FIELD]: { generatedCode: { rev: 'a2', parts: 1, kind: 'string' } } });
    expect(before).not.toBe(after);
  });
});

/* ------------------------------------------------------ 2. the write plan */

const db = (): Firestore => {
  const app = adminApps()[0] ?? initAdmin({ projectId: firebaseConfig.projectId });
  return adminFirestore(app, FIRESTORE_DB_ID);
};

test.describe('the write plan', () => {
  test('a non-empty artefact leaves the project document; the index names its parts; an empty one stays inline', async () => {
    const ref = db().collection('projects').doc('plan-only');
    const planned = await planArtefactWrite(ref, { userId: 'u' }, { generatedCode: 'abc', businessDocumentation: '', status: 'transformed' }, 'merge');
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const { projectFields, parts, deletes } = planned.plan;
    expect(projectFields.status).toBe('transformed');
    expect((projectFields.generatedCode as { isEqual?: unknown }).isEqual).toBeDefined(); // a delete sentinel
    expect(projectFields.businessDocumentation).toBe('');
    const index = projectFields[ARTEFACT_INDEX_FIELD] as Record<string, { parts: number; rev: string }>;
    expect(index.generatedCode.parts).toBe(1);
    expect(parts.map((p) => p.ref.path)).toEqual([`projects/plan-only/${ARTEFACT_COLLECTION}/generatedCode-0`]);
    expect(parts[0].data).toMatchObject({ field: 'generatedCode', rev: index.generatedCode.rev, part: 0, parts: 1, value: 'abc' });
    expect(deletes).toEqual([]);
  });

  test('a shorter rewrite deletes the parts it no longer has; clearing a field deletes them all', async () => {
    const ref = db().collection('projects').doc('plan-only');
    const current = { [ARTEFACT_INDEX_FIELD]: { documentation: { rev: 'old', parts: 3, kind: 'string', bytes: 9 } } };
    const shorter = await planArtefactWrite(ref, current, { documentation: 'short' }, 'update');
    if (!shorter.ok) throw new Error('refused');
    expect(shorter.plan.deletes.map((r) => r.id)).toEqual(['documentation-1', 'documentation-2']);
    expect(Object.keys(shorter.plan.projectFields)).toContain(`${ARTEFACT_INDEX_FIELD}.documentation`);
    const cleared = await planArtefactWrite(ref, current, { documentation: '' }, 'update');
    if (!cleared.ok) throw new Error('refused');
    expect(cleared.plan.parts).toEqual([]);
    expect(cleared.plan.deletes.map((r) => r.id)).toEqual(['documentation-0', 'documentation-1', 'documentation-2']);
    expect(cleared.plan.projectFields.documentation).toBe('');
  });

  test('what stays inline is still held to the project budget, and an artefact too large for its parts is refused honestly', async () => {
    const ref = db().collection('projects').doc('plan-only');
    const full = { analysis: 'x'.repeat(PROJECT_DOCUMENT_BUDGET_BYTES - 2_000) };
    const inline = await planArtefactWrite(ref, full, { generatedCode: 'small', testSuite: { code: 'y'.repeat(10_000) } }, 'merge');
    expect(inline.ok).toBe(false);
    if (inline.ok) return;
    expect(inline.check.scope).toBeUndefined();
    expect(projectTooLargeMessage(inline.check, 'this package')).toContain('one project can hold');

    const huge = await planArtefactWrite(ref, {}, { testCases: [{ id: 'x', text: 'z'.repeat(1_100_000) }] }, 'merge');
    expect(huge.ok).toBe(false);
    if (huge.ok) return;
    expect(huge.check.scope).toBe('artefact');
    const sentence = projectTooLargeMessage(huge.check, 'this test suite');
    expect(sentence).toContain('one stored artefact can hold');
    expect(sentence).toContain('Nothing was saved');
    expect(sentence).not.toContain('one project can hold');
  });
});

/* ------------------------------------------------ 3. against the emulator */

const stamp = () => `artefacts-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function seed(data: Record<string, unknown>): Promise<DocumentReference> {
  const ref = db().collection('projects').doc(stamp());
  await ref.set(data);
  return ref;
}

/** What a writer does: plan against the stored document, write both in one transaction. */
async function writeSplit(ref: DocumentReference, fields: Record<string, unknown>, mode: 'merge' | 'update' = 'merge') {
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const planned = await planArtefactWrite(ref, snap.data(), fields, mode);
    if (!planned.ok) return planned;
    if (mode === 'merge') tx.set(ref, planned.plan.projectFields, { merge: true });
    else tx.update(ref, planned.plan.projectFields);
    writeArtefactParts(tx, planned.plan);
    return planned;
  });
}

async function raw(ref: DocumentReference) {
  return ((await ref.get()).data() || {}) as Record<string, unknown>;
}

async function partIds(ref: DocumentReference) {
  return (await ref.collection(ARTEFACT_COLLECTION).listDocuments()).map((d) => d.id).sort();
}

const BASE = {
  userId: 'owner',
  name: 'SD reference',
  status: 'analyzed',
  activeRunId: 'run-1',
  legacyCode: 'REPORT z_sd.\n',
  analysis: 'Analysis. '.repeat(20_000),
};

test.describe('the store, against the Firestore emulator', () => {
  test.describe.configure({ mode: 'serial' });

  test('the SD set (1.2 MB) does not fit one document, and stored beside it, it reads back whole', async () => {
    test.setTimeout(60_000);
    const sd = sdArtefacts();
    const total = STORED_ARTEFACT_FIELDS.reduce((sum, f) => sum + valueSize(sd[f]), 0);
    expect(total).toBeGreaterThan(1_200_000);
    const ref = await seed({ ...BASE });

    // Without the split: refused, as the SD program was on 15.10.2026.
    expect(checkProjectWrite(await raw(ref), sd, ref.path, 'merge').ok).toBe(false);

    const written = await writeSplit(ref, { ...sd, status: 'documented' });
    expect(written.ok).toBe(true);
    const stored = await raw(ref);
    for (const f of STORED_ARTEFACT_FIELDS) expect(stored[f], `${f} is no longer inline`).toBeUndefined();
    expect(estimateDocumentSize(stored, ref.path)).toBeLessThan(PROJECT_DOCUMENT_BUDGET_BYTES);
    expect(stored.status).toBe('documented');

    const read = await withStoredArtefacts(db(), ref, stored);
    for (const f of STORED_ARTEFACT_FIELDS) expect(read[f], f).toEqual(sd[f]);
    // The way GET /api/projects/{id}/artefacts reads them: index and parts in one read-only transaction.
    const viaRoute = await db().runTransaction(
      async (tx) => readStoredArtefacts(tx, ref, ((await tx.get(ref)).data() || {}) as Record<string, unknown>),
      { readOnly: true },
    );
    expect(viaRoute).toEqual(sd);
    // Every part document is itself within the budget.
    for (const doc of (await ref.collection(ARTEFACT_COLLECTION).get()).docs) {
      expect(estimateDocumentSize(doc.data(), doc.ref.path)).toBeLessThanOrEqual(PROJECT_DOCUMENT_BUDGET_BYTES);
    }
  });

  test('a project stored before 3.0.14, with its artefacts inline, loads exactly as before and is not read twice', async () => {
    const sd = { generatedCode: '[{"path":"a.ts","content":"x"}]', documentation: '{"kind":"old"}', businessDocumentation: '{}', testCases: [{ id: 'TC_1' }] };
    const ref = await seed({ ...BASE, ...sd });
    const stored = await raw(ref);
    let reads = 0;
    const counting = { getAll: async (...refs: DocumentReference[]) => { reads += refs.length; return db().getAll(...refs); } };
    const read = await withStoredArtefacts(counting, ref, stored);
    expect(read).toBe(stored);
    expect(reads).toBe(0);
  });

  test('an inline value next to an index entry is the newer one, and wins', async () => {
    const ref = await seed({ ...BASE });
    await writeSplit(ref, { documentation: 'from the server' });
    // A tab still running the bundle from before the move writes inline.
    await ref.update({ documentation: 'from an old tab' });
    const read = await withStoredArtefacts(db(), ref, await raw(ref));
    expect(read.documentation).toBe('from an old tab');
    // And the next server write replaces both.
    await writeSplit(ref, { documentation: 'rewritten' });
    const after = await raw(ref);
    expect(after.documentation).toBeUndefined();
    expect((await withStoredArtefacts(db(), ref, after)).documentation).toBe('rewritten');
  });

  test('a part from another write is refused as unreadable, not read as a shorter artefact', async () => {
    const ref = await seed({ ...BASE });
    await writeSplit(ref, { generatedCode: 'abc' });
    await ref.collection(ARTEFACT_COLLECTION).doc('generatedCode-0').update({ rev: 'someone-else' });
    await expect(readStoredArtefacts(db(), ref, await raw(ref))).rejects.toBeInstanceOf(ArtefactReadError);
  });

  test('digests, the test-run subject, the generation token and the audit pack are the same, inline or split', async () => {
    // A third of the SD set: the inline twin has to fit one document.
    const sd = sdArtefacts(0.3);
    const inlineRef = await seed({ ...BASE, ...sd, testSuite: { code: 'suite' } });
    const splitRef = await seed({ ...BASE, testSuite: { code: 'suite' } });
    await writeSplit(splitRef, sd);
    const inline = await withStoredArtefacts(db(), inlineRef, await raw(inlineRef));
    const split = await withStoredArtefacts(db(), splitRef, await raw(splitRef));

    for (const key of TRACKED_ARTEFACTS) expect(artefactDigest(key, split[key]), key).toBe(artefactDigest(key, inline[key]));
    expect(testRunSubject(split)).toEqual(testRunSubject(inline));
    const at = '2026-10-15T00:00:00.000Z';
    expect(buildSourceChangeRecord(split, 'a'.repeat(64), 'run-2', at)).toEqual(buildSourceChangeRecord(inline, 'a'.repeat(64), 'run-2', at));
    const run = { analysis: 'narrative' };
    expect(generationRevision(generationStateOf(split, run), 'fp')).toBe(generationRevision(generationStateOf(inline, run), 'fp'));

    // The signed files read the run and nothing else; the attested file reads
    // the project as its pages read it — identical either way.
    const signedRun = { runId: 'run-1', projectId: 'p', userId: 'owner', inputFingerprint: { sha256: 'a'.repeat(64) }, worklist: [] };
    // The generators stamp the time of the build; two builds a millisecond
    // apart differ in that stamp and in nothing else.
    const pack = (project: Record<string, unknown>) =>
      JSON.stringify(
        buildAuditPackContents({ projectId: 'p', runId: 'run-1', run: signedRun, auditMetadata: undefined, attested: attestationsOf(project) }),
      ).replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g, '<time>');
    expect(attestationsOf(split)).toEqual(attestationsOf(inline));
    expect(pack(split)).toBe(pack(inline));
  });

  test('the generation store sees an artefact write: the project document moves with every write to the parts', async () => {
    const ref = await seed({ ...BASE });
    await writeSplit(ref, { generatedCode: 'v1' });
    const readAt = (await ref.get()).updateTime!;
    // Another tab stores test cases — only the parts and the index change.
    await writeSplit(ref, { testCases: [{ id: 'TC_1' }] }, 'update');
    // The contract route's precondition, verbatim: written only if the project
    // was not written since it was read.
    const outcome = await db().runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (!fresh.exists || !fresh.updateTime || !fresh.updateTime.isEqual(readAt)) return 'moved' as const;
      const planned = await planArtefactWrite(ref, fresh.data(), { generatedCode: 'v2' }, 'merge');
      if (!planned.ok) return 'refused' as const;
      tx.set(ref, planned.plan.projectFields, { merge: true });
      writeArtefactParts(tx, planned.plan);
      return 'written' as const;
    });
    expect(outcome).toBe('moved');
    expect((await withStoredArtefacts(db(), ref, await raw(ref))).generatedCode).toBe('v1');
  });

  test('the documentation writes keep their compare-and-swap across the split', async () => {
    const SOURCE = 'REPORT z_style.\nSELECT * FROM vbak INTO TABLE @DATA(lt).\n';
    const bpmn = buildBpmnExportFromSource(SOURCE, { processName: 'z_style.abap', sourceFileName: 'z_style.abap' });
    const map = buildProcessMapModel({ bpmn, named: applyNaming(namingContextOf(SOURCE), null), fileName: 'z_style.abap' });
    const documentation = JSON.stringify(buildProcessDocumentation({ source: SOURCE, map }));
    const pkg = JSON.stringify([{ path: 'srv/a.ts', content: 'x' }, { path: 'docs/process-documentation.md', content: 'old' }]);
    const ref = await seed({ ...BASE, legacyCode: SOURCE, generatedCode: pkg, businessDocumentation: 'an old layer' });
    const projectId = ref.id;

    // A description read from another source is refused, and nothing moves.
    const stale = await storeDocumentation(db(), { projectId, uid: 'owner', body: { documentation, fromRunId: 'run-1', sourceSha256: sha256Hex('REPORT other.') } });
    expect(stale).toMatchObject({ status: 409, code: 'analysis-moved' });
    expect((await raw(ref)).businessDocumentation).toBe('an old layer');
    // Built from the same source under a run the project no longer stands on: refused the same way (QA ad17306daa6d).
    const otherRun = await storeDocumentation(db(), { projectId, uid: 'owner', body: { documentation, fromRunId: 'run-0', sourceSha256: sha256Hex(SOURCE) } });
    expect(otherRun).toMatchObject({ status: 409, code: 'analysis-moved' });
    const unmoved = await withStoredArtefacts(db(), ref, await raw(ref));
    expect([unmoved.documentation, unmoved.status, unmoved.businessDocumentation]).toEqual([undefined, 'analyzed', 'an old layer']);
    // Not the owner: the stranger's answer.
    expect(await storeDocumentation(db(), { projectId, uid: 'stranger', body: { documentation, fromRunId: 'run-1', sourceSha256: sha256Hex(SOURCE) } })).toMatchObject({ status: 404 });
    // Not an engine document: refused before anything is read.
    expect(await storeDocumentation(db(), { projectId, uid: 'owner', body: { documentation: '{"x":1}', fromRunId: 'run-1', sourceSha256: sha256Hex(SOURCE) } })).toMatchObject({ status: 400 });

    const stored = await storeDocumentation(db(), { projectId, uid: 'owner', body: { documentation, fromRunId: 'run-1', sourceSha256: sha256Hex(SOURCE) } });
    expect(stored.status).toBe(200);
    let project = await withStoredArtefacts(db(), ref, await raw(ref));
    expect(project.documentation).toBe(documentation);
    expect(project.status).toBe('documented');
    expect(project.businessDocumentation).toBe('');
    // The package lost the file an earlier build merged into it, and nothing else.
    expect(JSON.parse(String(project.generatedCode))).toEqual([{ path: 'srv/a.ts', content: 'x' }]);

    // The business layer: written from a description that is no longer the one on record → refused.
    const layer = JSON.stringify({ roles: [], steps: [] });
    const moved = await storeBusinessLayer(db(), { projectId, uid: 'owner', body: { businessDocumentation: layer, fromRunId: 'run-1', documentationSha256: sha256Hex('another'), replacingSha256: null } });
    expect(moved).toMatchObject({ status: 409, code: 'documentation-moved' });
    const first = await storeBusinessLayer(db(), { projectId, uid: 'owner', body: { businessDocumentation: layer, fromRunId: 'run-1', documentationSha256: textDigest(documentation), replacingSha256: null } });
    expect(first).toMatchObject({ status: 200, kept: null });
    // A second tab that did not ask to replace it keeps the stored one.
    const second = await storeBusinessLayer(db(), { projectId, uid: 'owner', body: { businessDocumentation: '{"other":1}', fromRunId: 'run-1', documentationSha256: textDigest(documentation), replacingSha256: null } });
    expect(second).toMatchObject({ status: 200, kept: layer });
    project = await withStoredArtefacts(db(), ref, await raw(ref));
    expect(project.businessDocumentation).toBe(layer);
    expect((await raw(ref)).businessDocumentation, 'the layer is stored beside the project').toBeUndefined();
  });

  test('the test suite is stored beside the project, held to the rules the browser write was held to', async () => {
    const ref = await seed({ ...BASE });
    const cases = [{ id: 'TC_1', name: 'n', status: 'Pending' }];
    const body = { testCases: cases, testSuite: { code: 'c', extra: 'dropped' }, coverageEstimate: { percentage: '80%' }, manualTestingRequirements: [] };
    const out = await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body });
    expect(out.status).toBe(200);
    const project = await withStoredArtefacts(db(), ref, await raw(ref));
    expect(project.testCases).toEqual(cases);
    expect(project.testSuite).toEqual({ code: 'c' });
    expect((project.coverageEstimate as { percentage: number }).percentage).toBe(80);
    expect(project.status).toBe('testing');
    // A project with no analysis: refused, as the rules refused the status.
    const fresh = await seed({ ...BASE, status: 'uploaded' });
    expect(await storeTestSuite(db(), { projectId: fresh.id, uid: 'owner', body })).toMatchObject({ status: 409 });
    expect(await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body: { ...body, testCases: [] } })).toMatchObject({ status: 400 });
    expect(await storeTestSuite(db(), { projectId: ref.id, uid: 'owner', body: { ...body, testCases: Array.from({ length: 100 }, (_, i) => ({ id: `T${i}` })) } })).toMatchObject({ status: 400 });
  });

  test('deleting a project deletes its artefact documents', async () => {
    const ref = await seed({ ...BASE });
    await writeSplit(ref, sdArtefacts());
    expect((await partIds(ref)).length).toBeGreaterThanOrEqual(4);
    // What DELETE /api/projects/{id} and account erasure call.
    await db().recursiveDelete(ref);
    expect((await ref.get()).exists).toBe(false);
    expect(await partIds(ref)).toEqual([]);
  });
});

/* ------------------------------------------------------- 4. source guards */

const read = (p: string) => fs.readFileSync(p, 'utf8');

test.describe('every reader and writer goes through the store', () => {
  test('no browser touches the collection: no rule opens it, and the stages no longer write the four fields to Firestore', () => {
    const rules = read('firestore.rules');
    expect(rules).not.toMatch(/match \/projects\/\{projectId\}\/artefacts/);
    const docs = read('app/(app)/project/[projectId]/documentation/page.tsx');
    expect(docs).not.toContain('runTransaction(');
    expect(docs).toContain("action: 'documentation'");
    expect(docs).toContain("action: 'business-layer'");
    const tests = read('hooks/useTestGeneration.ts');
    expect(tests).not.toContain('updateDoc(');
    expect(tests).toContain("action: 'test-suite'");
  });

  test('the browser loads the artefacts wherever it reads a project document', () => {
    expect(read('lib/project-loader.ts')).toMatch(/withStoredArtefacts\(projectId, stored\)/);
    expect(read('hooks/useTestExecution.ts')).toContain('withStoredArtefacts(projectId');
    expect(read('app/(app)/dashboard/page.tsx')).toContain('withStoredArtefactRows(');
    expect(read('components/workspace/WorkspaceListReport.tsx').match(/withStoredArtefactRows\(/g)?.length).toBe(2);
  });

  test('every server route that reads or writes one of the four fields goes through the store', () => {
    const readers = [
      'app/api/projects/[projectId]/contract/route.ts',
      'app/api/transformation/lease/route.ts',
      'app/api/run-tests/route.ts',
      'app/api/projects/[projectId]/commands/route.ts',
      'app/api/projects/[projectId]/test-results/route.ts',
      'app/api/projects/[projectId]/raci/route.ts',
      'app/api/runs/create/route.ts',
      'app/api/audit-pack/create/route.ts',
      'lib/repair-draft-store.ts',
    ];
    for (const file of readers) expect(read(file), file).toContain('withStoredArtefacts(');
    const writers = ['app/api/projects/[projectId]/contract/route.ts', 'app/api/run-tests/route.ts', 'lib/repair-draft-store.ts', 'lib/project-artefact-writes.ts'];
    for (const file of writers) {
      const src = read(file);
      expect(src, file).toContain('planArtefactWrite(');
      expect(src, file).toContain('writeArtefactParts(');
    }
  });

  test('deleting a project and erasing an account remove the subcollections', () => {
    expect(read('app/api/projects/[projectId]/route.ts')).toContain('recursiveDelete(');
    expect(read('lib/firebase-admin.ts')).toContain('await db.recursiveDelete(projectDoc.ref)');
  });
});
