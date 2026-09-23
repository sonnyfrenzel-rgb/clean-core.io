import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  assignPublicCloudFit,
  isKeepEligible,
  publicCloudFitHeadline,
  summarizePublicCloudFit,
  PUBLIC_CLOUD_FIT_BUCKETS,
  PUBLIC_CLOUD_FIT_BUCKET_LABELS,
  PUBLIC_CLOUD_FIT_BUCKET_MEANINGS,
  type PublicCloudFitAssignment,
  type PublicCloudFitObjectInput,
} from '../lib/abap/public-cloud-fit';
import { resolvePublicCloudFit, type PublicCloudFitFinding } from '../lib/abap/public-cloud-fit-resolver';
import { RETIREMENT_WINDOW_DAYS } from '../lib/abap/usage-model';
import { buildAbapEvidence } from '../lib/abap/evidence-model';
import { gradeSapObjectUse, hasNoReleasedApiPath, NO_PATH_OBJECTS } from '../lib/abap/catalog-service';
import type { GradedObject } from '../lib/abap/abcd-classification';

/**
 * Roadmap 6.7 — Public-Cloud-Fit and the four buckets (ADR-033), with CR-17 and
 * CR-18 applied.
 *
 * These tests hold the rule table in `lib/abap/public-cloud-fit.ts` to the
 * wording of `DESIGN.md` §5.6 where the design doc gives an exact sentence, and
 * to the two confirmed findings where it no longer does:
 *
 *   CR-17 — a measured zero over 13 months is a Retire *candidate* with its
 *           capture method named, and a window that spans a 31 December is
 *           calendar arithmetic, not an observed year-end close.
 *   CR-18 — the fourth bucket is *No catalogued path*, an open question with a
 *           review task, a data basis and a date. "Blocked by SAP" is a verdict
 *           that needs a confirmed need, a target profile and checked
 *           alternatives, none of which this engine has.
 *
 * And the honesty rule the roadmap brief states twice: an assignment without
 * evidence is not allowed, and a rule that cannot be applied is "not
 * determined" with a reason — never a default bucket.
 */

const NO_USAGE = null;

function baseInput(over: Partial<PublicCloudFitObjectInput> = {}): PublicCloudFitObjectInput {
  return {
    objectName: 'ZOBJ',
    level: 'C',
    levelProvenance: 'catalog',
    dropDecision: null,
    usage: NO_USAGE,
    catalog: { state: 'deprecated', pathEvidence: 'none-named' },
    hasModification: false,
    hasOwnWriteAccess: false,
    ...over,
  };
}

test.describe('rule 1 — Retire', () => {
  test('a confirmed Drop retires the object regardless of level or platform, and is not an open check', () => {
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
    // A confirmed decision IS the answer; nothing is left to find out.
    expect(a.openCheck).toBe(false);
    expect(a.reviewTask).toBeNull();
  });

  /**
   * CR-17, confirmed: "Nullnutzung → endgültig Retire".
   *
   * The evidence sentence used to read "No executions in SCMON, 2025-08-01 to
   * 2026-08-31 (13 months, includes year-end close)." Two things were wrong
   * with it at once. It reported the one fact that makes retiring safe — that a
   * year-end close ran without touching the object — as observed, when all the
   * engine did was find a 31 December inside a date range. And it presented the
   * result as a decision, when a monitor that recorded nothing says nothing
   * about whether anyone still needs the object.
   */
  test('a measured zero over >= 13 months is a Retire CANDIDATE with a review task, not a decision (CR-17)', () => {
    const a = assignPublicCloudFit(
      baseInput({
        usage: { source: 'scmon', windowFrom: '2025-08-01', windowTo: '2026-08-31', windowDays: 396, zeroExecutions: true },
      }),
      'private',
    );
    expect(a.bucket).toBe('retire');
    expect(a.rule).toBe('retire-candidate-zero-usage');
    expect(a.openCheck).toBe(true);
    expect(a.reviewTask).toMatch(/confirm with the business/i);
    expect(a.usageNote).toBeNull();
  });

  test('the Retire candidate names source, period and capture method — and claims no year-end close (CR-17)', () => {
    const a = assignPublicCloudFit(
      baseInput({
        usage: { source: 'scmon', windowFrom: '2025-08-01', windowTo: '2026-08-31', windowDays: 396, zeroExecutions: true },
      }),
      'private',
    );
    const evidence = a.evidence ?? '';
    expect(evidence).toContain('2025-08-01 to 2026-08-31');
    expect(evidence).toContain('13 months');
    // Erfassungsart: which instrument produced the zero, and what it does not see.
    expect(evidence).toContain('ABAP Call Monitor (SCMON)');
    expect(evidence).toMatch(/only while it is switched on/);
    // The year boundary is reported as calendar information, never as an
    // observed close — the exact claim CR-18's sibling finding rejected.
    expect(evidence).toContain('spans a 31 December');
    expect(evidence).toMatch(/calendar information/);
    expect(evidence).not.toMatch(/includes year-end close/i);
  });

  test('each usage source names its own capture method rather than one generic sentence', () => {
    const sentences = (['scmon', 'upl', 'st03n', 'manual'] as const).map((source) => {
      const a = assignPublicCloudFit(
        baseInput({
          usage: { source, windowFrom: '2025-08-01', windowTo: '2026-08-31', windowDays: 396, zeroExecutions: true },
        }),
        'private',
      );
      return a.evidence ?? '';
    });
    expect(new Set(sentences).size).toBe(4);
    expect(sentences[3]).toMatch(/entered by hand/);
    expect(sentences[3]).toMatch(/not a system measurement/);
  });

  // No case below tests a >= 13-month window that omits the year-boundary
  // clause: there is not one to construct. `RETIREMENT_WINDOW_DAYS` is 394 —
  // more than a full calendar year — so any window long enough to qualify
  // necessarily contains at least one 31 December by construction. The clause
  // is real rather than dead code, but it is not independently variable within
  // a window that reaches the Retire candidate at all.

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

  test('an SAP object with no path lookup supplied is not assigned rather than guessed', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', levelProvenance: 'catalog', catalog: null }), 'private');
    expect(a.bucket).toBeNull();
    expect(a.reason?.code).toBe('catalog-evidence-missing');
    expect(a.reason?.detail).toMatch(/does not assume either answer/);
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

  test('Keep names the level and the platform, is settled, and records that SAP listed the object', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'B', levelProvenance: 'catalog', catalog: { state: 'classicAPI', pathEvidence: 'successor-named' } }),
      'private',
    );
    expect(a.bucket).toBe('keep');
    expect(a.evidence).toBe('Level B, permitted for Private Edition.');
    expect(a.openCheck).toBe(false);
    expect(a.reviewTask).toBeNull();
    expect(a.catalogListed).toBe(true);
  });
});

test.describe('the same B-level object moves with the target platform (DESIGN.md §5.6)', () => {
  const bObject = baseInput({
    level: 'B',
    levelProvenance: 'catalog',
    catalog: { state: 'classicAPI', pathEvidence: 'none-named' },
  });

  test('Private Edition: Keep', () => {
    expect(assignPublicCloudFit(bObject, 'private').bucket).toBe('keep');
  });

  test('Public Edition, nothing catalogued: the path question — never silently defaulted to a C/D-only check', () => {
    const a = assignPublicCloudFit(bObject, 'public');
    expect(a.bucket).toBe('no-catalogued-path');
  });

  test('Public Edition, a successor named: Rebuild', () => {
    const withPath = { ...bObject, catalog: { state: 'classicAPI', pathEvidence: 'successor-named' as const } };
    expect(assignPublicCloudFit(withPath, 'public').bucket).toBe('rebuild');
  });
});

/**
 * The fourth bucket, and the whole point of this step (CR-18).
 *
 * It is not a judgement about the code and not a verdict about SAP. It is the
 * statement that nobody has named a way yet — which is a gap in what is known,
 * and therefore something a person has to go and find out. These tests hold
 * three things: that the bucket is reached for both shapes of "nothing
 * catalogued", that every object in it carries a task rather than a grade, and
 * that the words a reader sees do not read as an accusation.
 */
test.describe('rule 2 — No catalogued path: a question, not a verdict (CR-18)', () => {
  test('the repository lists the object and names nothing: the path question, with a task', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'D', catalog: { state: 'notToBeReleased', pathEvidence: 'none-named' } }),
      'private',
    );
    expect(a.bucket).toBe('no-catalogued-path');
    expect(a.rule).toBe('no-catalogued-path-none-named');
    expect(a.evidence).toContain('names no released successor and no extension path');
    expect(a.evidence).toContain('notToBeReleased');
    expect(a.openCheck).toBe(true);
    expect(a.reviewTask).toMatch(/Ask SAP or your architect/);
    // Whose fault it is not, said out loud.
    expect(a.reviewTask).toMatch(/not a finding about this code/);
  });

  test('an SAP object in neither repository file is the path question too, with its own task', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'C', levelProvenance: 'catalog-residual', catalog: { pathEvidence: 'not-in-release-file' } }),
      'private',
    );
    expect(a.bucket).toBe('no-catalogued-path');
    expect(a.rule).toBe('no-catalogued-path-not-listed');
    expect(a.evidence).toContain("Neither of SAP's two repository files mentions it");
    expect(a.reviewTask).toMatch(/absence of a statement/);
  });

  test('when only the classification file knows the object, the task says so rather than "neither file"', () => {
    const a = assignPublicCloudFit(
      baseInput({
        level: 'C',
        levelProvenance: 'catalog-residual',
        catalog: { pathEvidence: 'not-in-release-file', listedInClassificationFile: true },
      }),
      'public',
    );
    expect(a.evidence).toContain("Only SAP's classification file mentions it");
    expect(a.evidence).not.toContain('Neither of');
  });

  test('the bucket is named for the gap, not for a culprit', () => {
    expect(PUBLIC_CLOUD_FIT_BUCKET_LABELS['no-catalogued-path']).toBe('No catalogued path');
    for (const label of Object.values(PUBLIC_CLOUD_FIT_BUCKET_LABELS)) {
      expect(label, 'a bucket label that blames SAP is a verdict, and CR-18 says this engine has not earned one').not.toMatch(/blocked/i);
    }
  });

  /**
   * Rebuild is "we know how", the path question is "someone must find out".
   * A reader who cannot tell those apart has four severities instead of four
   * buckets, so the sentence that separates them is part of the module, not of
   * whichever surface happens to render it.
   */
  test('every bucket says who has the work, and the two that are easily confused say opposite things', () => {
    for (const bucket of PUBLIC_CLOUD_FIT_BUCKETS) {
      expect(PUBLIC_CLOUD_FIT_BUCKET_MEANINGS[bucket].length).toBeGreaterThan(30);
    }
    expect(PUBLIC_CLOUD_FIT_BUCKET_MEANINGS.rebuild).toMatch(/sits with this project/);
    expect(PUBLIC_CLOUD_FIT_BUCKET_MEANINGS['no-catalogued-path']).toMatch(/question someone has to answer/);
    expect(PUBLIC_CLOUD_FIT_BUCKET_MEANINGS['no-catalogued-path']).toMatch(/not a fault in this code/);
  });
});

test.describe('rule 3 — Rebuild: the work is known and sits here', () => {
  test('a named successor is Rebuild, settled, with no task attached', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'C', catalog: { state: 'deprecated', pathEvidence: 'successor-named' } }),
      'private',
    );
    expect(a.bucket).toBe('rebuild');
    expect(a.rule).toBe('rebuild-path');
    expect(a.evidence).toMatch(/names a released path/);
    expect(a.evidence).toMatch(/known work and sits with this project/);
    expect(a.openCheck).toBe(false);
    expect(a.reviewTask).toBeNull();
  });

  test('a modification is Rebuild even where nothing is catalogued — never the path question', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'D', catalog: { state: 'notToBeReleased', pathEvidence: 'none-named' }, hasModification: true }),
      'private',
    );
    expect(a.bucket).toBe('rebuild');
    expect(a.rule).toBe('rebuild-own-work');
    expect(a.evidence).toMatch(/modification/i);
  });

  test('an own write access to an SAP table is Rebuild even where nothing is catalogued', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'D', catalog: { state: 'notToBeReleased', pathEvidence: 'none-named' }, hasOwnWriteAccess: true }),
      'private',
    );
    expect(a.bucket).toBe('rebuild');
    expect(a.evidence).toMatch(/writes directly/i);
  });

  test("the project's own object (not an SAP entry) is Rebuild by elimination, never the path question", () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', levelProvenance: 'own-object', catalog: null }), 'private');
    expect(a.bucket).toBe('rebuild');
    expect(a.rule).toBe('rebuild-own-work');
    expect(a.catalogListed).toBe(false);
  });

  test('a heuristic estimate is likewise Rebuild by elimination', () => {
    const a = assignPublicCloudFit(baseInput({ level: 'D', levelProvenance: 'heuristic', catalog: null }), 'public');
    expect(a.bucket).toBe('rebuild');
  });
});

test.describe('summarizePublicCloudFit and the headline (ADR-029)', () => {
  const objects: PublicCloudFitObjectInput[] = [
    baseInput({ objectName: 'ZA', level: 'D', catalog: { pathEvidence: 'none-named' } }),
    baseInput({ objectName: 'ZB', level: 'D', catalog: { pathEvidence: 'none-named' } }),
    baseInput({ objectName: 'ZC', level: 'A', catalog: { pathEvidence: 'successor-named' } }),
    baseInput({ objectName: 'ZD', level: 'Unknown' }),
  ];

  test('counts, the objects without a path and the open-check tally are all consistent', () => {
    const assignments = objects.map((o) => assignPublicCloudFit(o, 'private'));
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'private', usageImported: true });
    expect(summary.counts).toEqual({ retire: 0, 'no-catalogued-path': 2, rebuild: 0, keep: 1, notAssigned: 1 });
    expect(summary.objectsWithoutCataloguedPath.sort()).toEqual(['ZA', 'ZB']);
    expect(summary.decisionBlocked).toBe(true);
    expect(summary.openCheckCount).toBe(2);
    expect(summary.usageImportCaveat).toBeNull();
  });

  test('one object without a catalogued path is enough to block the decision — no threshold', () => {
    const assignments = [assignPublicCloudFit(baseInput({ level: 'D', catalog: { pathEvidence: 'none-named' } }), 'private')];
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'private', usageImported: true });
    expect(summary.decisionBlocked).toBe(true);
    expect(publicCloudFitHeadline(summary)).toBe(
      '1 object has no catalogued path — that has to be answered before a Private Edition decision.',
    );
  });

  test('no object waiting on a path: the headline still names the platform', () => {
    const assignments = [assignPublicCloudFit(baseInput({ level: 'A', catalog: { pathEvidence: 'successor-named' } }), 'public')];
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'public', usageImported: true });
    expect(publicCloudFitHeadline(summary)).toBe('No object is waiting on a catalogued path for a Public Edition decision.');
  });

  test('no target platform: the headline says so instead of a number', () => {
    const summary = summarizePublicCloudFit([], { targetPlatform: null, usageImported: true });
    expect(publicCloudFitHeadline(summary)).toBe('Target platform not set — Public-Cloud-Fit cannot be concluded yet.');
  });

  test('no usage import at all: the caveat says Retire is limited to a confirmed Drop', () => {
    const summary = summarizePublicCloudFit([], { targetPlatform: 'private', usageImported: false });
    expect(summary.usageImportCaveat).toMatch(/confirmed Drop decision, never from unknown usage/);
  });

  /**
   * "Ein leerer Zustand ist nicht null." A project whose objects SAP has never
   * heard of is not a project with zero path problems — it is a project the
   * catalogue could not speak about at all, and the card has to say that in a
   * word instead of showing a reassuring 0.
   */
  test('a project with no catalogued object at all says so in a word, not as a zero', () => {
    const assignments = [
      assignPublicCloudFit(baseInput({ objectName: 'ZOWN', level: 'B', levelProvenance: 'own-object', catalog: null }), 'private'),
    ];
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'private', usageImported: true });
    expect(summary.catalogListedCount).toBe(0);
    expect(summary.noCatalogMatchNote).toMatch(/None of these objects is listed/);
  });

  test('a project with a catalogued object carries no such note', () => {
    const assignments = [assignPublicCloudFit(baseInput({ level: 'A', catalog: { pathEvidence: 'successor-named' } }), 'private')];
    expect(summarizePublicCloudFit(assignments, { targetPlatform: 'private', usageImported: true }).noCatalogMatchNote).toBeNull();
  });

  test('an empty project produces no note at all — there is nothing to say it about', () => {
    expect(summarizePublicCloudFit([], { targetPlatform: 'private', usageImported: true }).noCatalogMatchNote).toBeNull();
  });

  /** Roadmap 6.7: the fourth bucket carries its data basis and the date of it. */
  test('the data basis names each synced file with the day it was synced', () => {
    const summary = summarizePublicCloudFit([], {
      targetPlatform: 'private',
      usageImported: true,
      catalogBasis: [
        { file: 'objectReleaseInfoLatest.json', syncedAt: '2026-09-15' },
        { file: 'objectClassifications_SAP.json', syncedAt: '2026-08-26' },
      ],
    });
    expect(summary.catalogBasisNote).toBe(
      'Data basis: objectReleaseInfoLatest.json (synced 2026-09-15), objectClassifications_SAP.json (synced 2026-08-26).',
    );
  });

  test('without a basis the note admits the date is missing rather than printing one', () => {
    const summary = summarizePublicCloudFit([], { targetPlatform: 'private', usageImported: true });
    expect(summary.catalogBasis).toBeNull();
    expect(summary.catalogBasisNote).toMatch(/sync date is not available in this view/);
    expect(summary.catalogBasisNote, 'a date appeared where none was supplied').not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  test('nothing this module produces is a percentage', () => {
    const assignments = objects.map((o) => assignPublicCloudFit(o, 'public'));
    const summary = summarizePublicCloudFit(assignments, { targetPlatform: 'public', usageImported: false });
    const text = [
      publicCloudFitHeadline(summary),
      summary.catalogBasisNote,
      summary.usageImportCaveat ?? '',
      ...Object.values(PUBLIC_CLOUD_FIT_BUCKET_MEANINGS),
      ...assignments.map((a) => `${a.evidence ?? ''} ${a.reviewTask ?? ''} ${a.reason?.detail ?? ''}`),
    ].join(' ');
    expect(text).not.toContain('%');
    expect(text).not.toMatch(/\bper cent\b|\bpercent\b/i);
  });
});

/* ------------------------------------------------------------ the resolver */

const graded = (over: Partial<GradedObject> = {}): GradedObject => ({
  grade: 'D',
  provenance: 'catalog',
  state: 'notToBeReleased',
  cloudView: 'not-usable',
  classicView: 'unlisted',
  ...over,
});

test.describe('resolvePublicCloudFit — wiring findings, usage and the catalog lookup', () => {
  test('a standard-table-write finding sets the own-write-access override, not just the use', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'BSEG', kind: 'standard-table-write' }];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      {
        gradeObjectUse: () => graded(),
        hasNoPath: () => true, // nothing catalogued — the override must still win
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
      { gradeObjectUse: () => graded(), hasNoPath: () => true },
    );
    expect(assignments[0].bucket).toBe('rebuild');
    expect(assignments[0].evidence).toMatch(/modification was detected/i);
  });

  test("table-access (a read of the project's own table) never sets own-write-access", () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'ZLOG', kind: 'table-access' }];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: () => graded({ provenance: 'own-object', state: undefined, cloudView: 'unlisted' }), hasNoPath: () => true },
    );
    expect(assignments[0].evidence).not.toMatch(/writes directly/i);
  });

  /**
   * The bug this rewrite was really about (CR-18, second half).
   *
   * `hasNoReleasedApiPath()` answers one question, and a `false` from it means
   * "not flagged". The resolver read that as `hasPath: true` for every object,
   * so an object listed in NEITHER of SAP's files — `catalog-residual`, which
   * is `abcd-classification.ts`'s own word for "listed nowhere" — was told "a
   * successor or extension path exists in the Cloudification Repository".
   * Measured on the shipped examples before the fix: 8 of the 31 objects sorted
   * into Rebuild cited a repository entry that does not exist.
   */
  test('an object in neither SAP file is never told a successor exists', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'T16FS', kind: 'standard-table-read' }];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      {
        gradeObjectUse: () =>
          graded({ grade: 'C', provenance: 'catalog-residual', state: undefined, cloudView: 'unlisted', classicView: 'unlisted' }),
        hasNoPath: () => false, // not flagged — which is not the same as "a path exists"
      },
    );
    expect(assignments[0].evidence, 'the repository was quoted for an object it has never heard of').not.toMatch(
      /names a released path/,
    );
    expect(assignments[0].bucket).toBe('no-catalogued-path');
    expect(assignments[0].rule).toBe('no-catalogued-path-not-listed');
  });

  test('a listed, unflagged object does still get Rebuild — the fix did not swallow the good case', () => {
    const findings: PublicCloudFitFinding[] = [{ objectName: 'VBAK', kind: 'standard-table-read' }];
    const { assignments } = resolvePublicCloudFit(
      { findings, usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: () => graded({ grade: 'C', cloudView: 'not-usable' }), hasNoPath: () => false },
    );
    expect(assignments[0].bucket).toBe('rebuild');
    expect(assignments[0].rule).toBe('rebuild-path');
  });

  test('a declared usage window is read into ObjectUsageEvidence and reaches the Retire candidate end to end', () => {
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
      { gradeObjectUse: () => graded({ grade: 'C', state: 'deprecated', cloudView: 'deprecated' }), hasNoPath: () => false },
    );
    expect(assignments[0].bucket).toBe('retire');
    expect(assignments[0].rule).toBe('retire-candidate-zero-usage');
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
      { gradeObjectUse: () => graded({ grade: 'A', state: 'released', cloudView: 'usable' }), hasNoPath: () => false },
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
      { gradeObjectUse: () => graded({ grade: 'Unknown', provenance: 'heuristic' }), hasNoPath: () => false },
    );
    expect(assignments[0].bucket).toBe('retire');
  });

  test('the catalog basis passed to the resolver reaches the summary sentence', () => {
    const { summary } = resolvePublicCloudFit(
      {
        findings: [{ objectName: 'ZA', kind: 'standard-table-read' }],
        usageReport: null,
        targetPlatform: 'private',
        catalogBasis: [{ file: 'objectReleaseInfoLatest.json', syncedAt: '2026-09-15' }],
      },
      { gradeObjectUse: () => graded(), hasNoPath: () => false },
    );
    expect(summary.catalogBasisNote).toContain('objectReleaseInfoLatest.json (synced 2026-09-15)');
  });

  test('no usage import at all is surfaced in the summary, not silently absorbed', () => {
    const { summary } = resolvePublicCloudFit(
      { findings: [{ objectName: 'ZA', kind: 'standard-table-read' }], usageReport: null, targetPlatform: 'private' },
      { gradeObjectUse: () => graded({ grade: 'Unknown', provenance: 'heuristic' }), hasNoPath: () => false },
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
      { gradeObjectUse: () => graded({ grade: 'Unknown', provenance: 'heuristic' }), hasNoPath: () => false },
    );
    expect(assignments.map((a) => a.objectName)).toEqual(['ZA', 'ZB']);
  });
});

/**
 * Keep said "nothing to do" over a modification (f9695d22d124).
 *
 * The rule table in the head of `public-cloud-fit.ts` states it twice: every
 * modification and every own write access to an SAP table is Rebuild, "das ist
 * die Arbeit des Projekts, nie die von SAP". Both checks stood *after*
 * `isKeepEligible`, which returns on the first match — so a level-A object the
 * project had modified came back as Keep. The existing coverage was `D` plus a
 * modification (a level that never keeps), so the combination that mattered was
 * never asked.
 *
 * Retire stays rule 1: a confirmed Drop settles the object whether or not it
 * was modified on the way out.
 */
test.describe('own work beats Keep, not only the path question (f9695d22d124)', () => {
  for (const [level, platform] of [
    ['A', 'public'],
    ['A', 'private'],
    ['B', 'private'],
  ] as Array<['A' | 'B', 'public' | 'private']>) {
    test(`level ${level} on the ${platform} edition WITH a modification is Rebuild, not Keep`, () => {
      const a = assignPublicCloudFit(
        baseInput({ level, levelProvenance: 'catalog', catalog: { pathEvidence: 'successor-named' }, hasModification: true }),
        platform,
      );
      expect(a.bucket, 'a modified object reported as "Keep — nothing to do"').toBe('rebuild');
      expect(a.rule).toBe('rebuild-own-work');
      expect(a.evidence).toMatch(/modification/i);
    });

    test(`level ${level} on the ${platform} edition WITH an own write access is Rebuild, not Keep`, () => {
      const a = assignPublicCloudFit(
        baseInput({ level, levelProvenance: 'catalog', catalog: { pathEvidence: 'successor-named' }, hasOwnWriteAccess: true }),
        platform,
      );
      expect(a.bucket).toBe('rebuild');
      expect(a.rule).toBe('rebuild-own-work');
      expect(a.evidence).toMatch(/writes directly/i);
    });
  }

  test('Keep is not deleted: the same object without own work still keeps', () => {
    const a = assignPublicCloudFit(
      baseInput({ level: 'A', levelProvenance: 'catalog', catalog: { pathEvidence: 'successor-named' } }),
      'public',
    );
    expect(a.bucket).toBe('keep');
    expect(a.rule).toBe('keep-platform-level');
  });

  test('Retire still wins over own work — rule 1 is first', () => {
    const a = assignPublicCloudFit(
      baseInput({
        level: 'A',
        hasModification: true,
        dropDecision: {
          subject: 'Order check',
          revision: 3,
          accountName: 'Sonny',
          confirmedAt: '2026-09-01T00:00:00.000Z',
        },
      }),
      'private',
    );
    expect(a.bucket).toBe('retire');
    expect(a.rule).toBe('retire-drop');
  });
});

/* ------------------------------------------- against the shipped examples */

/**
 * The same rules against the real catalog and the eight examples the product
 * ships, because the fixtures above prove the rules and nothing about the data.
 *
 * Measured on 2026-09-23 over `public/starter-examples/` (41 distinct objects
 * across six files; two of the eight name no object at all):
 *
 *   Public Edition   32 Rebuild · 8 No catalogued path · 0 Keep · 0 Retire · 1 not assigned
 *   Private Edition  24 Rebuild · 8 No catalogued path · 8 Keep · 0 Retire · 1 not assigned
 *
 * Retire is empty and stays empty here on purpose: no example carries a usage
 * import, and nothing links an ABAP object to a confirmed Drop decision yet
 * (see `ObjectDropDecision`) — so the engine has no evidence for it and invents
 * none. The eight objects without a catalogued path are all objects SAP lists
 * in neither file; before this step they were told a successor existed.
 *
 * The numbers above are a record, not an assertion: the test below re-measures
 * them and asserts the properties that must hold whatever a catalog re-sync
 * does to the totals.
 */
test.describe('the shipped examples, against the real catalog', () => {
  const EXAMPLES = path.resolve(__dirname, '..', 'public', 'starter-examples');

  function assignEverything(platform: 'public' | 'private'): PublicCloudFitAssignment[] {
    const out: PublicCloudFitAssignment[] = [];
    for (const file of fs.readdirSync(EXAMPLES).sort()) {
      const code = fs.readFileSync(path.join(EXAMPLES, file), 'utf8');
      const findings = buildAbapEvidence(code, file, platform).findings;
      out.push(
        ...resolvePublicCloudFit(
          { findings, usageReport: null, targetPlatform: platform },
          { gradeObjectUse: (n, u) => gradeSapObjectUse(n, u), hasNoPath: (n) => hasNoReleasedApiPath(n) },
        ).assignments,
      );
    }
    return out;
  }

  for (const platform of ['public', 'private'] as const) {
    test(`${platform}: every object is either a bucket with evidence or a reason, and every open check has a task`, () => {
      const assignments = assignEverything(platform);
      expect(assignments.length).toBeGreaterThan(0);
      for (const a of assignments) {
        if (a.bucket) {
          expect(a.evidence, `${a.objectName} was bucketed with no evidence`).toBeTruthy();
          expect(a.reason).toBeNull();
        } else {
          expect(a.reason?.detail, `${a.objectName} was left out with no reason`).toBeTruthy();
          expect(a.evidence).toBeNull();
        }
        expect(a.reviewTask === null, `${a.objectName}: openCheck and reviewTask disagree`).toBe(!a.openCheck);
      }
    });

    test(`${platform}: no object is told a path exists that SAP's files do not name`, () => {
      for (const a of assignEverything(platform)) {
        if (a.rule === 'rebuild-path') {
          expect(hasNoReleasedApiPath(a.objectName)).toBe(false);
          // And it is really in the release file, not merely unflagged.
          expect(gradeSapObjectUse(a.objectName, null).cloudView, `${a.objectName} is in neither SAP file`).not.toBe('unlisted');
        }
      }
    });
  }

  test('the examples do put objects in the fourth bucket, each with a task and a data basis', () => {
    const assignments = assignEverything('public');
    const withoutPath = assignments.filter((a) => a.bucket === 'no-catalogued-path');
    expect(withoutPath.length, 'the examples used to yield none of these because unlisted objects were called Rebuild').toBeGreaterThan(0);
    for (const a of withoutPath) {
      expect(a.openCheck).toBe(true);
      expect(a.reviewTask).toBeTruthy();
    }
    const summary = summarizePublicCloudFit(assignments, {
      targetPlatform: 'public',
      usageImported: false,
      catalogBasis: [{ file: 'objectReleaseInfoLatest.json', syncedAt: '2026-09-15' }],
    });
    expect(summary.decisionBlocked).toBe(true);
    expect(summary.catalogBasisNote).toContain('synced 2026-09-15');
  });

  test('Retire stays empty on the examples, because nothing supplies the evidence for it', () => {
    for (const platform of ['public', 'private'] as const) {
      const retired = assignEverything(platform).filter((a) => a.bucket === 'retire');
      expect(retired, 'an object was retired without a usage import or a confirmed Drop').toEqual([]);
    }
  });

  /**
   * One real object out of the catalog's own no-path set, graded and sorted by
   * the same rules — so the `none-named` branch is proven against SAP's data
   * and not only against a fixture that says `pathEvidence: 'none-named'`.
   */
  test("a real object from the catalog's no-path set lands in the fourth bucket", () => {
    const candidate = [...NO_PATH_OBJECTS].find((name) => {
      const g = gradeSapObjectUse(name, null);
      return g.grade === 'C' || g.grade === 'D';
    });
    expect(candidate, 'the catalog carries no no-path object below the Keep bar to test with').toBeTruthy();
    const name = candidate as string;
    const a = assignPublicCloudFit(
      {
        objectName: name,
        level: gradeSapObjectUse(name, null).grade,
        levelProvenance: gradeSapObjectUse(name, null).provenance,
        dropDecision: null,
        usage: null,
        catalog: { state: gradeSapObjectUse(name, null).state, pathEvidence: 'none-named' },
        hasModification: false,
        hasOwnWriteAccess: false,
      },
      'public',
    );
    expect(a.bucket).toBe('no-catalogued-path');
    expect(a.rule).toBe('no-catalogued-path-none-named');
  });
});
