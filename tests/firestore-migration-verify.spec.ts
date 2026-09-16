import { test, expect } from '@playwright/test';
import { canonical, docHash, runIntegrity } from '../scripts/firestore-inventory';
import { compareInventories, type Inventory } from '../scripts/firestore-verify-migration';
import { computeRunHash, signRunHash } from '../lib/run-signature';

/**
 * The sentence this pair of scripts exists to be allowed to print: "Every user,
 * project and signed run survived intact."
 *
 * It used to be printed after comparing a project's id, owner and name, a user's
 * email, and a run's two stored integrity fields. A target that had dropped
 * `legacyCode`, the analysis, the generated code, the documentation or the audit
 * metadata compared equal, the script exited zero, and the cutover was cleared
 * (QA review of 33471220d6e9, finding 5a660ef009dc).
 *
 * So: the manifest carries a canonical hash of the whole document, the
 * comparison is over that hash, and a run additionally has to rehash to the
 * `runHash` it carries — copying that field across says nothing about the
 * content behind it.
 */

const KEY = 'test-audit-signing-key-for-ci-test-runner-32';

function signedRun(over: Record<string, unknown> = {}) {
  const unsigned = {
    runId: 'run-1',
    projectId: 'p1',
    userId: 'u1',
    createdAt: '2026-09-16T08:00:00.000Z',
    status: 'completed',
    cleanCoreScore: 62,
    worklist: [{ id: 'W1', title: 'Replace the direct SELECT' }],
    ...over,
  };
  const runHash = computeRunHash(unsigned);
  return { ...unsigned, analysis: 'a narrative, outside the hash', runHash, signature: signRunHash(runHash, KEY) };
}

function inventory(over: Partial<Inventory> = {}): Inventory {
  const user = { uid: 'u1', email: 'a@b.c', name: 'A B' };
  const project = { id: 'p1', userId: 'u1', name: 'Lock fixture', legacyCode: 'REPORT z.\n' };
  const run = signedRun();
  return {
    database: 'source',
    manifestVersion: 2,
    collections: { users: 1, projects: 1 },
    collectionGroups: { runs: 1 },
    manifest: {
      users: [{ uid: user.uid, email: user.email, docHash: docHash(user) }],
      projects: [{ id: project.id, userId: project.userId, name: project.name, docHash: docHash(project) }],
      runs: [
        {
          path: 'projects/p1/runs/run-1',
          runHash: run.runHash,
          signature: run.signature,
          projectId: 'p1',
          userId: 'u1',
          docHash: docHash(run),
          integrity: runIntegrity(run, KEY),
        },
      ],
    },
    ...over,
  };
}

test.describe('the canonical hash sees the whole document', () => {
  test('key order is not a difference, and a changed value anywhere is', () => {
    expect(docHash({ a: 1, b: { c: 2, d: [3, 4] } })).toBe(docHash({ b: { d: [3, 4], c: 2 }, a: 1 }));
    expect(docHash({ a: 1, b: 2 })).not.toBe(docHash({ a: 1, b: 3 }));
    // Deep: the field that changed is four levels down and nothing above it moved.
    const deep = (n: number) => ({ analysis: { findings: [{ evidence: { line: n } }] } });
    expect(docHash(deep(1))).not.toBe(docHash(deep(2)));
  });

  test('types are part of the value, and a missing field is not the same as an empty one', () => {
    expect(canonical(1)).not.toBe(canonical('1'));
    expect(canonical(true)).not.toBe(canonical('true'));
    expect(docHash({ a: null })).not.toBe(docHash({}));
    expect(docHash({ a: 0 })).not.toBe(docHash({ a: false }));
    expect(docHash({ a: [1] })).not.toBe(docHash({ a: 1 }));
    // Length-prefixed keys and strings: no pair of fields can be re-cut into another.
    expect(docHash({ ab: 'c', d: 'e' })).not.toBe(docHash({ a: 'bc', de: '' }));
  });

  test('a Firestore timestamp keeps its full precision and is not confused with a string', () => {
    const ts = { _seconds: 1789548000, _nanoseconds: 123456789 };
    expect(canonical(ts)).not.toBe(canonical({ _seconds: 1789548000, _nanoseconds: 123456790 }));
    expect(canonical(ts)).not.toBe(canonical('1789548000.123456789'));
    expect(canonical(new Date('2026-09-16T08:00:00.000Z'))).toBe('t:2026-09-16T08:00:00.000Z');
  });
});

test.describe('a migration that kept the names and lost the content does not pass', () => {
  test('a project that lost its source code is a failure, not "all present and identical"', () => {
    const src = inventory();
    const tgt = inventory({ database: 'target' });
    // Same id, same owner, same name — the three fields the old comparison read.
    tgt.manifest.projects[0].docHash = docHash({ id: 'p1', userId: 'u1', name: 'Lock fixture' });
    const { problems, ok } = compareInventories(src, tgt);
    expect(problems.join('\n')).toMatch(/project DIFFERS for p1: the document content differs/);
    expect(ok.join('\n')).not.toMatch(/project: all/);
  });

  test('a user that lost a field while keeping its email is a failure', () => {
    const src = inventory();
    const tgt = inventory({ database: 'target' });
    tgt.manifest.users[0].docHash = docHash({ uid: 'u1', email: 'a@b.c' });
    expect(compareInventories(src, tgt).problems.join('\n')).toMatch(/user DIFFERS for u1: the document content differs/);
  });

  test('an unchanged migration is still clean', () => {
    const { problems, ok } = compareInventories(inventory(), inventory({ database: 'target' }));
    expect(problems).toEqual([]);
    expect(ok.join('\n')).toContain('project: all 1 present and identical');
    expect(ok.join('\n')).toContain('signed run(s) in the target rehash to their stored runHash');
  });
});

test.describe('a run has to verify against its own content, not against the other copy', () => {
  test('a run altered before the export, carrying its old hash across, is caught', () => {
    const altered = { ...signedRun(), cleanCoreScore: 95 };
    expect(runIntegrity(altered, KEY)).toBe('hash-mismatch');

    const src = inventory();
    const tgt = inventory({ database: 'target' });
    // Both sides identical, both copies broken in the same way: comparing the
    // two manifests can never see it, so the verdict has to come from the run.
    for (const inv of [src, tgt]) {
      inv.manifest.runs[0].integrity = 'hash-mismatch';
      inv.manifest.runs[0].docHash = docHash(altered);
    }
    const { problems } = compareInventories(src, tgt);
    expect(problems.join('\n')).toMatch(/signed run projects\/p1\/runs\/run-1: integrity "hash-mismatch"/);
  });

  test('a forged signature is caught when the key is available, and named as unchecked when it is not', () => {
    const run = signedRun();
    expect(runIntegrity(run, KEY)).toBe('verified');
    expect(runIntegrity({ ...run, signature: 'f'.repeat(64) }, KEY)).toBe('signature-mismatch');
    expect(runIntegrity(run)).toBe('hash-ok-signature-unchecked');
    expect(runIntegrity({ ...run, runHash: '' }, KEY)).toBe('missing-runHash');
    expect(runIntegrity({ ...run, signature: '' }, KEY)).toBe('missing-signature');

    // Unchecked signatures still pass the gate — and the report says which.
    const src = inventory();
    const tgt = inventory({ database: 'target' });
    for (const inv of [src, tgt]) inv.manifest.runs[0].integrity = 'hash-ok-signature-unchecked';
    const { problems, ok } = compareInventories(src, tgt);
    expect(problems).toEqual([]);
    expect(ok.join('\n')).toContain('without a signature check');
  });
});

test('an inventory taken before document hashing cannot be used to claim nothing was lost', () => {
  const old = inventory({ database: 'source', manifestVersion: 1 });
  for (const u of old.manifest.users) delete u.docHash;
  for (const p of old.manifest.projects) delete p.docHash;
  for (const r of old.manifest.runs) delete r.docHash;
  const { problems } = compareInventories(old, inventory({ database: 'target' }));
  expect(problems.join('\n')).toMatch(/source inventory is manifestVersion 1 — it carries no document hashes/);
  expect(problems.join('\n')).toMatch(/no document hash in one of the inventories/);
});
