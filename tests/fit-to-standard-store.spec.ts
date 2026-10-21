/**
 * Roadmap 3.0.20, step F3 — storing and confirming a fit-to-standard design
 * (`docs/design/fit-to-standard-concept.md` §4.1, §4.4, §8 F3).
 *
 * Acceptance: revision 1 is the engine's and never changes (`create()`, a new
 * revision for every write); a confirmation records account and server time;
 * a stale run refuses with 409; confirmed drops reach the Retire bucket; the
 * subcollection has no rules match (asserted in firestore-rules-readers.spec.ts,
 * which needs the emulator).
 *
 * Server-free: the pure store and the route's source.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  applyFitChoices,
  checkFitChoices,
  confirmedFitDesign,
  droppedObjectsOf,
  fitConditions,
  needChoicesOf,
  summaryOf,
  type FitToStandardRevision,
} from '../lib/fit-to-standard-store';
import { countEntries, type FitEntry } from '../lib/fit-to-standard-design';
import { resolvePublicCloudFit } from '../lib/abap/public-cloud-fit-resolver';

const entry = (over: Partial<FitEntry>): FitEntry => ({
  elementId: 'n',
  label: 'X',
  plainLabel: null,
  kind: 'task',
  anchor: { lineStart: 10, lineEnd: 10 },
  anchorBasis: 'code',
  comparability: 'business-comparable',
  disposition: 'gap-open',
  standardRef: null,
  evidenceLevel: 'E0',
  provenance: 'reconstructed',
  why: '',
  gateClass: null,
  note: null,
  ...over,
});

const ENTRIES: FitEntry[] = [
  entry({ elementId: 'gone', disposition: 'given-up', anchor: { lineStart: 5, lineEnd: 5 } }),
  entry({ elementId: 'cand', disposition: 'covered', evidenceLevel: 'E1', standardRef: { kind: 'api', id: 'API_SALES_ORDER_SRV', title: null, check: 'catalog', source: 'catalog' } }),
  entry({ elementId: 'open', disposition: 'gap-open', anchor: { lineStart: 20, lineEnd: 22 }, plainLabel: 'Check the price' }),
  entry({ elementId: 'tech', disposition: 'goes-with-program', comparability: 'technical' }),
];

test('choices: only business steps, only account-settable dispositions; an organisational gap says what changes', () => {
  expect(checkFitChoices(undefined, ENTRIES)).toEqual({ ok: true, choices: [] });
  expect(checkFitChoices([{ elementId: 'nope', disposition: 'covered' }], ENTRIES)).toMatchObject({ ok: false, code: 'unknown-element' });
  expect(checkFitChoices([{ elementId: 'tech', disposition: 'covered' }], ENTRIES)).toMatchObject({ ok: false, code: 'not-settable' });
  expect(checkFitChoices([{ elementId: 'open', disposition: 'goes-with-program' }], ENTRIES)).toMatchObject({ ok: false, code: 'not-settable' });
  expect(checkFitChoices([{ elementId: 'open', disposition: 'gap-organisational' }], ENTRIES)).toMatchObject({ ok: false, code: 'note-required' });
  expect(checkFitChoices([{ elementId: 'open', disposition: 'invented' }], ENTRIES)).toMatchObject({ ok: false, code: 'bad-request' });
  const ok = checkFitChoices([{ elementId: 'open', disposition: 'gap-organisational', note: ' Approval by the buyer. ' }], ENTRIES);
  expect(ok).toEqual({ ok: true, choices: [{ elementId: 'open', disposition: 'gap-organisational', note: 'Approval by the buyer.' }] });
});

test('a confirmed "covered" is the account\'s acceptance — E4, Confirmed; untouched entries keep the engine\'s reading', () => {
  const out = applyFitChoices(ENTRIES, [{ elementId: 'cand', disposition: 'covered' }]);
  expect(out.find((e) => e.elementId === 'cand')).toMatchObject({ evidenceLevel: 'E4', provenance: 'confirmed', standardRef: { id: 'API_SALES_ORDER_SRV' } });
  expect(out.find((e) => e.elementId === 'open')).toEqual(ENTRIES[2]);
  // Moving a candidate elsewhere drops its reference.
  expect(applyFitChoices(ENTRIES, [{ elementId: 'cand', disposition: 'given-up' }]).find((e) => e.elementId === 'cand')!.standardRef).toBeNull();
});

test('an open gap is a derived condition; key-user and organisational gaps are stated ones', () => {
  const conditions = fitConditions(applyFitChoices(ENTRIES, []));
  expect(conditions).toEqual([
    { elementId: 'open', basis: 'derived', disposition: 'gap-open', text: 'Open gap: "Check the price" (L20–L22) — nothing covering it has been named.', anchor: { lineStart: 20, lineEnd: 22 } },
  ]);
  const stated = fitConditions(applyFitChoices(ENTRIES, [{ elementId: 'open', disposition: 'gap-organisational', note: 'The buyer approves.' }]));
  expect(stated[0]).toMatchObject({ basis: 'stated', disposition: 'gap-organisational' });
  expect(stated[0].text).toContain('The buyer approves.');
});

test('the need revision: given up → drop, carried → change, open → clarify, technical → nothing', () => {
  const choices = needChoicesOf(ENTRIES, new Map([
    ['gone', ['Activity_1']],
    ['cand', ['Activity_2']],
    ['open', ['Gateway_3']],
    ['tech', ['Task_4']],
  ]));
  expect(choices.map((c) => [c.subject, c.state])).toEqual([
    ['Activity_1', 'drop'],
    ['Activity_2', 'change'],
    ['Gateway_3', 'clarify'],
  ]);
  // Drop and change need a note in 3.5 — every one carries one.
  expect(choices.every((c) => c.note.length > 10)).toBe(true);
  expect(choices[1].note).toContain('API_SALES_ORDER_SRV');
});

test('confirmed drops reach the Retire bucket — and only objects every use of which is given up', () => {
  const nodes = [
    { id: 'gone', anchor: { lineStart: 5, lineEnd: 5, secondary: { lineStart: 40, lineEnd: 50, reason: 'routine-definition' } } },
    { id: 'open', anchor: { lineStart: 20, lineEnd: 22 } },
  ];
  const findings = [
    { objectName: 'ZLOG', lineStart: 45 },
    { objectName: 'VBAK', lineStart: 44 },
    { objectName: 'VBAK', lineStart: 21 },
  ];
  const drops = droppedObjectsOf(ENTRIES, nodes, findings, { revision: 3, confirmedAt: '2026-10-21T10:00:00.000Z', accountName: 'Owner' });
  expect(Object.keys(drops)).toEqual(['ZLOG']);
  const fit = resolvePublicCloudFit(
    { findings: [{ objectName: 'ZLOG', kind: 'custom-table-write' }], usageReport: null, targetPlatform: 'public', dropDecisions: drops },
    { gradeObjectUse: () => ({ grade: 'D', provenance: 'heuristic' } as never), hasNoPath: () => false },
  );
  expect(fit.assignments[0]).toMatchObject({ objectName: 'ZLOG', bucket: 'retire', rule: 'retire-drop' });
});

const REV: FitToStandardRevision = {
  formatVersion: 1,
  revision: 2,
  kind: 'confirmation',
  runId: 'run-1',
  sourceSha256: 'sha-1',
  edition: 'public',
  engineVersion: 'v3.0.19',
  gateClasses: ['A'],
  againstGate: null,
  entries: ENTRIES,
  counts: countEntries(ENTRIES),
  createdBy: { uid: 'u1', name: 'Owner' },
  createdAt: '2026-10-21T10:00:00.000Z',
};

test('the summary is current only on its own run and source; an engine revision is not a confirmation', () => {
  const summary = summaryOf(REV, 4);
  expect(summary).toMatchObject({ confirmed: true, confirmedBy: 'Owner', confirmedAt: '2026-10-21T10:00:00.000Z', needRevision: 4 });
  const project = { fitToStandard: summary, activeRunId: 'run-1', auditMetadata: { inputFingerprint: { sha256: 'sha-1' } } };
  expect(confirmedFitDesign(project)).toEqual(summary);
  expect(confirmedFitDesign({ ...project, activeRunId: 'run-2' })).toBeNull();
  expect(confirmedFitDesign({ ...project, auditMetadata: { inputFingerprint: { sha256: 'sha-2' } } })).toBeNull();
  expect(confirmedFitDesign({ ...project, fitToStandard: summaryOf({ ...REV, kind: 'engine' }, null) })).toBeNull();
});

test('route source: immutable revisions, server time and account, 409 on a run that is not current, owner-only writes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'projects', '[projectId]', 'fit-to-standard', 'route.ts'), 'utf8');
  expect(src).toContain('tx.create(revisions.doc(String(nextRevision)), record)');
  expect(src).not.toMatch(/\.set\(record/);
  expect(src).toMatch(/'run-not-current',\s+409/);
  expect(src).toContain("'no-current-design', 409");
  expect(src).toContain('const now = new Date().toISOString();');
  expect(src).toContain('createdBy: account');
  expect(src).toContain('project.userId !== decodedToken.uid');
  // The engine of the signed run, never the current one.
  expect(src).toContain('engineVersion: engineVersionOfProject(gate.project)');
  const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  expect(rules).not.toContain('fit_to_standard');
  expect(rules).not.toContain('fitToStandard');
});
