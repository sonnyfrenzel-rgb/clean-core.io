import { test, expect } from '@playwright/test';
import {
  compareAll,
  compareCase,
  forbiddenViolations,
  readCases,
  readForbiddenConclusions,
  readWithEngine,
  ENGINE_PRODUCER,
  NO_PRODUCER,
  PROBE_PRODUCERS,
  type ClassResult,
  type SkeletonMutation,
  type StatementProducer,
} from './helpers/korpus-comparison';
import type { SkeletonEdge, SkeletonNode, ProcessSkeleton } from '../lib/abap/process-skeleton';

/**
 * Sensitivity probe of the corpus comparator (roadmap 1.9).
 *
 * A comparator that stays green when the engine's answer is falsified measures
 * nothing — and that is exactly how things stood until 22.09.2026:
 * `compareSkeleton` called `buildProcessFacts` and compared line by line
 * against branches and blocks, neither node kind nor edge. A change to the
 * skeleton could not turn red there.
 *
 * This file turns the question around: it falsifies **what was read**, not
 * the engine (`lib/` is not touched), and insists that every falsification
 * turns red in the `skelett` facet. If one of these tests fails, it is not the
 * engine that is broken, but the comparator that has gone blind.
 *
 * **What these probes are not.** Roadmap 1.9 names "the six mutants M01–M06
 * of the counter-review". They sit in the private review package
 * `clean-core-review-c5085bb.zip` (§15) and **not in this repository**; a
 * search over `tests/`, `docs/` and `scripts/` finds them nowhere. Rebuilding
 * them here at our own discretion would mean carrying six invented probes
 * under their name and measuring acceptance against our own invention. The
 * seven probes below are therefore our own, named falsifications; M01–M06
 * stay open until the review package is available.
 */

type Probe = {
  name: string;
  why: string;
  mutate: SkeletonMutation;
  /**
   * Set to `false` when the falsification **can** no longer bring down an
   * agreeing case, because none of the green cases still contains the
   * construct. The probe then measures that the comparator sees the
   * falsification at all — weaker, and with a justification on the probe
   * that says why.
   */
  green?: false;
};

const withNodes = (skeleton: ProcessSkeleton, nodes: SkeletonNode[]): ProcessSkeleton => ({ ...skeleton, nodes });
const withEdges = (skeleton: ProcessSkeleton, edges: SkeletonEdge[]): ProcessSkeleton => ({ ...skeleton, edges });

const PROBES: Probe[] = [
  {
    name: 'S1 — the loop-back edge becomes an ordinary sequence',
    why: 'Without `loop-back`, a loop in the export is a thread that points backwards, not a cycle (2.17 b).',
    // **Since roadmap 2.17 (b) this probe can no longer bring down a green
    // case, and that is measured, not assumed.** A `LOOP AT` over a table
    // whose body does not leave the block is no longer a loop with a loop-back
    // edge but a multi-instance activity that contains its body. Exactly four
    // `loop-back` edges remain in the corpus, in CC-030 and CC-048 — neither
    // agrees in the `skelett` facet anyway. Of the 16 green cases, **none**
    // still carries a loop node; the only one that did was CC-007, and it
    // went to `disagree` itself with 2.17 (b) (see `tests/korpus/baseline.json`).
    // The probe therefore measures that the comparator still sees the
    // falsification at all. Making it green here by putting a different
    // falsification under the same name would measure the sensitivity probe
    // against our own invention — exactly what the head of this file forbids.
    green: false,
    mutate: (skeleton) =>
      withEdges(
        skeleton,
        skeleton.edges.map((edge) => (edge.kind === 'loop-back' ? { ...edge, kind: 'sequence' } : edge)),
      ),
  },
  {
    name: 'S2 — every gateway becomes an activity',
    why: 'Exactly the change 2.15 makes to technical gateways: it has to become visible in the corpus.',
    mutate: (skeleton) =>
      withNodes(
        skeleton,
        skeleton.nodes.map((node) => (node.kind === 'gateway' ? { ...node, kind: 'task' } : node)),
      ),
  },
  {
    name: 'S3 — the read node disappears',
    why: 'A vanished data store is the kind of loss a traffic light has to report.',
    mutate: (skeleton) => withNodes(skeleton, skeleton.nodes.filter((node) => node.kind !== 'read')),
  },
  {
    name: 'S4 — the conditional edge loses its condition',
    why: 'A decision without conditional outgoing flows is no longer a decision.',
    mutate: (skeleton) =>
      withEdges(
        skeleton,
        skeleton.edges.map((edge) => (edge.kind === 'conditional' ? { ...edge, kind: 'sequence' } : edge)),
      ),
  },
  {
    name: 'S5 — every anchor slips by three lines',
    why: 'The anchor is half of a node\'s identity (rule 7); a slipped anchor is false evidence.',
    mutate: (skeleton) =>
      withNodes(
        skeleton,
        skeleton.nodes.map((node) =>
          node.anchor
            ? { ...node, anchor: { ...node.anchor, lineStart: node.anchor.lineStart + 3, lineEnd: node.anchor.lineEnd + 3 } }
            : node,
        ),
      ),
  },
  {
    name: 'S6 — an edge is missing',
    why: 'The flow is what the skeleton says; a missing flow silently breaks the process into pieces.',
    mutate: (skeleton) => withEdges(skeleton, skeleton.edges.slice(1)),
  },
  {
    name: 'S7 — the end node disappears',
    why: 'A process without an end is no process in BPMN, and the corpus draws an end for every termination.',
    mutate: (skeleton) => withNodes(skeleton, skeleton.nodes.filter((node) => node.kind !== 'end')),
  },
];

const BASE = compareAll().filter((result) => result.class === 'skelett');
const GREEN = new Set(BASE.filter((result) => result.state === 'agree').map((result) => result.case));

test('the undisturbed run has something green at all that can turn red', () => {
  expect(GREEN.size, 'without a single agreeing case this probe measures nothing').toBeGreaterThan(5);
});

const BASE_BY_CASE = new Map(BASE.map((result) => [result.case, result]));

for (const probe of PROBES) {
  test(`${probe.name} turns red in the skelett facet`, () => {
    const mutated = compareAll(probe.mutate).filter((result) => result.class === 'skelett');

    if (probe.green === false) {
      // No green case carries the construct any more. What is measured is that
      // the comparator sees the falsification: at least one case reports
      // something different after the falsification than before.
      const moved = mutated.filter((result) => {
        const before = BASE_BY_CASE.get(result.case);
        return before != null && (before.state !== result.state || before.evidence !== result.evidence);
      });
      expect(
        moved.map((result) => result.case),
        `${probe.why}\nThe comparator no longer sees this falsification in a single case — neither in ` +
          `an agreeing one nor in a disagreeing one. Then this probe measures nothing.`,
      ).not.toEqual([]);
      return;
    }

    const fell = mutated.filter((result) => GREEN.has(result.case) && result.state === 'disagree');
    expect(
      fell.length,
      `${probe.why}\nNot a single agreeing case has fallen — the comparator does not see this ` +
        `falsification. That is a defect in tests/helpers/korpus-comparison.ts, not in lib/abap/.`,
    ).toBeGreaterThan(0);
  });
}

// ---------------------------------------------------------------------------
// The same question to the `fachsaetze` facet (roadmap 17.5)
// ---------------------------------------------------------------------------

/**
 * Until 23.09.2026 the `fachsaetze` facet had the same problem as `skelett`
 * before 1.9 — worse, in fact: it was hard-wired to `disagree` and did not
 * compare the content at all. "0 agree / 68 disagree" therefore did not mean
 * "the product fails" but "nothing was compared".
 *
 * These probes answer the acceptance question from 17.5: **does the number
 * move when the producer is changed, and does the facet turn red when it gets
 * worse?** The probes' producer is `PROBE_PRODUCERS.echo` — it copies the case
 * book and is explicitly not a producer of the product; without it there would
 * be nothing that could turn red, because today nobody produces business
 * statements.
 */
type StatementProbe = {
  name: string;
  why: string;
  producer: StatementProducer;
  /** Set to `true` when this probe must deliberately **not** turn red. */
  stayGreen?: true;
};

const drop = (text: string) => text.split(' ').slice(0, -2).join(' ');

const STATEMENT_PROBES: StatementProbe[] = [
  {
    name: 'F0 — the same statement, shortened by two words (counter-probe, must stay green)',
    why: 'A measure that penalises every rewording measures the word choice, not the statement.',
    producer: PROBE_PRODUCERS.echo(drop),
    stayGreen: true,
  },
  {
    name: 'F1 — every statement moves three lines on',
    why: 'The anchor is the key; a statement at the wrong ABAP statement is false evidence, however good it sounds.',
    producer: PROBE_PRODUCERS.echo(undefined, 3),
  },
  {
    name: 'F2 — the neighbour\'s statement sits at its own anchor',
    why: 'Correctly anchored, wrongly said: exactly the error a pure anchor check never saw.',
    producer: {
      name: 'probe:nachbarsatz',
      note: 'Sensitivity probe — shifts the texts against the anchors.',
      produce: (korpusCase) => {
        const statements = korpusCase.expected.businessStatements;
        return statements.map((statement, index) => ({
          id: `G-${statement.id}`,
          text: statements[(index + 1) % statements.length].text ?? '',
          anchors: statement.anchors.map((anchor) => ({ file: anchor.file, line: anchor.line })),
        }));
      },
    },
  },
  {
    name: 'F3 — every second statement is dropped',
    why: 'A producer that silently leaves out half has not agreed — it has kept silent.',
    producer: PROBE_PRODUCERS.echo(undefined, 0, (index) => index % 2 === 0),
  },
  {
    name: 'F4 — every statement becomes the executive summary',
    why:
      'That is what `lib/analysis-prompt.ts` orders from the model today: a "business executive summary" instead of ' +
      'the anchored single statement. This probe measures the difference 17.6 is about.',
    producer: PROBE_PRODUCERS.echo(() => 'Das Programm verarbeitet Daten und gibt ein Ergebnis aus.'),
  },
];

const fachsaetze = (results: ClassResult[]) => results.filter((result) => result.class === 'fachsaetze');
const green = (results: ClassResult[]) => new Set(fachsaetze(results).filter((r) => r.state === 'agree').map((r) => r.case));
const compared = (results: ClassResult[]) => fachsaetze(results).reduce((sum, r) => sum + r.scope.compared, 0);
const hits = (results: ClassResult[]) =>
  fachsaetze(results).reduce((sum, r) => sum + (r.aspects.find((a) => a.name === 'fachsatzinhalt')?.compared ?? 0), 0);

// **Since 17.7 the default is the engine producer.** The empty state is
// therefore requested explicitly: it is still the zero point this probe
// measures against, but no longer the normal run.
const NO_PRODUCER_RUN = compareAll(undefined, NO_PRODUCER);
const ECHO_RUN = compareAll(undefined, PROBE_PRODUCERS.echo());

test('the number moves when the producer is changed', () => {
  // The acceptance condition from 17.5, as a measurement: zero without a
  // producer, the upper bound with the expected-answer echo. Since 17.7 the
  // engine's measured state sits in between, in `tests/korpus/baseline.json`.
  expect(compared(NO_PRODUCER_RUN), 'without a producer nothing may count as compared').toBe(0);
  expect(hits(NO_PRODUCER_RUN), 'without a producer there may be no hit').toBe(0);
  expect(green(NO_PRODUCER_RUN).size, 'without a producer no case may be green').toBe(0);

  expect(compared(ECHO_RUN), 'with a producer the number has to move').toBeGreaterThan(150);
  expect(hits(ECHO_RUN)).toBe(compared(ECHO_RUN));
  expect(green(ECHO_RUN).size, 'a perfect producer has to be able to turn green').toBeGreaterThan(60);
});

for (const probe of STATEMENT_PROBES) {
  test(`${probe.name}`, () => {
    const mutated = compareAll(undefined, probe.producer);
    const before = green(ECHO_RUN);
    const after = green(mutated);

    if (probe.stayGreen) {
      const lost = [...before].filter((id) => !after.has(id));
      expect(
        lost.join(', '),
        `${probe.why}\nThese cases have fallen although the statement stayed the same.`,
      ).toEqual('');
      return;
    }

    const fell = [...before].filter((id) => !after.has(id));
    expect(
      fell.length,
      `${probe.why}\nNot a single agreeing case has fallen — the facet does not see this ` +
        `deterioration. That is a defect in tests/helpers/korpus-comparison.ts.`,
    ).toBeGreaterThan(0);
  });
}

// ---------------------------------------------------------------------------
// Forbidden statements: the hallucination measurement (roadmap 17.9)
// ---------------------------------------------------------------------------

/**
 * The same question a third time, and this time against **invention**: does
 * the facet see it when a producer says exactly what the case explicitly
 * forbids?
 *
 * The corpus carries 197 forbidden statements in 47 of 68 cases. The probe
 * `PROBE_PRODUCERS.forbidden` first copies the case book — coverage and
 * content thus stay intact, and whatever falls really falls because of the
 * forbidden statement — and then additionally says every derivable core at
 * its own anchor.
 */
const FORBIDDEN_RUN = compareAll(undefined, PROBE_PRODUCERS.forbidden());

const forbiddenAspect = (result: ClassResult) => result.aspects.find((a) => a.name === 'verbotene-aussagen');

test('V1 — a producer that says a forbidden statement turns the facet red', () => {
  const before = green(ECHO_RUN);
  const after = green(FORBIDDEN_RUN);
  const fell = [...before].filter((id) => !after.has(id));
  expect(
    fell.length,
    'Not a single agreeing case has fallen, although the producer says verbatim what the case ' +
      'forbids. Then the sub-check "verbotene-aussagen" measures nothing.',
  ).toBeGreaterThan(20);

  // And **because of** the forbidden statement: coverage and content are
  // unchanged in this probe, because it supplies the expected statements too.
  expect(hits(FORBIDDEN_RUN), 'the probe damaged the content — then its red proves nothing').toBe(
    hits(ECHO_RUN),
  );
  const stillPassing = fachsaetze(FORBIDDEN_RUN).filter((result) => {
    const aspect = forbiddenAspect(result);
    return aspect != null && aspect.status === 'compared' && aspect.compared > 0;
  });
  expect(
    stillPassing.map((r) => `${r.case}: ${forbiddenAspect(r)?.compared}/${forbiddenAspect(r)?.total}`).join('\n'),
    'Every comparable forbidden statement was said verbatim; none may count as observed.',
  ).toEqual('');
});

test('V2 — the case book does not violate itself (the calibration of core extraction)', () => {
  // The counter-probe to the rule that forms the **core** of a forbidden
  // statement (`forbiddenCores`): if it were too lenient, it would hit the
  // expected statements of the same case — they speak about the same lines,
  // with the same identifiers, about the same topic. The expected-answer
  // echo producer says exactly the 173 expected statements; not a single
  // forbidden statement may trigger.
  const violated = fachsaetze(ECHO_RUN).filter((result) => {
    const aspect = forbiddenAspect(result);
    return aspect != null && aspect.status === 'compared' && aspect.compared < aspect.total;
  });
  expect(
    violated.map((result) => `  ${result.case}: ${result.evidence}`).join('\n'),
    'An expected statement of the case book triggers against a forbidden statement of the same case. Either the ' +
      'core extraction in forbiddenCores is too lenient — then it is justified more narrowly, the threshold is not ' +
      'moved — or the case book contradicts itself.',
  ).toEqual('');
});

test('V4 — the probe says every core of a forbidden statement, not just the first', () => {
  // QA review of 4b4586aff273: the probe said only `cores[0]`, and a
  // regression that no longer recognises a later core went unnoticed.
  const probe = PROBE_PRODUCERS.forbidden();
  let multiCore = 0;
  for (const korpusCase of readCases()) {
    const reading = readWithEngine(korpusCase, undefined, probe);
    const said = reading.businessStatements.filter((statement) => (statement.id ?? '').startsWith('V-'));
    const conclusions = readForbiddenConclusions(korpusCase).filter((entry) => entry.cores.length > 0);
    multiCore += conclusions.filter((entry) => entry.cores.length > 1).length;
    const cores = conclusions.flatMap((entry) => entry.cores);
    expect(said.map((statement) => statement.text), korpusCase.id).toEqual(cores);
    // Every single core triggers on its own, at its own statement.
    const violations = forbiddenViolations(conclusions, reading);
    for (const statement of said) {
      expect(
        violations.some((v) => v.statementId === statement.id && v.core === statement.text),
        `${korpusCase.id}: the core «${statement.text}» was said and not recognised`,
      ).toBe(true);
    }
  }
  expect(multiCore, 'no case has a forbidden statement with more than one core — then V4 checks nothing').toBeGreaterThan(0);
});

test('V5 — a case without an expected business statement is also measured against its forbidden statements', () => {
  // QA review of 4b4586aff273: the branch without an expected business
  // statement returned before the check, and a forbidden statement that was
  // said stayed unchecked.
  const korpusCase = readCases().find((c) => readForbiddenConclusions(c).some((entry) => entry.cores.length > 0));
  expect(korpusCase, 'no case with a comparable forbidden statement').toBeTruthy();
  if (!korpusCase) return;
  const withoutStatements = { ...korpusCase, expected: { ...korpusCase.expected, businessStatements: [] } };
  const result = compareCase(withoutStatements, readWithEngine(withoutStatements, undefined, PROBE_PRODUCERS.forbidden()))
    .find((r) => r.class === 'fachsaetze');
  const aspect = result ? forbiddenAspect(result) : undefined;
  expect(aspect?.status).toBe('compared');
  expect(aspect?.total).toBeGreaterThan(0);
  expect(aspect?.compared, 'every forbidden statement was said; none may count as observed').toBe(0);
  expect(result?.verdict).toBe('engine-defekt');
});

test('V3 — the product\'s producer states its number', () => {
  // Not an acceptance threshold but a ratchet: the number is **reported**
  // and recorded per case in `tests/korpus/baseline.json`. If it rises, that
  // is a finding against the producer — and no reason to move the bound or
  // the threshold (roadmap 17.9).
  const run = compareAll(undefined, ENGINE_PRODUCER);
  const aspects = fachsaetze(run).map(forbiddenAspect);
  const total = aspects.reduce((sum, a) => sum + (a?.total ?? 0), 0);
  const kept = aspects.reduce((sum, a) => sum + (a?.compared ?? 0), 0);
  const checked = aspects.filter((a) => a?.status === 'compared').length;
  expect(total, 'the corpus no longer carries comparable forbidden statements').toBeGreaterThan(150);
  expect(checked, 'not a single case was measured against a forbidden statement').toBeGreaterThan(40);
  expect(
    total - kept,
    `The engine producer violates ${total - kept} of ${total} comparable forbidden statements.`,
  ).toBeLessThanOrEqual(4);
});

test('the four other facets do not move when only the producer changes', () => {
  // A producer for business statements must change nothing in `befunde`,
  // `level`, `objekte` and `skelett`; if it did, the seam would leak.
  const key = (result: ClassResult) => `${result.case}|${result.class}|${result.state}|${result.verdict}`;
  const other = (results: ClassResult[]) => results.filter((r) => r.class !== 'fachsaetze').map(key);
  expect(other(ECHO_RUN)).toEqual(other(NO_PRODUCER_RUN));
  // The hallucination probe from 17.9 must not touch the four others either.
  expect(other(FORBIDDEN_RUN)).toEqual(other(NO_PRODUCER_RUN));
});
