import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The status meter measures, and it does not invent.
 *
 * `docs/ROADMAP.md` lists steps and **no status** — the last column is a size
 * estimate. So on 23.09.2026 nobody could say how far along 3.0 was.
 * `scripts/roadmap/status.mjs` derives the state from the two sources that are
 * maintained anyway: the commit subjects and the roadmap itself.
 *
 * Derived rather than maintained, because a status column kept by hand drifts.
 * But a meter that counts wrong is worse than none: it looks like an answer.
 * What is held here is therefore the measurement itself — not its result,
 * which is meant to change with every commit.
 */
const ROOT = path.resolve(__dirname, '..');
const lib = () => import(path.resolve(ROOT, 'scripts/roadmap/status.mjs'));
const roadmap = () => fs.readFileSync(path.resolve(ROOT, 'docs/ROADMAP.md'), 'utf8');

test.describe('the status meter', () => {
  test('sees every step of the roadmap, and none that does not exist', async () => {
    const { readSteps } = await lib();
    const source = roadmap();
    const seen = readSteps(source).map((s: { id: string }) => s.id);

    // The counter-check reads the same file with a different expression: a
    // table row that begins with a step number. Two roads to the same set — a
    // parser that swallows a row shows up here.
    // Two OR three numeric parts — the same rule as in the instrument. Until
    // 23.09.2026 this line carried the same blind spot as the parser it
    // guards: both demanded exactly two parts, so the ten steps 3.0.1–3.0.10
    // dropped out of counting and checking without anything turning red.
    // A guard that shares the assumption of what it checks does not check it.
    const expected = (source.match(/^\|\s*\d+(?:\.\d+){1,2}\s*\|/gm) || []).map((m) => m.replace(/[|\s]/g, ''));
    expect(seen.sort()).toEqual(expected.sort());
    expect(seen.length, 'the roadmap has no steps any more — that is not a success, it is a parser error').toBeGreaterThan(50);
  });

  test('every step gets its section, none ends up in no man\'s land', async () => {
    const { readSteps } = await lib();
    const orphans = readSteps(roadmap()).filter((s: { section: string }) => s.section === '(ohne Abschnitt)');
    expect(orphans.map((s: { id: string }) => s.id), 'these steps hang under no heading').toEqual([]);
  });

  test('a commit subject with several steps counts for each of them', async () => {
    const { idsFromSubjects } = await lib();
    // The form really exists: `feat(1.9, 7.8, 3.3): der Korpus misst endlich …`.
    // A parser that takes only the first reports two built steps as open.
    const found = idsFromSubjects([
      'feat(1.9, 7.8, 3.3): der Korpus misst endlich das Skelett',
      'test(5.6): die Leseabnahme über alle Projektrouten',
      'docs(qa): warum eine Widerlegung nicht mehr greift',
      'chore(release): v2.14.0',
    ]);
    expect([...found.keys()].sort()).toEqual(['1.9', '3.3', '5.6', '7.8']);
    // A subject without a step number brings none — `v2.14.0` is a version.
    expect(found.has('2.14')).toBe(false);
  });

  test('"gebaut wird" (is being built) is an intention, not a report', async () => {
    const { claimsBuilt } = await lib();
    expect(claimsBuilt('**Gebaut 16.09.2026 (`dev`):** der Modellaufruf ist ein Abschnitt')).toBe(true);
    expect(claimsBuilt('**Gebaut in v2.10.3**')).toBe(true);
    // The English roadmap (3.0.14) reports with the same forms in English.
    expect(claimsBuilt('**Built 16.09.2026 (`dev`):** the model call is a section')).toBe(true);
    expect(claimsBuilt('**Built in v2.10.3**')).toBe(true);
    expect(claimsBuilt('**Shipped in v2.12.0**')).toBe(true);
    expect(claimsBuilt('what is still to be built is named')).toBe(false);
    expect(claimsBuilt('built to [`DESIGN.md`]')).toBe(false);
    expect(claimsBuilt('fixed (dev) — the same defect as UX-012')).toBe(false);
    // And the three German forms that must not count: an intention, a reference,
    // and the word from the finding tables in §12–§14, which belongs to a finding
    // and not to a step.
    expect(claimsBuilt('was noch gebaut wird, wird benannt')).toBe(false);
    expect(claimsBuilt('gebaut nach [`DESIGN.md`]')).toBe(false);
    expect(claimsBuilt('behoben (dev) — derselbe Defekt wie UX-012')).toBe(false);
  });

  test('a step that a commit names counts as evidenced — and the source is stated', async () => {
    const { buildStatus } = await lib();
    const markdown = ['### Phase 9 — v9.9 „Probe"', '| 9.1 | etwas | M |', '| 9.2 | **Gebaut 01.01.2026** etwas | M |', '| 9.3 | etwas | M |'].join('\n');
    const steps = buildStatus(markdown, ['feat(9.1): gebaut']);
    expect(steps.map((s: { id: string; state: string }) => [s.id, s.state])).toEqual([
      ['9.1', 'belegt'],
      ['9.2', 'behauptet'],
      ['9.3', 'offen'],
    ]);
    // The source is the point: "belegt" (evidenced) names the commit, "behauptet" (claimed) cannot.
    expect(steps[0].commit).toBe('feat(9.1): gebaut');
    expect(steps[1].commit).toBeNull();
  });
});
