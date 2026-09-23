/**
 * Roadmap 7.9 (CR-01) and finding 20fe6d7b4308, in one file: what a catalog
 * object IS, and what the catalog was quietly failing to look at.
 *
 * Part 1 — two dimensions per object. A catalog object carries a classic
 * release status AND an ABAP Cloud usability, and they are different
 * properties. `CL_HTTP_UTILITY` is SAP's own counter-example: classic
 * `classicAPI`, cloud `notToBeReleased`, successor `CL_WEB_HTTP_UTILITY`. The
 * letter stays the clean core target reference (decision §9 no. 18) and is not
 * re-derived here — `abcd-classification.ts` is untouched.
 *
 * Part 2 — `buildMerged()` built `NO_PATH_OBJECTS` from the release file alone
 * and never visited the classification file, so hundreds of objects SAP marks
 * `noAPI` answered `hasNoReleasedApiPath() === false`. The reachable effect is
 * at the far end of the chain: `deriveFeasibility` called them
 * `clean-core-ready` after a usage import. That is the engine claiming a path
 * it never went looking for, and the last test here is that claim, before and
 * after.
 *
 * Every number below is counted from the shipped artifacts rather than typed
 * in, so a catalog sync that changes the data changes the test with it.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  getObjectDimensions,
  hasNoReleasedApiPath,
  resolveApi,
  NO_PATH_OBJECTS,
} from '../lib/abap/catalog-service';
import { joinUsageWithEvidence } from '../lib/abap/usage-join';

type Entry = {
  state: string;
  tadir: string;
  successors?: { name: string; tadir: string }[];
  conceptNote?: string;
};
const load = (file: string): Record<string, Entry> =>
  JSON.parse(readFileSync(join(process.cwd(), 'lib/abap/generated', file), 'utf-8')).entries ?? {};

const RELEASE = load('cloudification-repo.latest.json');
const CLASSIFICATION = load('cloudification-repo.classifications-sap.json');
/** Same rule as `catalog-index.ts`: only a plain name is a routable slug. */
const ROUTABLE = /^[A-Z0-9_]+$/;

test.describe('7.9 — a catalog object has two dimensions, and the successor belongs to both', () => {
  test('CL_HTTP_UTILITY: classic API, not to be released, successor named', () => {
    const d = getObjectDimensions('CL_HTTP_UTILITY');

    // The two halves, apart. This is the whole point of the step: one letter
    // cannot say both of these, and it only ever said one.
    expect(d.classificationState, 'classic ABAP may use it').toBe('classicAPI');
    expect(d.releaseState, 'ABAP Cloud may not').toBe('notToBeReleased');
    expect(d.graded.classicView).toBe('classic-api');
    expect(d.graded.cloudView).toBe('not-usable');

    // And the third fact, which is what makes the verdict actionable.
    expect(d.successors.map((s) => s.name)).toContain('CL_WEB_HTTP_UTILITY');
    expect(d.successorSource).toBe('release');

    // The letter is unchanged — the target reference, not a merge summary.
    expect(d.graded.grade, 'the grade is the clean core target reference').toBe('D');
    expect(d.graded.provenance).toBe('catalog');
  });

  test('a successor that only the classification file names is still named', () => {
    // 225 objects live only in the classification file and carry a successor
    // there. `resolveApi()` speaks for the release-file mapping layer and
    // cannot see them, which is exactly why the dimensions read both files.
    const classificationOnly = Object.entries(CLASSIFICATION).filter(
      ([name, e]) => !RELEASE[name] && (e.successors?.length ?? 0) > 0,
    );
    expect(classificationOnly.length).toBeGreaterThan(200);

    const [name, entry] = classificationOnly[0];
    expect(resolveApi(name), 'the release-file layer knows nothing about it').toBeUndefined();

    const d = getObjectDimensions(name);
    expect(d.successors.map((s) => s.name)).toContain(entry.successors![0].name);
    expect(d.successorSource, 'and the page must be able to say which file said so').toBe(
      'classification',
    );
  });

  test('deprecated without a successor is marked as a check, not sold as a verdict', () => {
    const deprecated = Object.entries(RELEASE).filter(([, e]) => e.state === 'deprecated');
    const withoutSuccessor = deprecated.filter(
      ([, e]) => !e.successors?.length && !e.conceptNote,
    );
    // Counted, not asserted as a constant: the point is that this is a large
    // share of the deprecated objects, not that it is exactly 183 forever.
    expect(withoutSuccessor.length).toBeGreaterThan(100);

    const [flagged] = withoutSuccessor[0];
    const d = getObjectDimensions(flagged);
    expect(d.needsCheck, `${flagged} is deprecated with nothing to move to`).toBe(true);
    expect(d.checkNote).toBeTruthy();
    expect(d.graded.grade, 'the level itself is unchanged — the rule is not touched here').toBe('D');

    // A deprecated object WITH a successor is a finished answer, not a check.
    const withSuccessor = deprecated.find(([, e]) => (e.successors?.length ?? 0) > 0);
    expect(withSuccessor, 'fixture: the release file must still carry one').toBeTruthy();
    expect(getObjectDimensions(withSuccessor![0]).needsCheck).toBe(false);
  });
});

test.describe('20fe6d7b4308 — the classification file is part of "no released API path"', () => {
  /** noAPI, only in the classification file, nothing to move to. */
  const orphanedNoApi = Object.entries(CLASSIFICATION).filter(
    ([name, e]) =>
      !RELEASE[name] && e.state === 'noAPI' && !e.successors?.length && !e.conceptNote,
  );

  test('the set exists and is the size the finding measured', () => {
    expect(orphanedNoApi.length).toBeGreaterThan(300);
    const routable = orphanedNoApi.filter(([name]) => ROUTABLE.test(name));
    expect(routable.length).toBeGreaterThan(300);
    // Overwhelmingly BAPIs — the objects custom code calls by name.
    const funcs = orphanedNoApi.filter(([, e]) => e.tadir === 'FUNC');
    expect(funcs.length).toBeGreaterThan(orphanedNoApi.length / 2);
  });

  test('every one of them now answers "no released API path"', () => {
    const missed = orphanedNoApi.filter(([name]) => !hasNoReleasedApiPath(name));
    expect(
      missed.map(([n]) => n).slice(0, 5),
      'objects SAP does not intend for customer use',
    ).toEqual([]);
    for (const [name] of orphanedNoApi) expect(NO_PATH_OBJECTS.has(name)).toBe(true);
  });

  test('a noAPI object WITH a named successor is not claimed to have no path', () => {
    const withSuccessor = Object.entries(CLASSIFICATION).filter(
      ([name, e]) => !RELEASE[name] && e.state === 'noAPI' && (e.successors?.length ?? 0) > 0,
    );
    expect(withSuccessor.length).toBeGreaterThan(50);
    for (const [name] of withSuccessor.slice(0, 20)) {
      expect(hasNoReleasedApiPath(name), `${name} has a replacement SAP names`).toBe(false);
    }
  });

  test('a documented classicAPI is not swept in with them', () => {
    const classic = Object.entries(CLASSIFICATION).filter(
      ([name, e]) => !RELEASE[name] && e.state === 'classicAPI',
    );
    expect(classic.length).toBeGreaterThan(1000);
    for (const [name] of classic.slice(0, 50)) {
      expect(hasNoReleasedApiPath(name), `${name} is a documented classic API (level B)`).toBe(
        false,
      );
    }
  });

  /**
   * The reachable effect, end to end: the same row the risk matrix renders.
   *
   * Before the fix `hasNoReleasedApiPath` returned false for this object, so
   * `deriveFeasibility` returned `clean-core-ready` and heavy usage put it in
   * the green `prioritize` quadrant — "go and move this one" for an object SAP
   * does not carry for customer use. The first half of the test pins that old
   * lookup as a stub, so the difference is visible rather than claimed.
   */
  test('an SCMON import no longer calls a noAPI BAPI clean-core-ready', () => {
    const [victim] = orphanedNoApi.find(([, e]) => e.tadir === 'FUNC')!;

    const report = {
      source: 'SCMON',
      records: [
        { objectName: victim, callCount: 90_000, lastUsed: '2026-09-01', source: 'SCMON' },
        { objectName: 'ZOTHER_ONE', callCount: 10, lastUsed: '2026-09-01', source: 'SCMON' },
        { objectName: 'ZOTHER_TWO', callCount: 20, lastUsed: '2026-09-01', source: 'SCMON' },
      ],
      warnings: [],
      window: { from: '2025-08-01', to: '2026-09-01', days: 396 },
    } as never;
    const evidence = {
      findings: [{ id: 'f0', objectName: victim, severity: 'Medium', kind: 'call' }],
    } as never;
    const rowFor = (hasNoPath: (n: string) => boolean) =>
      joinUsageWithEvidence(report, evidence, {} as never, hasNoPath).find(
        (r) => r.objectName === victim,
      )!;

    const before = rowFor(() => false); // the behaviour the finding describes
    expect(before.feasibility).toBe('clean-core-ready');
    expect(before.quadrant).toBe('prioritize');

    const after = rowFor(hasNoReleasedApiPath);
    expect(after.feasibility, 'the engine must not claim a path it never looked for').toBe(
      'no-released-api-path',
    );
    expect(after.quadrant).toBe('danger');
  });
});
