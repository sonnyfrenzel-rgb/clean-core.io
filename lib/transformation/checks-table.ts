/**
 * The Transformation page's one table of checks (ADR-129 (4), mock-up T8): every check the generated code went
 * through, who ran it, and its outcome — passed, failed, or not run; never two outcomes where there are three. It
 * replaces the strips that used to stand above the answer (hard-coded values, code checks), the abaplint strip inside
 * the Built-on card and the grounding audit's facet: each is a row here, and the answer's Checks facet counts them.
 *
 * Read from what is on record — the generation binding's record (`storedGenerationRecord`: the server's abaplint and
 * type check, the page's report of guards, lints, formats, cases and probes), the deterministic checks the page runs
 * over the package on screen (code lints, hard-coded values), and the personal checklist (this browser only). Nothing
 * is run here and nothing is estimated. Pure.
 */
import type { GenerationRecord } from './generation-record';
import { activationPlainWords, checkPhrase, checkStateOf, orderedChecks, unresolvedSentence, type CheckLike } from './check-words';

export type CheckOutcome = 'passed' | 'failed' | 'not-run' | 'running' | 'waiting' | 'nothing' | 'checklist';

export interface CheckRow {
  key: string;
  /** What is checked, in a few words. */
  check: string;
  /** Who ran it: "Clean-Core.io's server, when the package was stored", "This browser", "Your SAP system". */
  who: string;
  outcome: CheckOutcome;
  /** The words beside the outcome: what the check says. */
  says: string;
  /** For a failed row: the failure in a few words, for the answer's first sentence ("abaplint finds 3 errors"). */
  failure?: string;
}

export interface ChecksTable {
  rows: CheckRow[];
  passed: number;
  failed: number;
  notRun: number;
  /** A row's failures, by key, for the answer's first sentence. */
  failedRows: CheckRow[];
}

export interface ChecksInput {
  /** `stored`: a package on record; `running`: being written; `none`: nothing written yet. */
  state: 'stored' | 'running' | 'none';
  /** The ABAP Cloud route (abaplint, activation, ABAP Unit) or the Node route (type check, tests against mocks). */
  abap: boolean;
  record: (GenerationRecord & { contextDigest?: string | null }) | null;
  /** Findings of the deterministic code lints over the package on screen, and their count line. */
  lints: number;
  lintLine: string;
  /** Document-number-shaped literals in the business logic. */
  literals: number;
  /** Places the engine asks a person to look at, and how many of them are not ticked on the personal checklist. */
  handTotal: number;
  handOpen: number;
}

const errors = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

const SERVER = "Clean-Core.io's server, when the package was stored";
const BROWSER_GEN = 'This browser, during the generation';
const BROWSER = 'This browser';

const LABEL: Record<string, string> = {
  lint: 'Lint checks of the bodies',
  formats: 'File formats',
  cases: 'Engine cases',
  probes: 'Failure-pattern probes',
  types: 'Type check in this browser',
  abap: 'abaplint in this browser',
};

const outcomeOf = (checks: readonly CheckLike[]): CheckOutcome => {
  // Cases and probes say passed only when the written functions passed something (`checkStateOf`); a lint or a format
  // check passed when it ran and nothing failed.
  if (checks.every((c) => c.kind !== 'cases' && c.kind !== 'probes')) {
    if (checks.some((c) => c.failed > 0)) return 'failed';
    return checks.every((c) => typeof c.notRun === 'number' && c.notRun === c.total && c.total > 0) ? 'not-run' : 'passed';
  }
  const state = checkStateOf(checks);
  return state === 'met' ? 'passed' : state === 'failed' ? 'failed' : 'not-run';
};

export function checksTable(input: ChecksInput): ChecksTable {
  const rows: CheckRow[] = [];
  const engine = input.record?.engine ?? null;
  const pending = (key: string, check: string, who: string): CheckRow =>
    input.state === 'running'
      ? { key, check, who, outcome: key === 'guards' ? 'running' : 'waiting', says: key === 'guards' ? 'Each body is checked against the frame before it is kept.' : 'Runs when the last function is written, before anything is stored.' }
      : { key, check, who, outcome: 'nothing', says: 'Runs on the generated code; nothing is generated yet.' };

  /* What the server ran itself. */
  if (input.abap) {
    if (input.state !== 'stored') rows.push(pending('abaplint', 'abaplint: can it be activated?', SERVER));
    else if (input.record?.activation) {
      const a = input.record.activation;
      rows.push({
        key: 'abaplint',
        check: 'abaplint: can it be activated?',
        who: SERVER,
        outcome: a.activatable ? 'passed' : 'failed',
        says: [activationPlainWords(a), unresolvedSentence(a)].filter(Boolean).join(' '),
        failure: `abaplint finds ${errors(a.parserErrors + a.syntaxErrors, 'error')}`,
      });
    } else {
      rows.push({ key: 'abaplint', check: 'abaplint: can it be activated?', who: SERVER, outcome: 'not-run', says: 'No activation check is on record for this package: it was stored before the server ran one.' });
    }
  } else if (input.state !== 'stored') {
    rows.push(pending('tsc', 'Type check: does it compile?', SERVER));
  } else if (input.record?.typeCheck) {
    const t = input.record.typeCheck;
    rows.push({
      key: 'tsc',
      check: 'Type check: does it compile?',
      who: SERVER,
      outcome: t.runnable ? 'passed' : 'failed',
      failure: `the type check finds ${errors(t.errors, 'type error')}`,
      says: t.runnable
        ? `0 type errors in ${t.files} TypeScript ${t.files === 1 ? 'file' : 'files'} (TypeScript ${t.typescript}, the package's tsconfig.json).`
        : `${t.errors} type ${t.errors === 1 ? 'error' : 'errors'} in ${t.failedFiles} ${t.failedFiles === 1 ? 'file' : 'files'} (TypeScript ${t.typescript}, the package's tsconfig.json).`,
    });
  } else {
    rows.push({ key: 'tsc', check: 'Type check: does it compile?', who: SERVER, outcome: 'not-run', says: 'No type check is on record for this package: it was stored before the server ran one.' });
  }
  if (!input.abap && input.state === 'stored' && input.record?.cdsCompile) {
    const c = input.record.cdsCompile;
    rows.push(
      c.ran
        ? { key: 'cds', check: 'CDS model compiles', who: SERVER, outcome: c.compiles ? 'passed' : 'failed', failure: 'the CDS model does not compile', says: `cds compile (${c.compiler}): ${c.errors} ${c.errors === 1 ? 'error' : 'errors'}, ${c.warnings} ${c.warnings === 1 ? 'warning' : 'warnings'} in ${c.files} ${c.files === 1 ? 'file' : 'files'}.` }
        : { key: 'cds', check: 'CDS model compiles', who: 'Your environment', outcome: 'not-run', says: 'SAP CAP and its CDS compiler are installed by you: run npm install, then npm run compile to check the model.' },
    );
  }

  /* What the browser reported with the package. */
  if (input.state !== 'stored') {
    rows.push(pending('guards', 'Body guards', BROWSER_GEN));
  } else if (engine) {
    const guards = engine.checks.filter((c) => c.kind === 'guards');
    const notWritten = engine.notWritten.length + (engine.empty?.length ?? 0);
    rows.push({
      key: 'guards',
      check: 'Body guards',
      who: BROWSER_GEN,
      // A refused body goes back for repair; one that stays refused is left empty and fails "Functions written".
      outcome: guards.length === 0 ? 'not-run' : 'passed',
      says:
        guards.length === 0
          ? 'No guard check is on record.'
          : `${guards.map((c) => checkPhrase(c)).join('; ')}.${notWritten > 0 ? ` ${notWritten} ${notWritten === 1 ? 'function was' : 'functions were'} left empty.` : ' Every kept body left the frame as the engine wrote it.'}`,
    });
    rows.push({
      key: 'written',
      check: 'Functions written',
      who: BROWSER_GEN,
      outcome: notWritten > 0 ? 'failed' : 'passed',
      failure: `${errors(notWritten, 'function')} left empty`,
      says:
        notWritten > 0
          ? `${engine.written} of ${engine.units} written. Not written: ${[...engine.notWritten, ...(engine.empty ?? [])].slice(0, 4).map((n) => `${n.unitId} ${n.title}`).join(', ')}${notWritten > 4 ? ` and ${notWritten - 4} more` : ''}. Each reason is in STATUS.md and TRACE.md of the package.`
          : `${engine.written} of ${engine.units} written${engine.repaired ? `, ${engine.repaired} after a repair round` : ''}.`,
    });
    const byKind = new Map<string, CheckLike[]>();
    for (const c of orderedChecks(engine.checks)) {
      if (c.kind === 'guards' || c.kind.startsWith('abaplint') || c.kind === 'tsc') continue;
      byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
    }
    for (const [kind, list] of byKind) {
      rows.push({ key: `engine-${kind}`, check: LABEL[kind] ?? kind, who: BROWSER_GEN, outcome: outcomeOf(list), failure: `${(LABEL[kind] ?? kind).toLowerCase()} failed`, says: `${list.map((c) => checkPhrase(c)).join('; ')}.` });
    }
    for (const n of engine.notRun) {
      if (byKind.has(n.kind)) continue;
      rows.push({ key: `not-run-${n.kind}`, check: LABEL[n.kind] ?? n.kind, who: BROWSER_GEN, outcome: 'not-run', says: n.reason });
    }
  } else {
    rows.push({ key: 'guards', check: 'Body guards', who: BROWSER_GEN, outcome: 'not-run', says: input.record?.path === 'single-call' ? 'This package came from one model call: there is no frame to guard.' : 'No guard check is on record for this package.' });
  }

  /* What this page reads off the package on screen. */
  if (input.state !== 'stored') {
    rows.push(pending('lints', 'Code lints', BROWSER));
    rows.push(pending('literals', 'Hard-coded values', BROWSER));
  } else {
    rows.push({
      key: 'lints',
      check: 'Code lints',
      who: BROWSER,
      outcome: input.lints > 0 ? 'failed' : 'passed',
      failure: `the code lints flag ${errors(input.lints, 'pattern')}`,
      says: input.lints > 0 ? `${input.lintLine}: patterns earlier reviews flagged. Each is listed in STATUS.md of the delivery package.` : '0 findings of the patterns earlier reviews flagged.',
    });
    rows.push({
      key: 'literals',
      check: 'Hard-coded values',
      who: BROWSER,
      outcome: input.literals > 0 ? 'failed' : 'passed',
      failure: `${errors(input.literals, 'hard-coded value')} in the business logic`,
      says: input.literals > 0 ? `${input.literals} fixed document or partner ${input.literals === 1 ? 'number' : 'numbers'} in the business logic; check whether each should be looked up per item.` : 'No fixed document or partner number in the business logic.',
    });
  }

  /* What only your own system can do. */
  if (input.abap) {
    rows.push({ key: 'activation', check: 'Activation', who: 'Your SAP system', outcome: 'not-run', says: 'Bring the package into a test system with abapGit and activate it there.' });
    rows.push({ key: 'abap-unit', check: 'ABAP Unit', who: 'Your SAP system', outcome: 'not-run', says: 'Testing writes the cases with the expected results of the original; they run only in your system.' });
  } else {
    rows.push({ key: 'run', check: 'Start and run', who: 'Your environment', outcome: 'not-run', says: 'Testing runs the tests against mocks; the service itself starts only in your environment.' });
  }

  /* The personal checklist: a row, not a facet, and never counted as a check. */
  if (input.handTotal > 0) {
    rows.push({
      key: 'hand',
      check: 'Check by hand',
      who: 'You, kept in this browser only',
      outcome: 'checklist',
      says: `${input.handTotal} ${input.handTotal === 1 ? 'place' : 'places'} the engine asks a person to look at, ${input.handOpen} not ticked. A personal checklist, not a sign-off.`,
    });
  }

  const counted = rows.filter((r) => r.outcome !== 'checklist');
  const failedRows = counted.filter((r) => r.outcome === 'failed');
  return {
    rows,
    passed: counted.filter((r) => r.outcome === 'passed').length,
    failed: failedRows.length,
    notRun: counted.filter((r) => r.outcome === 'not-run').length,
    failedRows,
  };
}

/**
 * The failed rows that make a stored package not ready (it cannot be activated or does not compile, a function was
 * left empty, a reported check failed) apart from the ones that ask for a correction (code lints, hard-coded values).
 * The answer names either in its first sentence (mock-up T4).
 */
export function readinessFailures(table: ChecksTable | null | undefined): { hard: CheckRow[]; soft: CheckRow[] } {
  const failed = table?.failedRows ?? [];
  const hard = failed.filter((r) => ['abaplint', 'tsc', 'cds', 'written'].includes(r.key) || r.key.startsWith('engine-'));
  return { hard, soft: failed.filter((r) => !hard.includes(r)) };
}
