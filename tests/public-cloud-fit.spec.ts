import { test, expect } from '@playwright/test';
import {
  assignPublicCloudFit,
  isKeepEligible,
  publicCloudFitHeadline,
  summarizePublicCloudFit,
  type PublicCloudFitObjectInput,
} from '../lib/abap/public-cloud-fit';
import { resolvePublicCloudFit, type PublicCloudFitFinding } from '../lib/abap/public-cloud-fit-resolver';
import { RETIREMENT_WINDOW_DAYS } from '../lib/abap/usage-model';
import type { GradedObject } from '../lib/abap/abcd-classification';

/**
 * Roadmap 6.7 — Public-Cloud-Fit and the four buckets, ADR-033.
 *
 * These tests hold the rule table in `lib/abap/public-cloud-fit.ts` to the
 * wording of `DESIGN.md` §5.6, word for word where the design doc gives an
 * exact sentence ("Usage window too short: 4 months — needs 13.", "No
 * executions in SUSG, 2025-08-01 to 2026-08-31 (13 months, includes year-end
 * close)."), and hold the honesty rule the roadmap brief states twice: an
 * assignment without evidence is not allowed, and a rule that cannot be
 * applied is "not determined" with a reason — never a default bucket.
 */

const NO_USAGE = null;

function baseInput(over: Partial<PublicCloudFitObjectInput> = {}): PublicCloudFitObjectInput {
  return {
    objectName: 'ZOBJ',
    level: 'C',
    levelProvenance: 'catalog',
    dropDecision: null,
    usage: NO_USAGE,
    catalog: { state: 'deprecated', hasPath: false },
    hasModification: false,
    hasOwnWriteAccess: false,
    ...over,
  };
}

test.describe('rule 1 — Retire', () => {
  test('a confirmed Drop retires the object regardless of level or platform', () => {
    const a = assignPublicCloudFit(
      baseInput({
        level: 'Unknown',
        dropDecision: { subject: 'BR-004', revision: 2, confirmedAt: '2026-08-01T10:00:00Z', accountName: 'S. Frenzel' },
      }),
      null,
    );
    expect(a.bucket).toBe('retire');
    expect(a.rule).toBe('retire-drop');
    expect(a.evidence).toBe('Confirmed Drop for BR-004 (revision 2, confirmed by S. Frenzel on 2026-08-01).');
    expect(a.reason).toBeNull();
  });

  test('a measured zero over >= 13 declared months retires it, with source, period and year-end close', () => {
    const a = assignPublicCloudFit(
      baseInput({
        usage: { source: 'scmon', windowFrom: '2025-08-01', windowTo: '2026-08-31', windowDays: 396, zeroExecutions: true },
      }),
      'private',
    );
    expect(a.bucket).toBe('retire');
    expect(a.rule).toBe('retire-zero-usage');
    expect(a.evidence).toBe('No executions in SCMON, 2025-08-01 to 2026-08-31 (13 months, includes year-end close).');
    expect(a.usageNote).toBeNull();
  });

  // No case below tests a >= 13-month window that omits "includes year-end
  // close": there is not one to construct. `RETIREMENT_WINDOW_DAYS` is 394 —
  // more than a full calendar year — so any window long enough to qualify for
  // Retire necessarily contains at least one 31 December by construction. The
  // clause in the evidence sentence is real (DESIGN.md §5.6's own example
  // carries it) rather than dead code, but it is not independently variable
  // within a window that reaches Retire at all.

  test('a measured zero under 13 months never retires, and says exactly how short — DESIGN.md §5.6, verbatim', () => {
    const a = assignPublicCloudFit(
      baseInput({
        level: 'A', // Keep-eligible everywhere, so the short window cannot smuggle in a different bucket
        catalog: null,
        levelProvenance: 'heuristic',
        usage: { source: 'upl', windowFrom: '2026-01-01', windowTo: '2026-05-01', windowDays: 120, zeroExecutions: true },
      }),
      'private',
    );
    expect(a.bucket).toBe('keep');
    expect(a.usageNote).toBe('Usage window too short: 4 months — needs 13.');
  });

  test('a confirmed Drop wins even over a qualifying usage record (Drop is checked first)', () => {
    const a = assignPublicCloudFit(
      baseInput({
        dropDecision: { subject: 'EL-9', revision: 1, confirmedAt: '2026-01-01T00:00:00Z', accountName: 'Owner' },
        usage: { source: 'scmon', windowFrom: '2024-01-01', windowTo: '2026-06-01', windowDays: 882, zeroExecutions: true },
      }),
      'private',
    );
    expect(a.rule).toBe('retire-drop');
  });

  test('a non-zero call count never retires, whatever the window', () => {
    const a = assignPublicCloudFit(
      baseInput({
        level: 'A',
        catalog: null,
        levelProvenance: 'heuristic',
        usage: { source: 'scmon', windowFrom: '2024-01-01', windowTo: '2026-06-01', windowDays: 882, zeroExecutions: false },
      }),
      'private',
    );
    expect(a.bucket).not.toBe('retire');
    expect(a.usageNote).toBeNull();
  });
});

test.describe('not assigned — never a default bucket', () => {
  test('an unknown level is not assigned, with a reason, before the platform is even read', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'Unknown' }), null);
    expect(a.bucket).toBeNull();
    expect(a.rule).toBeNull();
    expect(a.evidence).toBeNull();
    expect(a.reason?.code).toBe('level-not-determined');
    expect(a.reason?.detail.length).toBeGreaterThan(20);
  });

  test('a known level with no target platform is not assigned, and says why', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'C' }), null);
    expect(a.bucket).toBeNull();
    expect(a.reason?.code).toBe('target-platform-not-set');
  });

  test('a catalog-provenance level with no catalog evidence supplied is not assigned rather than guessed', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', levelProvenance: 'catalog', catalog: null }), 'private');
    expect(a.bucket).toBeNull();
    expect(a.reason?.code).toBe('catalog-evidence-missing');
  });
});

test.describe('rule 4 — Keep, platform-dependent', () => {
  test('level A keeps on both platforms', () => {
    expect(isKeepEligible('A', 'public')).toBe(true);
    expect(isKeepEligible('A', 'private')).toBe(true);
  });

  test('level B keeps only in the Private Edition', () => {
    expect(isKeepEligible('B', 'private')).toBe(true);
    expect(isKeepEligible('B', 'public')).toBe(false);
  });

  test('level C and D never keep', () => {
    expect(isKeepEligible('C', 'private')).toBe(false);
    expect(isKeepEligible('D', 'public')).toBe(false);
  });

  test('the evidence names the level and the platform', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'B', levelProvenance: 'catalog', catalog: { hasPath: true } }), 'private');
    expect(a.bucket).toBe('keep');
    expect(a.evidence).toBe('Level B, permitted for Private Edition.');
  });
});

test.describe('the same B-level object moves with the target platform (DESIGN.md §5.6)', () => {
  const bObject = baseInput({
    level: 'B',
    levelProvenance: 'catalog',
    catalog: { state: 'classicAPI', hasPath: false },
  });

  test('Private Edition: Keep', () => {
    expect(assignPublicCloudFit(bObject, 'private').bucket).toBe('keep');
  });

  test('Public Edition, no path: Blocked by SAP — never silently defaulted to a C/D-only check', () => {
    const a = assignPublicCloudFit(bObject, 'public');
    expect(a.bucket).toBe('blocked-by-sap');
  });

  test('Public Edition, a path exists: Rebuild', () => {
    const withPath = { ...bObject, catalog: { state: 'classicAPI', hasPath: true } };
    expect(assignPublicCloudFit(withPath, 'public').bucket).toBe('rebuild');
  });
});

test.describe('rules 2 and 3 — Blocked by SAP vs. Rebuild', () => {
  test('needed, below the bar, a real catalog object with no path: Blocked by SAP', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', catalog: { state: 'notToBeReleased', hasPath: false } }), 'private');
    expect(a.bucket).toBe('blocked-by-sap');
    expect(a.evidence).toContain('No released successor and no extension path');
    expect(a.evidence).toContain('notToBeReleased');
  });

  test('needed, below the bar, a real catalog object WITH a path: Rebuild, not Blocked', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'C', catalog: { state: 'deprecated', hasPath: true } }), 'private');
    expect(a.bucket).toBe('rebuild');
    expect(a.rule).toBe('rebuild-path');
  });

  test('a modification is Rebuild even where the catalog says there is no path — never Blocked', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'D', catalog: { state: 'notToBeReleased', hasPath: false }, hasModification: true }),
      'private',
    );
    expect(a.bucket).toBe('rebuild');
    expect(a.rule).toBe('rebuild-own-work');
    expect(a.evidence).toMatch(/modification/i);
  });

  test('an own write access to an SAP table is Rebuild even with no catalog path — never Blocked', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'D', catalog: { state: 'notToBeReleased', hasPath: false }, hasOwnWriteAccess: true }),
      'private',
    );
    expect(a.bucket).toBe('rebuild');
    expect(a.evidence).toMatch(/writes directly/i);
  });

  test('the project\'s own object (not a catalog entry) is Rebuild by elimination, never Blocked', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', levelProvenance: 'own-object', catalog: null }), 'private');
    expect(a.bucket).toBe('rebuild');
    expect(a.rule).toBe('rebuild-own-work');
  });

  test('a heuristic estimate is likewise Rebuild by elimination, never Blocked', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', levelProvenance: 'heuristic', catalog: null }), 'public');
    expect(a.bucket).toBe('rebuild');
  });
});

test.describe('summarizePublicCloudFit and the headline (ADR-029)', () => {
  const objects: PublicCloudFitObjectInput[] = [
    baseInput({ objectName: 'ZA', level: 'D', catalog: { hasPath: false } }), // blocked
    baseInput({ objectName: 'ZB', level: 'D', catalog: { hasPath: false } }), // blocked
    baseInput({ objectName: 'ZC', level: 'A', catalog: { hasPath: true } }), // keep
    baseInput({ objectName: 'ZD', level: 'Unknown' }), // not assigned
  ];

  test('counts, blocking objects and the per-object rule are all consistent', () => {
    const assignments = objects.map((o) => assignPublicCloudFit(o, 'private'));
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'private', usageImported: true });
    expect(summary.counts).toEqual({ retire: 0, 'blocked-by-sap': 2, rebuild: 0, keep: 1, notAssigned: 1 });
    expect(summary.blockingObjects.sort()).toEqual(['ZA', 'ZB']);
    expect(summary.decisionBlocked).toBe(true);
    expect(summary.usageImportCaveat).toBeNull();
  });

  test('one object without a path is enough to block the decision — no threshold', () => {
    const assignments = [assignPublicCloudFit(baseInput({ level: 'D', catalog: { hasPath: false } }), 'private')];
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'private', usageImported: true });
    expect(summary.decisionBlocked).toBe(true);
    expect(publicCloudFitHeadline(summary)).toBe('1 object blocks a Private Edition decision.');
  });

  test('no blocking object: the headline still names the platform', () => {
    const assignments = [assignPublicCloudFit(baseInput({ level: 'A', catalog: { hasPath: true } }), 'public')];
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'public', usageImported: true });
    expect(publicCloudFitHeadline(summary)).toBe('No object without a path blocks a Public Edition decision.');
  });

  test('no target platform: the headline says so instead of a number', () => {
    const summary = summarizePublicCloudFit([], { targetPlatform: null, usageImported: true });
    expect(publicCloudFitHeadline(summary)).toBe('Target platform not set — Public-Cloud-Fit cannot be concluded yet.');
  });

  test('no usage import at all: the caveat says Retire is limited to a confirmed Drop', () => {
    const summary = summarizePublicCloudFit([], { targetPlatform: 'private', usageImported: false });
    expect(summary.usageImportCaveat).toMatch(/confirmed Drop decision, never from unknown usage/);
  });
});

/* ------------------------------------------------------------ the resolver */

const gradeOf =
  (grades: Record<string, GradedObject>) =>
  (name: string): GradedObject =>
    grades[name] ?? { grade: 'Unknown', provenance: 'heuristic' };

test.describe('resolvePublicCloudFit — wiring findings, usage and the catalog lookup', () => {
  test('a standard-table-write finding sets the own-write-access override, not just the use', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'BSEG', kind: 'standard-table-write' }];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      {
        gradeObjectUse: () => ({ grade: 'D', provenance: 'catalog', state: 'notToBeReleased' }),
        hasNoPath: () => true, // no path in the catalog — the override must still win
      },
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0].bucket).toBe('rebuild');
    expect(assignments[0].evidence).toMatch(/writes directly/i);
  });

  test('a modification finding sets hasModification regardless of which other kinds name the same object', () => {
    const findings: PublicCloudFitFinding[] = [
      { objectName: 'ZCL_DEMO', kind: 'standard-table-read' },
      { objectName: 'ZCL_DEMO', kind: 'modification' },
    ];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: () => ({ grade: 'D', provenance: 'catalog', state: 'notToBeReleased' }), hasNoPath: () => true },
    );
    expect(assignments[0].bucket).toBe('rebuild');
    expect(assignments[0].evidence).toMatch(/modification was detected/i);
  });

  test('table-access (a read of the project\'s own table) never sets own-write-access', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'ZLOG', kind: 'table-access' }];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: () => ({ grade: 'D', provenance: 'own-object', state: undefined }), hasNoPath: () => true },
    );
    // Below the bar, no override fires, not a catalog object → Rebuild by
    // elimination, but for the "own work" reason, not the write-access one.
    expect(assignments[0].evidence).not.toMatch(/writes directly/i);
  });

  test('a declared usage window is read into ObjectUsageEvidence and can retire an object end to end', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'ZYEAR_END', kind: 'standard-table-read' }];
    const { assignments, summary } = resolvePublicCloudFit(
      {
        findings,
        usageReport: {
          records: [{ objectName: 'ZYEAR_END', callCount: 0, source: 'scmon' }],
          source: 'scmon',
          window: { from: '2025-08-01', to: '2026-08-31', days: RETIREMENT_WINDOW_DAYS },
          importedAt: '2026-09-01',
          warnings: [],
        },
        targetPlatform: 'private',
      },
      { gradeObjectUse: () => ({ grade: 'C', provenance: 'catalog', state: 'deprecated' }), hasNoPath: () => false },
    );
    expect(assignments[0].bucket).toBe('retire');
    expect(assignments[0].evidence).toContain('SCMON');
    expect(summary.usageImportCaveat).toBeNull();
  });

  test('no declared window means no usable usage evidence, even with a zero-count record', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'ZYEAR_END', kind: 'standard-table-read' }];
    const { assignments } = resolvePublicCloudFit(
      {
        findings,
        usageReport: {
          records: [{ objectName: 'ZYEAR_END', callCount: 0, source: 'scmon' }],
          source: 'scmon',
          importedAt: '2026-09-01',
          warnings: [],
        },
        targetPlatform: 'private',
      },
      { gradeObjectUse: () => ({ grade: 'A', provenance: 'catalog', state: 'released' }), hasNoPath: () => false },
    );
    expect(assignments[0].bucket).toBe('keep'); // level A, not swept into Retire from an undeclared window
  });

  test('a passed-in drop decision reaches rule 1 through the resolver', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'ZOLD', kind: 'standard-table-read' }];
    const { assignments } = resolvePublicCloudFit(
      {
        findings,
        usageReport: null,
        targetPlatform: 'private',
        dropDecisions: { ZOLD: { subject: 'BR-011', revision: 3, confirmedAt: '2026-05-01T00:00:00Z', accountName: 'Owner' } },
      },
      { gradeObjectUse: () => ({ grade: 'Unknown', provenance: 'heuristic' }), hasNoPath: () => false },
    );
    expect(assignments[0].bucket).toBe('retire');
  });

  test('no usage import at all is surfaced in the summary, not silently absorbed', () => {
    const { summary } = resolvePublicCloudFit(
      { findings: [{ objectName: 'ZA', kind: 'standard-table-read' }], usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: gradeOf({}), hasNoPath: () => false },
    );
    expect(summary.usageImportCaveat).toMatch(/No usage import exists/);
  });

  test('assignments are sorted by object name for a stable render', () => {
    const findings: PublicCloudFitFinding[] = [
      { objectName: 'ZB', kind: 'standard-table-read' },
      { objectName: 'ZA', kind: 'standard-table-read' },
    ];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: gradeOf({}), hasNoPath: () => false },
    );
    expect(assignments.map((a) => a.objectName)).toEqual(['ZA', 'ZB']);
  });
});
