import { test, expect } from '@playwright/test';
import {
  ENGINE_PRODUCER,
  MIN_FORBIDDEN_CORE_TOKENS,
  compareAll,
  compareCase,
  readBaseline,
  readCases,
  readWithEngine,
  resultId,
  PENDING_SKELETON_ASPECTS,
  SKELETON_BRIDGES,
  type ClassResult,
  type FacetAspect,
  type KorpusCase,
  NO_PRODUCER,
  STATEMENT_MATCH_THRESHOLD,
  readForbiddenConclusions,
  statementSimilarity,
  statementTokens,
} from './helpers/korpus-comparison';

/**
 * The facet status of the corpus comparator (roadmap 1.9, CR-05).
 *
 * Counter-review c5085bb charged the corpus traffic light with not checking
 * what it claims, and the numbers bore it out: across the 47 cases that stood
 * at `agree` in the class `skelett`, **71 of 390 expected nodes (18.2 %)**
 * were comparable at all — CC-001 stood green with the reason "2 of 8 nodes
 * comparable" — and `fachsaetze` stood green 68 times with the reason "the
 * engine produces no business statements". A green that means "not checked"
 * is worse than an open disagreement: the agreement figures are read as
 * evidence, and `docs/ROADMAP.md` 2.10 makes "the skeleton agrees" an
 * acceptance condition.
 *
 * This file holds the four commitments from 1.9 — and it holds them against
 * the **live** measurement, not against the baseline: a baseline can be
 * rewritten, a measurement cannot.
 */

const LIVE: ClassResult[] = compareAll();
const BASELINE = readBaseline();

function show(result: ClassResult): string {
  return `  ${result.case} [${result.class}] ${result.scope.compared}/${result.scope.total}\n      ${result.evidence}`;
}

test.describe('no green without coverage', () => {
  test('no agree in skelett below 50 % comparable nodes', () => {
    const thin = LIVE.filter(
      (result) => result.class === 'skelett' && result.state === 'agree' && result.scope.compared * 2 < result.scope.total,
    );
    expect(
      thin.map(show).join('\n'),
      'A case counts as agreeing in the skelett facet only if at least half of its ' +
        'expected nodes were comparable at all. Anything below that is a statement about the scope of the check, ' +
        'not about the engine.',
    ).toEqual('');
  });

  test('no facet is agree without having compared anything', () => {
    const empty = LIVE.filter((result) => result.state === 'agree' && result.scope.compared === 0);
    expect(
      empty.map(show).join('\n'),
      'A count of 0 means nothing was compared. That is never an agreement.',
    ).toEqual('');
  });

  test('the fachsaetze facet never carries "not checked" as green', () => {
    // Up to 17.5 this read "no fachsaetze result is ever green". That was
    // measured correctly and worded wrongly: the facet was hard-wired to
    // `disagree`, and a test that confirms a wiring measures the wiring. The
    // rule that really holds is the one from 1.9: green only if the **content**
    // was compared and coverage is complete. As long as nobody produces
    // business statements (17.6), not a single case falls under it — but what
    // is checked is the rule, not the result.
    const unearned = LIVE.filter((result) => {
      if (result.class !== 'fachsaetze' || result.state !== 'agree') return false;
      const content = result.aspects.find((aspect) => aspect.name === 'fachsatzinhalt');
      return (
        content == null ||
        content.status !== 'compared' ||
        content.compared === 0 ||
        content.compared !== content.total ||
        result.scope.compared !== result.scope.total
      );
    });
    expect(
      unearned.map(show).join('\n'),
      'Green in fachsaetze means: every expected statement had a produced counterpart at the same ABAP statement, ' +
        'and each of them was above the threshold. Anything else is "not checked".',
    ).toEqual('');
    const withoutName = LIVE.filter(
      (result) =>
        result.class === 'fachsaetze' &&
        result.scope.total > 0 &&
        !result.aspects.some((aspect) => aspect.status === 'anchor_validation_passed' || aspect.name === 'ankerpruefung'),
    );
    expect(
      withoutName.map(show).join('\n'),
      'A passed anchor check is called anchor_validation_passed, not "agrees".',
    ).toEqual('');
  });

  test('no reason still claims the engine builds no process skeleton', () => {
    // `lib/abap/process-skeleton.ts` has existed since Phase 2; the sentence
    // stood in every single skeleton result until 22.09.2026 and had been
    // wrong since then.
    const offenders = [
      ...LIVE.filter((result) => /baut kein Prozessskelett|erzeugt kein Prozessskelett/.test(result.evidence)).map(show),
      ...BASELINE.entries
        .filter((entry) => /baut kein Prozessskelett|erzeugt kein Prozessskelett/.test(entry.reason))
        .map((entry) => `  ${entry.case} [${entry.class}] (baseline)`),
    ];
    expect(offenders.join('\n')).toEqual('');
  });
});

test.describe('every facet names count, denominator and check status', () => {
  test('the scope is on every result and in every baseline entry', () => {
    const bad: string[] = [];
    for (const result of LIVE) {
      if (!Number.isInteger(result.scope.compared) || !Number.isInteger(result.scope.total)) {
        bad.push(`  ${resultId(result)}: scope without numbers`);
      }
      if (result.scope.compared > result.scope.total) {
        bad.push(`  ${resultId(result)}: ${result.scope.compared} of ${result.scope.total} — count above the denominator`);
      }
      if (result.aspects.length === 0) bad.push(`  ${resultId(result)}: no sub-check`);
    }
    for (const entry of BASELINE.entries) {
      if (entry.scope == null || entry.aspects == null) bad.push(`  ${resultId(entry)}: baseline entry without scope`);
    }
    expect(bad.join('\n')).toEqual('');
  });

  test('every sub-check carries one of the three check statuses and a justification', () => {
    const allowed = new Set(['compared', 'not_checked', 'anchor_validation_passed']);
    const bad: string[] = [];
    for (const result of LIVE) {
      for (const aspect of result.aspects) {
        if (!allowed.has(aspect.status)) bad.push(`  ${resultId(result)}/${aspect.name}: status "${aspect.status}"`);
        if (aspect.note.length < 20) bad.push(`  ${resultId(result)}/${aspect.name}: justification too thin`);
        if (aspect.status === 'not_checked' && aspect.compared > 0) {
          bad.push(`  ${resultId(result)}/${aspect.name}: "not checked" with count ${aspect.compared}`);
        }
      }
    }
    expect(bad.join('\n')).toEqual('');
  });

  test('the sub-checks for 2.15, 2.16 and 2.17 are in place and honestly say "not checked"', () => {
    // As long as no case names a gateway class, a lane or a parallel node, the
    // expected field is empty. An empty expected field invents no values — it
    // says that nothing was checked here, and it turns red as soon as 2.10
    // supplies the fields and the engine does not serve them.
    const skeleton = LIVE.filter((result) => result.class === 'skelett');
    for (const name of ['gateway-klasse', 'lanes', 'parallelitaet']) {
      const missing = skeleton.filter((result) => !result.aspects.some((aspect) => aspect.name === name));
      expect(missing.map(show).join('\n'), `sub-check "${name}" is missing`).toEqual('');
    }
    const invented = skeleton.flatMap((result) =>
      result.aspects
        .filter((aspect) => ['gateway-klasse', 'lanes', 'parallelitaet'].includes(aspect.name))
        .filter((aspect) => aspect.status === 'compared' && aspect.compared === 0)
        .map((aspect) => `  ${result.case}/${aspect.name}: "compared" without a count`),
    );
    expect(invented.join('\n')).toEqual('');
  });

  test('an expected value from 2.15/2.16/2.17 is not counted as compared', () => {
    // Trigger: QA review of `9e408888bfec`, fingerprint `c100d056f0d2`. Until
    // then the mere **presence** of `gatewayClass`, `lane` or `parallel`
    // raised the facet to `compared` — nothing was compared, and the case
    // stayed green. Today none of the 68 expected.json files carries any of
    // these fields, so the bug would only have become visible with 2.10; this
    // probe anticipates it by slipping exactly one expected value into a real,
    // agreeing case — on the expected answer as read, not on the engine
    // (`lib/` is not touched).
    const green = new Set(
      LIVE.filter((result) => result.class === 'skelett' && result.state === 'agree').map((result) => result.case),
    );
    const cases = readCases().filter((korpusCase) => green.has(korpusCase.id));
    const withGateway = cases.find((korpusCase) =>
      korpusCase.expected.skeleton.nodes.some((node) => node.type === 'gateway'),
    );
    expect(withGateway, 'no agreeing case with a gateway — otherwise the probe measures nothing').toBeTruthy();

    const clone = (korpusCase: KorpusCase): KorpusCase => JSON.parse(JSON.stringify(korpusCase)) as KorpusCase;
    const probes: Array<{ facet: string; why: string; make: (source: KorpusCase) => KorpusCase }> = [
      {
        facet: 'gateway-klasse',
        why: 'The case names a gateway class (2.15); the engine carries no such field.',
        make: (source) => {
          const copy = clone(source);
          const node = copy.expected.skeleton.nodes.find((entry) => entry.type === 'gateway');
          if (node) node.gatewayClass = 'exclusive';
          return copy;
        },
      },
      {
        facet: 'lanes',
        why: 'The case names a lane with evidence (2.16); the skeleton produces no lanes.',
        make: (source) => {
          const copy = clone(source);
          copy.expected.skeleton.lanes = [{ id: 'L1', evidence: 'AUTHORITY-CHECK', anchor: null }];
          return copy;
        },
      },
      {
        facet: 'parallelitaet',
        why: 'The case names a parallel node (2.17); the skeleton knows no parallelism.',
        make: (source) => {
          const copy = clone(source);
          const node = copy.expected.skeleton.nodes[0];
          if (node) node.parallel = true;
          return copy;
        },
      },
    ];

    const bad: string[] = [];
    for (const probe of probes) {
      const source = withGateway as KorpusCase;
      const reading = readWithEngine(source);
      const result = compareCase(probe.make(source), reading).find((entry) => entry.class === 'skelett');
      const aspect = result?.aspects.find((entry) => entry.name === probe.facet);
      if (!aspect) {
        bad.push(`  ${probe.facet}: sub-check is missing`);
        continue;
      }
      if (aspect.status !== 'not_checked' || aspect.compared !== 0) {
        bad.push(
          `  ${probe.facet}: status "${aspect.status}" with count ${aspect.compared}, although nothing was compared. ${probe.why}`,
        );
      }
      if (result?.state === 'agree') {
        bad.push(`  ${probe.facet}: case ${source.id} stays green although an expected value sits beside it unchecked.`);
      }
    }
    expect(bad.join('\n')).toEqual('');
  });

  test('the open sub-checks sit in one named place', () => {
    // The second way out of the finding — really comparing — would not be a
    // comparison today: `lib/abap/process-skeleton.ts` carries neither gateway
    // class nor lane nor parallel marker. Hence the hook point: whoever builds
    // 2.15/2.16/2.17 finds here what there is to replace.
    expect(PENDING_SKELETON_ASPECTS.map((aspect) => aspect.name)).toEqual([
      'gateway-klasse',
      'lanes',
      'parallelitaet',
    ]);
    for (const aspect of PENDING_SKELETON_ASPECTS) {
      expect(aspect.step, `${aspect.name} without a roadmap step`).toMatch(/^2\.1[567]$/);
      expect(aspect.what.length, `${aspect.name} without a description of the expected statement`).toBeGreaterThan(5);
    }
  });

  test('no check status changes unnoticed', () => {
    // The same ratchet as for the verdict, one level down: when 2.15/2.16/2.17
    // raises a sub-check from "not checked" to "compared", that is good news,
    // and it belongs written into the baseline.
    const key = (entry: { case: string; class: string }, aspect: FacetAspect) =>
      `${entry.case}|${entry.class}|${aspect.name}`;
    const recorded = new Map<string, string>();
    for (const entry of BASELINE.entries) {
      for (const aspect of entry.aspects ?? []) recorded.set(key(entry, aspect), aspect.status);
    }
    const changed: string[] = [];
    for (const result of LIVE) {
      for (const aspect of result.aspects) {
        const before = recorded.get(key(result, aspect));
        if (before != null && before !== aspect.status) {
          changed.push(`  ${key(result, aspect)}: recorded ${before}, now ${aspect.status}`);
        }
      }
    }
    expect(
      changed.join('\n'),
      'A check status has changed. Read why, and rewrite the baseline ' +
        '(npx tsx tests/helpers/korpus-baseline-write.ts).',
    ).toEqual('');
  });
});

test.describe('the forbidden statements are compared (roadmap 17.9)', () => {
  const ALL = readCases().map((korpusCase) => ({ id: korpusCase.id, list: readForbiddenConclusions(korpusCase) }));
  const FLAT = ALL.flatMap((entry) => entry.list.map((conclusion) => ({ case: entry.id, conclusion })));

  test('every fachsaetze facet carries the sub-check "verbotene-aussagen"', () => {
    const missing = LIVE.filter(
      (result) => result.class === 'fachsaetze' && !result.aspects.some((aspect) => aspect.name === 'verbotene-aussagen'),
    );
    expect(
      missing.map(show).join('\n'),
      'Without this sub-check the baseline holds no figure against invention — and that is exactly how things stood ' +
        'until 23.09.2026 (roadmap 17.9).',
    ).toEqual('');
  });

  test('core extraction is countable: every statement is comparable or named as not comparable', () => {
    // There is no third category and no silent skipping. Where no core can be
    // formed, the reason sits on the statement (`why`) and the statement drops
    // out of the denominator — it never counts as passed.
    const comparable = FLAT.filter((entry) => entry.conclusion.cores.length > 0);
    const open = FLAT.filter((entry) => entry.conclusion.cores.length === 0);
    expect(comparable.length + open.length).toBe(FLAT.length);
    const silent = open.filter((entry) => entry.conclusion.why.length < 20);
    expect(silent.map((entry) => entry.case).join(', '), 'a non-comparable statement without a reason').toEqual('');
    // Measured on 23.09.2026: 197 statements, 173 with a core, 24 without —
    // the 24 are all classification verdicts ("Kein D", "Nicht A", "kein
    // Unknown") from which no business statement can be formed.
    expect(FLAT.length, 'the corpus no longer carries forbidden statements').toBeGreaterThan(190);
    expect(
      comparable.length,
      `Of ${FLAT.length} forbidden statements only ${comparable.length} have a core.`,
    ).toBeGreaterThan(160);
    for (const entry of comparable) {
      for (const core of entry.conclusion.cores) {
        expect(
          statementTokens(core).size,
          `${entry.case}: the core «${core}» has fewer than ${MIN_FORBIDDEN_CORE_TOKENS} content words`,
        ).toBeGreaterThanOrEqual(MIN_FORBIDDEN_CORE_TOKENS);
      }
    }
  });

  test('a statement without an anchor prefix applies to the whole case and is not skipped', () => {
    // The craft question from 17.9: 39 of the 197 statements carry no
    // `source.abap:NN` prefix. 21 of them name their anchor after a profile
    // reference ("Profil 2, source.abap:1"); 18 really apply to the whole
    // slice. Those are measured against **every** produced statement of the
    // case — otherwise a fifth of the expected value would be silently
    // discounted.
    const wholeSlice = FLAT.filter(
      (entry) => entry.conclusion.anchors.length === 0 && entry.conclusion.cores.length > 0,
    );
    expect(wholeSlice.length, 'not a single statement applies to the whole slice — then this probe measures nothing').toBeGreaterThan(5);

    const sample = wholeSlice[0];
    const korpusCase = readCases().find((entry) => entry.id === sample.case)!;
    const file = korpusCase.sources[0].name;
    const said = {
      name: 'probe:ganze-scheibe',
      note: 'Says a forbidden statement without an anchor prefix at an arbitrary line of the case.',
      produce: () => [{ id: 'V-1', text: sample.conclusion.cores[0], anchors: [{ file, line: 1 }] }],
    };
    const result = compareCase(korpusCase, readWithEngine(korpusCase, undefined, said)).find(
      (entry) => entry.class === 'fachsaetze',
    );
    const aspect = result?.aspects.find((entry) => entry.name === 'verbotene-aussagen');
    expect(
      aspect?.compared,
      `${sample.case}: the statement «${sample.conclusion.cores[0]}» applies to the whole slice and was said ` +
        'verbatim at line 1 — the sub-check still counted it as observed.',
    ).toBeLessThan(aspect?.total ?? 0);
  });

  test('a statement **with** an anchor applies only there — otherwise the anchor would be no condition', () => {
    // The counter-probe to the previous one: the same text at a statement the
    // forbidden sentence does not name is no violation. Without this half the
    // measurement would be a word search over the whole case.
    const anchored = FLAT.find(
      (entry) => entry.conclusion.anchors.length > 0 && entry.conclusion.cores.length > 0,
    )!;
    const korpusCase = readCases().find((entry) => entry.id === anchored.case)!;
    const taken = new Set(anchored.conclusion.anchors.map((anchor) => anchor.line));
    const free = Array.from({ length: korpusCase.sources[0].lineCount }, (_, index) => index + 1).find(
      (line) => !taken.has(line),
    )!;
    const elsewhere = {
      name: 'probe:falscher-anker',
      note: 'Says an anchored forbidden statement at a different statement.',
      produce: () => [
        { id: 'V-1', text: anchored.conclusion.cores[0], anchors: [{ file: korpusCase.sources[0].name, line: free }] },
      ],
    };
    const result = compareCase(korpusCase, readWithEngine(korpusCase, undefined, elsewhere)).find(
      (entry) => entry.class === 'fachsaetze',
    );
    const aspect = result?.aspects.find((entry) => entry.name === 'verbotene-aussagen');
    expect(
      aspect?.compared,
      `${anchored.case}: the same text at line ${free} instead of ${[...taken].join('/')} was counted as a violation ` +
        '— then the anchor is no longer a condition.',
    ).toBe(aspect?.total);
  });
});

test.describe('the skeleton bridges can be looked up', () => {
  test('every bridge names a node kind, a construct and a justification', () => {
    for (const bridge of SKELETON_BRIDGES) {
      expect(bridge.kinds.length, `${bridge.type} without an engine node kind`).toBeGreaterThan(0);
      expect(bridge.why.length, `${bridge.type} without a justification`).toBeGreaterThan(40);
      expect(bridge.construct.source.length, `${bridge.type} without a construct`).toBeGreaterThan(2);
    }
  });

  test('the comparison touches the real skeleton', () => {
    // The finding that triggered 1.9: the skelett facet called
    // `buildProcessFacts` and never `buildProcessSkeleton`. A facet that never
    // calls the module under test cannot catch a change to it — and 2.15,
    // 2.16 and 2.17 build on exactly that.
    const skeleton = LIVE.filter((result) => result.class === 'skelett');
    const compared = skeleton.reduce((sum, result) => sum + result.scope.compared, 0);
    const total = skeleton.reduce((sum, result) => sum + result.scope.total, 0);
    expect(total, 'the corpus no longer carries skeleton nodes').toBeGreaterThan(400);
    // 18.2 % was the state before 1.9. The threshold is deliberately far below
    // the measured value: it holds the regression, not the optimum.
    expect(compared / total, `only ${compared} of ${total} expected nodes comparable`).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------
// The text measure for business statements (roadmap 17.5)
// ---------------------------------------------------------------------------

test.describe('the business-statement measure is disclosed and justified', () => {
  const STATEMENTS = readCases().flatMap((korpusCase) =>
    korpusCase.expected.businessStatements.map((statement) => ({
      case: korpusCase.id,
      id: statement.id,
      text: statement.text ?? '',
      lines: new Set(statement.anchors.map((anchor) => `${anchor.file}:${anchor.line}`)),
    })),
  );

  test('the corpus carries the 173 expected statements it measures against', () => {
    expect(STATEMENTS.length, 'without expected statements this facet measures nothing').toBeGreaterThan(150);
    expect(STATEMENTS.every((statement) => statement.text.length > 10)).toBe(true);
  });

  test('the threshold lies in the measured gap', () => {
    // The justification of the threshold, recomputed on every run rather than
    // as prose in a comment. If this test fails because the case book has
    // grown, the threshold is **justified anew** — not adjusted to fit.
    let worstUnrelated = 0;
    let worstUnrelatedPair = '';
    for (let i = 0; i < STATEMENTS.length; i += 1) {
      for (let j = i + 1; j < STATEMENTS.length; j += 1) {
        const a = STATEMENTS[i];
        const b = STATEMENTS[j];
        if (a.case !== b.case) continue;
        // Only pairs that speak about **different** locations: they must
        // never pass as "said the same thing".
        if ([...a.lines].some((line) => b.lines.has(line))) continue;
        const score = statementSimilarity(a.text, b.text);
        if (score > worstUnrelated) {
          worstUnrelated = score;
          worstUnrelatedPair = `${a.id}/${b.id}`;
        }
      }
    }
    // The mildest rewording that still means the same: the same statement
    // without its last two words. It must stay above the threshold.
    let mildestParaphrase = 1;
    let mildestParaphraseId = '';
    for (const statement of STATEMENTS) {
      const score = statementSimilarity(statement.text, statement.text.split(' ').slice(0, -2).join(' '));
      if (score < mildestParaphrase) {
        mildestParaphrase = score;
        mildestParaphraseId = statement.id;
      }
    }
    expect(
      worstUnrelated,
      `Two expected statements about different locations (${worstUnrelatedPair}) reach ${worstUnrelated.toFixed(3)} — ` +
        `above the threshold ${STATEMENT_MATCH_THRESHOLD}. Then the measure counts different things as the same.`,
    ).toBeLessThan(STATEMENT_MATCH_THRESHOLD);
    expect(
      mildestParaphrase,
      `The mildest rewording (${mildestParaphraseId}) drops to ${mildestParaphrase.toFixed(3)} — ` +
        `below the threshold ${STATEMENT_MATCH_THRESHOLD}. Then the measure is brittle and penalises word choice.`,
    ).toBeGreaterThan(STATEMENT_MATCH_THRESHOLD);
  });

  test('the measure can be recomputed by hand and has no hidden cleverness', () => {
    // English since 01.10.2026 — the statements and the stop list are English.
    expect(statementSimilarity('The customer is read.', 'The customer is read.')).toBe(1);
    expect(statementSimilarity('The customer is read.', '')).toBe(0);
    expect(statementSimilarity('', '')).toBe(0);
    // Function words alone are not content.
    expect(statementSimilarity('The and but with from', 'The and but with from')).toBe(0);
    // Dice by hand: {customer, read} against {customer, written} = 2·1/4 = 0.5.
    expect(statementSimilarity('The customer is read.', 'The customer is written.')).toBeCloseTo(0.5, 6);
    // The ABAP identifier is what tells statements apart, so the underscore stays.
    expect(statementTokens('lv_count is overwritten').has('lv_count')).toBe(true);
  });

  test('the comparison really asks a producer — and today there is none', () => {
    // The seam for 17.6. A comparator that never calls the producer cannot
    // catch a change to it; that is the same finding that triggered 1.9 on
    // the `skelett` facet.
    let asked = 0;
    const spy = {
      name: 'probe:zaehler',
      note: 'Only counts whether it is asked at all.',
      produce: () => {
        asked += 1;
        return [];
      },
    };
    const korpusCase = readCases()[0];
    compareCase(korpusCase, readWithEngine(korpusCase, undefined, spy));
    expect(asked, 'the run never asked the producer').toBe(1);

    // And what it delivers has to **arrive** in the facet. Before 17.5
    // `compareBusinessStatements` was hard-wired to `disagree` and did not
    // even accept the engine reading; a producer would have moved nothing there.
    const first = korpusCase.expected.businessStatements[0];
    expect(first, 'the first case carries no expected statement — otherwise the probe measures nothing').toBeTruthy();
    const oneHit = {
      name: 'probe:ein-treffer',
      note: 'Places exactly one expected statement verbatim at its own anchor.',
      produce: () => [{ id: 'G-1', text: first.text ?? '', anchors: first.anchors }],
    };
    const withOne = compareCase(korpusCase, readWithEngine(korpusCase, undefined, oneHit)).find(
      (result) => result.class === 'fachsaetze',
    );
    expect(withOne?.scope.compared, 'the produced statement does not arrive in the facet').toBe(1);
    expect(
      withOne?.aspects.find((aspect) => aspect.name === 'fachsatzinhalt')?.compared,
      'the content was not measured',
    ).toBe(1);

    // And every piece of evidence names the producer — before 17.7 that was
    // `kein-erzeuger`, since then the engine. Evidence without a name does not
    // say **what** was measured, and that was exactly finding CR-05.
    expect(NO_PRODUCER.produce(korpusCase, readWithEngine(korpusCase))).toEqual([]);
    const live = LIVE.filter((result) => result.class === 'fachsaetze');
    for (const result of live) {
      expect(result.evidence, `${result.case}: the evidence does not name the producer`).toContain(
        ENGINE_PRODUCER.name,
      );
    }
    const total = live.reduce((sum, result) => sum + result.scope.total, 0);
    expect(total, 'the corpus no longer carries expected business statements').toBeGreaterThan(150);
  });
});
