import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from './helpers/test';
import { measure, readBusiness, total, type Readability } from './helpers/business-readability';
import { EXAMPLES_DIR } from './helpers/starter-example-files';
import { ENGINE_READS_350_FROM } from '../lib/abap/engine-reads-350-gate';

/**
 * The readability ratchet of the Business view over the seven examples the site offers (concept
 * "Business-Lesbarkeit" §4.2, 05.11.2026). Deterministic, server-free: the measure is
 * `tests/helpers/business-readability.ts`; the same measure runs over the LEARN half of the process benchmark with
 * `tests/prozess-benchmark/lesbarkeit.ts`.
 *
 * A ceiling may only go down and a floor only up. When a change makes the Business view read better, lower the
 * ceiling to the new count in the same commit; when a change makes it read worse, the change is wrong — or, where the
 * new wording is intended, the commit says which count moved and why.
 *
 * Baseline (engine 3.0.21, recorded 06.11.2026) beside the reading from 3.5.0:
 *
 *   surface     n     3.0.21                              3.5.0
 *   tasks       146/145 raw 4, empty 4, technical 6, dup 9   raw 4, empty 4, technical 6, dup 8
 *   gateways    48    positive 36, empty 3, raw 1           positive 47, empty 2, raw 1
 *   in short    30    untrue 0                              untrue 0
 *
 * H5, the dictionary (`lib/abap/sap-dictionary.ts`, owner decision 06.11.2026), measured with its words in the lexicon:
 *
 *   surface     before H5             after H5
 *   gateways    raw 1                 raw 0
 *   rules       raw 7                 raw 6
 *   questions   raw 9                 raw 5
 *
 * Rule titles and questions with the dictionary too (a constant's name: "Weight unit G", not "Gewei G"):
 *
 *   rules       raw 6 -> 5            questions   raw 5 -> 4
 *
 * With the engine-quality readings of 3.5.0 merged (flag steps, helper calls, calculations, loop starts; the map is
 * now built for the engine read for), the examples draw 159 steps and 50 decision points instead of 145 and 48. The
 * new steps are phrased ("Approved without limit check (central warehouse)", "Mark as approved", "Note: could not
 * insert risk review task"); what moved, and why:
 *
 *   tasks raw 4 -> 6        "Set status to NO_QUOTE" (a value said as the code writes it) and one customer table
 *   tasks technical 6 -> 9  "Note in the run log" for a log helper that is an arm's only step (it cannot fold)
 *   gateways raw 0 -> 1     "Role DEPT_HEAD?" — a new decision on a value, which the measure counts as a name
 *   gateways positive 47 -> 49 of 50
 */

const ENGINE = ENGINE_READS_350_FROM;

let measured: Readability | null = null;
function examples(): Readability {
  if (measured) return measured;
  const all = fs.readdirSync(EXAMPLES_DIR).sort().map((file) => {
    const source = fs.readFileSync(path.join(EXAMPLES_DIR, file), 'utf8');
    return measure(readBusiness(source, file, ENGINE));
  });
  measured = total(all);
  return measured;
}

test.describe('Business readability of the seven examples — never worse (engine 3.5.0)', () => {
  test('BPMN steps: raw names, empty formulas, technique, duplicates', () => {
    const t = examples().tasks;
    expect(t.n).toBeGreaterThan(100);
    expect(t.raw, 'steps with a raw identifier').toBeLessThanOrEqual(6);
    expect(t.empty, 'steps that say nothing').toBeLessThanOrEqual(4);
    expect(t.technical, 'technical steps').toBeLessThanOrEqual(9);
    expect(t.duplicates, 'same name twice on one level').toBeLessThanOrEqual(8);
    expect(t.levelOneTechnical, 'technical steps on the top level').toBeLessThanOrEqual(2);
  });

  test('decision points: asked positively, no placeholder, no raw identifier', () => {
    const g = examples().gateways;
    expect(g.n).toBeGreaterThan(40);
    expect(g.positive, 'positively asked').toBeGreaterThanOrEqual(49);
    expect(g.empty, 'placeholders ("Which case applies?")').toBeLessThanOrEqual(2);
    expect(g.raw, 'raw identifiers').toBeLessThanOrEqual(1);
  });

  test('ends, story, In short: no raw identifier, nothing untrue about changes', () => {
    const r = examples();
    expect(r.ends.raw).toBeLessThanOrEqual(1);
    expect(r.story.raw).toBe(0);
    expect(r.inShort.raw).toBe(0);
    expect(r.inShort.empty).toBe(0);
    expect(r.inShort.untrue, '"does not post" where a run reaches a write').toBe(0);
  });

  test('rule titles and the questions for the business: no more raw identifiers than today', () => {
    const r = examples();
    expect(r.rules.raw).toBeLessThanOrEqual(5);
    expect(r.questions.raw).toBeLessThanOrEqual(4);
  });

  test('size: no level grows', () => {
    const l = examples().levels;
    expect(l.largest).toBeLessThanOrEqual(18);
    expect(l.over12).toBeLessThanOrEqual(2);
  });
});
