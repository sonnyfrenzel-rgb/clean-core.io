/**
 * The answer of the Testing tool — "Is <program> tested?" — read from what the project and this session hold
 * (ADR-131, `docs/roadmap/testing-next-mockup.html`, decisions S2, S3, S6, S10, S11).
 *
 * One sentence or two per state, the place every result ran (Clean-Core.io's isolated runner against SAP mocks, or
 * your SAP system), four facets — scenarios, business rules with a case, result, not proven — and the *Not proven*
 * list. Nothing is inferred: a run is what `lastRun` reads (a covering receipt, this session's run, a recorded
 * failure), a result from your SAP system is what `outsideReading` reads (ADR-075), a closure is ADR-094's. "Tested"
 * and "passed" never stand without the place.
 *
 * Pure: no React, no Firestore. The page hands the readings over; `tests/testing-answer.spec.ts` holds the words.
 */
import type { LastRun } from '@/components/testing/testing-summary';
import type { OutsideReading } from '@/lib/sap-test-results';
import type { RuleCoverage } from '@/lib/testing-rule-trace';
import type { FamilyChipKind } from '@/lib/family-chips';
import type { TestRunFailure } from '@/lib/testing-closure';
import { failureReason } from '@/lib/testing-closure';
import { formatTextDate } from '@/lib/format';

export type TestingAnswerState =
  | 'generating'
  | 'not-started'
  | 'written'
  | 'passed'
  | 'failed'
  | 'no-result'
  | 'earlier'
  | 'closed';

/** Where a result ran — the three places, named the same everywhere (S3). */
export type TestPlace = 'here' | 'your-system' | 'tenant';

export const PLACE_WORDS: Readonly<Record<TestPlace, string>> = Object.freeze({
  here: "Here: Clean-Core.io's isolated runner",
  'your-system': 'Your SAP system',
  tenant: 'Your tenant, from here',
});

export interface TestingAnswerInput {
  /** The program as the question names it: its technical name, else the business title. */
  program: string;
  /** ABAP Cloud route: the scenarios are an ABAP Unit class, which nothing here runs. */
  abap: boolean;
  /** The scenarios on the project. */
  cases: number;
  /** Of them, derived by the engine from the original's checks (`countEngineCases`). */
  engineCases: number;
  /** The rule coverage (`ruleCoverage`), or null while the rules are read or none can be. */
  coverage: RuleCoverage | null;
  run: LastRun;
  outside: OutsideReading;
  /** ADR-094 — testing closed by the owner without a passing run, current. */
  closed: boolean;
  /** The testing model is writing the scenarios right now. */
  generating: boolean;
  /** The *Not proven* list's length. */
  notProven: number;
}

export interface TestingFacet {
  id: 'scenarios' | 'rules' | 'result' | 'open';
  label: string;
  value: string;
  note: string | null;
  chip: { kind: FamilyChipKind; note?: string } | null;
  /** The section the facet jumps to. */
  target: string;
}

export interface TestingAnswer {
  state: TestingAnswerState;
  question: string;
  /** The family chips beside the question. */
  chips: Array<{ kind: FamilyChipKind; note?: string }>;
  answer: string;
  condition: string | null;
  facets: TestingFacet[];
}

/** The ids of the page's sections — the facets jump there, the "On this page" bar names them. */
export const TESTING_SECTION_IDS = Object.freeze({
  tested: 'testing-tested',
  ran: 'testing-ran',
  open: 'testing-open',
  acceptance: 'testing-acceptance',
  developers: 'testing-developers',
});

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (at: string | null | undefined) => (at ? formatTextDate(at) ?? at.slice(0, 10) : null);

/** "11 of 12 business rules" — or null when the rules could not be read. */
function rulesLine(c: RuleCoverage | null): string | null {
  if (!c || c.total === 0) return null;
  return `${c.covered.length} of ${plural(c.total, 'business rule')}`;
}

/** Where a result on record ran, with its day — the note of the Result facet. */
function placeLine(input: TestingAnswerInput): string | null {
  const { outside, run, abap } = input;
  if (abap && outside.state === 'current') {
    const s = outside.summary;
    const when = day(s.kind === 'confirmed' ? s.ranOn ?? s.recordedAt : s.recordedAt);
    const sys = s.system ? `${s.system}, ` : '';
    return `In your SAP system, ${sys}${s.kind === 'imported' ? 'imported' : 'confirmed by you'} ${when ?? ''}`.trim();
  }
  if (!abap && (run.kind === 'recorded' || run.kind === 'session')) {
    const when = run.kind === 'recorded' ? day(run.at) : 'this session';
    return `Here, against SAP mocks, ${when}. Not in your SAP system.`;
  }
  return null;
}

export function testingAnswer(input: TestingAnswerInput): TestingAnswer {
  const { program, abap, cases, engineCases, coverage, run, outside, closed, generating, notProven } = input;
  const question = `Is ${program} tested?`;
  const rules = rulesLine(coverage);
  const missing = coverage ? [...coverage.missing, ...coverage.notAsked] : [];

  let state: TestingAnswerState;
  let chips: TestingAnswer['chips'] = [];
  let answer: string;
  let condition: string | null = null;
  let passed = 0;
  let failed = 0;
  let total = cases;

  const outsideCurrent = abap && outside.state === 'current' ? outside : null;
  const ranHere = !abap && (run.kind === 'recorded' || run.kind === 'session') ? run : null;

  if (generating) {
    state = 'generating';
    chips = [{ kind: 'ai' }];
    answer = 'Writing the scenarios. The testing model writes cases for the business rules the engine cases do not reach.';
    condition = 'Nothing has run yet. The page updates when the scenarios are written.';
  } else if (cases === 0) {
    state = 'not-started';
    chips = [{ kind: 'not-determined' }];
    answer = 'Not tested yet. No scenario is written and nothing has run, here or in your SAP system.';
    condition = abap
      ? 'Writing the scenarios lists them by business rule. They then run in your own SAP system as an ABAP Unit class, and you bring the result back.'
      : "Writing the scenarios lists them by business rule. They then run here, in Clean-Core.io's isolated runner against SAP mocks.";
  } else if (closed) {
    state = 'closed';
    chips = [{ kind: 'yours' }];
    answer = 'Closed without a passing run. Testing reads "Closed · not verified", never passed.';
    condition = 'The reason you recorded is in "Where it ran". A passing run later replaces the closure.';
  } else if (outsideCurrent) {
    const s = outsideCurrent.summary;
    passed = s.kind === 'imported' ? s.coverage?.passed ?? s.passed : s.passed;
    failed = s.kind === 'imported' ? Math.max(s.failed, s.coverage?.failed ?? 0) : s.failed;
    total = s.scenarioCount;
    chips = [s.kind === 'imported' ? { kind: 'engine', note: 'imported' } : { kind: 'yours', note: 'self-declaration' }];
    const how = s.kind === 'imported' ? 'imported from the ABAP Unit result file' : 'confirmed by you';
    if (outsideCurrent.verifies) {
      state = 'passed';
      answer = `Passed in your SAP system: all ${plural(total, 'scenario')} ran there, ${how}.${rules ? ` They cover ${rules}.` : ''}`;
      condition = 'The run is your system\'s report; Clean-Core.io did not run it.';
    } else {
      state = 'failed';
      chips.push({ kind: 'not-determined', note: failed > 0 ? `${failed} failed` : 'incomplete' });
      answer =
        failed > 0
          ? `${failed} of ${plural(total, 'scenario')} failed in your SAP system, ${how}.`
          : `Not every scenario has a passing result from your SAP system, ${how}.`;
      condition = 'Open the failing rules under "What was tested". Each case says what a failure there means.';
    }
  } else if (ranHere) {
    const c = ranHere.counts;
    passed = c.passed;
    failed = c.failed;
    total = c.total;
    chips = [{ kind: 'simulation', note: 'mocks' }];
    if (failed > 0) {
      state = 'failed';
      chips.push({ kind: 'not-determined', note: `${failed} failed` });
      answer = `${failed} of ${plural(total, 'scenario')} failed against SAP mocks, in Clean-Core.io's isolated runner.`;
      condition = 'Open the failing rules under "What was tested". Each case says whether it is a defect, a rule marked to change, or an expectation only the model stated.';
    } else if (c.noResult > 0 && c.passed === 0) {
      state = 'no-result';
      answer = `The run gave no verdict for ${plural(c.noResult, 'scenario')} against SAP mocks.`;
      condition = 'A scenario without a verdict is neither passed nor failed.';
    } else {
      state = 'passed';
      answer = `Passed against SAP mocks: ${c.noResult > 0 ? `${c.passed} of ${plural(total, 'scenario')}` : `all ${plural(total, 'scenario')}`} ran in Clean-Core.io's isolated runner, not in your SAP system.${rules ? ` They cover ${rules}.` : ''}`;
      condition = 'A pass against mocks says the logic does what the tests expect. It is not proof in your system.';
    }
    if (ranHere.kind === 'session') condition = `${condition ?? ''} This run is not recorded by the server yet.`.trim();
  } else if (run.kind === 'failed') {
    state = 'no-result';
    chips = [{ kind: 'not-determined' }];
    answer = `Not tested: the last run gave no result. ${capitalise(failureReasonOf(run.failure))}.`;
    condition = 'A run that gave no result is on record. You can run again, or close testing with a reason.';
  } else if ((abap && outside.state === 'earlier') || (!abap && run.kind === 'earlier')) {
    state = 'earlier';
    chips = [{ kind: 'not-determined' }];
    answer = `Not tested for this version: the result on record was for earlier code or scenarios. ${plural(cases, 'scenario')} wait for a new ${abap ? 'result from your SAP system' : 'run'}.`;
  } else {
    state = 'written';
    chips = [{ kind: 'ai', note: 'draft, not run' }];
    answer = abap
      ? `Not tested yet: ${plural(cases, 'scenario')} ${cases === 1 ? 'is' : 'are'} written${rules ? ` for ${rules}` : ''}, and none has run. They run in your SAP system: run the test class there and bring the result back.`
      : `Not tested yet: ${plural(cases, 'scenario')} ${cases === 1 ? 'is' : 'are'} written${rules ? ` for ${rules}` : ''}, and none has run. Run them here, against SAP mocks.`;
  }

  if (state === 'written' || state === 'passed' || state === 'failed') {
    const model = cases - engineCases;
    const origin = engineCases > 0
      ? `${engineCases} derived by the engine from the original's checks; ${model} written by the model, and their expected results are the model's statement.`
      : `All ${plural(cases, 'scenario')} were written by the model; their expected results are the model's statement.`;
    if (state === 'written') condition = `${origin}${missing.length > 0 ? ` ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` and ${missing.length - 3} more` : ''} ${missing.length === 1 ? 'has' : 'have'} no case.` : ''}`;
  }

  // ---------------------------------------------------------------- facets
  const facets: TestingFacet[] = [];
  facets.push(
    cases > 0
      ? {
          id: 'scenarios',
          label: 'Scenarios',
          value: `${cases} written`,
          note: engineCases > 0 ? `${engineCases} derived by the engine · ${cases - engineCases} written by the model` : 'All written by the model',
          chip: engineCases === cases ? { kind: 'engine' } : { kind: 'ai' },
          target: TESTING_SECTION_IDS.tested,
        }
      : {
          id: 'scenarios',
          label: 'Scenarios',
          value: 'Not written yet',
          note: null,
          chip: null,
          target: TESTING_SECTION_IDS.tested,
        },
  );
  facets.push({
    id: 'rules',
    label: 'Business rules with a case',
    value: rules ? `${coverage!.covered.length} of ${coverage!.total}` : coverage && coverage.total === 0 ? 'None found' : 'Not determined',
    note:
      coverage && coverage.total > 0
        ? missing.length > 0
          ? `No case: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`
          : 'Every business rule has a case'
        : coverage
          ? 'The engine found no business rule in the original'
          : 'The rules of the original are not read yet',
    chip: coverage ? { kind: 'engine' } : null,
    target: TESTING_SECTION_IDS.tested,
  });
  const resultValue =
    state === 'passed' || state === 'failed'
      ? `${failed > 0 ? `${failed} failed · ${passed} passed` : `${passed} passed · 0 failed`}`
      : state === 'closed'
        ? 'Closed · not verified'
        : state === 'no-result'
          ? 'No result'
          : state === 'earlier'
            ? 'For earlier code'
            : cases === 0
              ? 'Nothing to run'
              : 'Not run';
  facets.push({
    id: 'result',
    label: 'Result',
    value: resultValue,
    note:
      placeLine(input) ??
      (cases === 0
        ? null
        : abap
          ? 'Nothing here runs ABAP Unit. Run it in your SAP system and bring the result back.'
          : 'Run them here, against SAP mocks.'),
    chip:
      state === 'passed' || state === 'failed'
        ? outsideCurrent
          ? outsideCurrent.summary.kind === 'imported'
            ? { kind: 'engine', note: 'imported' }
            : { kind: 'yours' }
          : { kind: 'simulation', note: 'mocks' }
        : null,
    target: TESTING_SECTION_IDS.ran,
  });
  facets.push({
    id: 'open',
    label: 'Not proven',
    value: cases === 0 && state !== 'generating' ? 'Everything' : plural(notProven, 'point'),
    note: cases === 0 ? 'Nothing has run anywhere.' : 'What no result on this page proves',
    chip: null,
    target: TESTING_SECTION_IDS.open,
  });

  return { state, question, chips, answer, condition, facets };
}

function failureReasonOf(f: TestRunFailure): string {
  return failureReason(f);
}

function capitalise(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/* ----------------------------------------------------------- not proven */

export interface NotProvenItem {
  key: 'rules-without-case' | 'places' | 'model-stated' | 'only-your-system' | 'not-in-your-system' | 'not-run';
  title: string;
  detail: string;
  /** Where the point is taken up: a section id on this page, or a tool. */
  action: { label: string; target: string };
  chip: FamilyChipKind | null;
}

/**
 * *Not proven* — one list (S6): rules without a case, the places no generated test covers, expectations only the model
 * stated, what only your SAP system can show (the testing model's list), and on the CAP route that nothing ran in your
 * system. Each point says where it is taken up; none of them blocks the handover.
 */
export function notProvenItems(input: {
  abap: boolean;
  cases: number;
  modelCases: number;
  missingRules: readonly string[];
  /** The constructs the engine did not judge (`readProgram().gaps`). */
  places: ReadonlyArray<{ label: string; count: number; firstLine: number }>;
  /** The testing model's "only in your SAP system" areas. */
  onlyYourSystem: readonly string[];
  /** Anything ran here (a recorded or session run). */
  ranHere: boolean;
}): NotProvenItem[] {
  const out: NotProvenItem[] = [];
  const { abap, cases, modelCases, missingRules, places, onlyYourSystem, ranHere } = input;
  if (cases === 0) {
    out.push({
      key: 'not-run',
      title: 'Nothing has run',
      detail: abap
        ? 'No scenario is written, and no result from your SAP system is on record.'
        : 'No scenario is written, and nothing has run here or in your SAP system.',
      action: { label: 'Write the scenarios', target: TESTING_SECTION_IDS.tested },
      chip: null,
    });
  }
  if (cases > 0 && missingRules.length > 0) {
    out.push({
      key: 'rules-without-case',
      title: `${plural(missingRules.length, 'business rule')} without a case`,
      detail: `${missingRules.slice(0, 8).join(', ')}${missingRules.length > 8 ? ` and ${missingRules.length - 8} more` : ''}. No scenario tests ${missingRules.length === 1 ? 'it' : 'them'}.`,
      action: { label: 'See the rules', target: TESTING_SECTION_IDS.tested },
      chip: 'engine',
    });
  }
  const placeCount = places.reduce((sum, p) => sum + p.count, 0);
  if (placeCount > 0) {
    out.push({
      key: 'places',
      title: `${plural(placeCount, 'place')} no generated test covers`,
      detail: `${places.map((p) => `${p.count} × ${p.label.toLowerCase()} (first at L${p.firstLine})`).join(' · ')}. The engine did not judge them, so no scenario can be derived for them. Check them by hand.`,
      action: { label: 'Check by hand', target: TESTING_SECTION_IDS.open },
      chip: 'engine',
    });
  }
  if (modelCases > 0) {
    out.push({
      key: 'model-stated',
      title: `${plural(modelCases, 'expected result')} only the model stated`,
      detail: `For the ${plural(modelCases, 'scenario')} the model wrote, it also wrote what the original does; nobody checked that against the code. A pass there means the code did what the test expects.`,
      action: { label: 'Review the assertions', target: TESTING_SECTION_IDS.developers },
      chip: 'ai',
    });
  }
  if (onlyYourSystem.length > 0) {
    out.push({
      key: 'only-your-system',
      title: 'What only your SAP system can show',
      detail: `${onlyYourSystem.slice(0, 4).join(' · ')}${onlyYourSystem.length > 4 ? ` and ${onlyYourSystem.length - 4} more` : ''}.`,
      action: { label: 'See the details', target: TESTING_SECTION_IDS.open },
      chip: 'ai',
    });
  }
  if (!abap && ranHere) {
    out.push({
      key: 'not-in-your-system',
      title: 'Nothing ran in your SAP system',
      detail: 'A pass here is against SAP mocks. Your system, its data and its released APIs are not part of the run.',
      action: { label: 'Where it ran', target: TESTING_SECTION_IDS.ran },
      chip: null,
    });
  }
  return out;
}
