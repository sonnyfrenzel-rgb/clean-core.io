/**
 * Judging the reviewers' scenarios by the generated Node package's own executable cases (roadmap 3.0.14 item 3).
 *
 * The acceptance suite opened the sealed scenarios but matched only the few a failure-pattern probe covers (2 of
 * 284). Most scenarios are the original's own demo cases with the reviewer's expected outcome — `CASE-07` with
 * `{ p_case: 7 }`, `case_07`, `7` — and every Node package carries those cases as executable data
 * (`test/fixtures/original-demo.json`, run by `srv/fixtures.ts` `runDemoCase`, `node-demo.ts`). Here a scenario is
 * matched to its case by ID, the case runs through the package in the confined executor (`harness-step.mjs`
 * `demoCaseRuns`), and its output is compared with the expectation in this process.
 *
 * PRIVACY. The scenarios are opened in memory only (`scenarios.mjs`); what leaves this module is a verdict word and
 * counts — never an expected value, a field name of the reviewer's data, or the package's output.
 *
 * Pure: data in, verdicts out. No file, no network, no model.
 */

/** One verdict handed in by a check that ran the scenario's case (`judgeScenarios` `external` in suite.ts). */
export type ScenarioVerdict = 'pass' | 'fail' | { ran: boolean; verdict: string; detail?: string };

/** A scenario as the suite holds it; `input` and `expected` stay in memory. */
export interface CaseScenario {
  id: string;
  group: string;
  expectedForm: 'machine' | 'prose';
  input?: unknown;
  expected?: unknown;
}

/** One demo case of the original as the package ran it, reduced to what a scenario is compared with. */
export type DemoCaseSummary =
  | { state: 'not-run'; reason: string }
  | { state: 'threw'; message: string }
  | { state: 'ran'; complete: boolean; notFilled: string[]; refused: boolean; rows: unknown[]; result: Record<string, unknown>; issues: string[]; local: Record<string, unknown> };

/** The demo cases a harness step ran, by number (`harness-step.mjs` demoCaseRuns). */
export interface DemoCaseRuns {
  executed: boolean;
  reason: string | null;
  byNumber: Record<string, DemoCaseSummary>;
}

/** The demo cases of a package as its `test/fixtures/original-demo.json` lists them (the part the matching reads). */
export interface PackageDemo {
  switch: { parameter: string | null } | null;
  cases: Array<{ number: number }>;
}

/**
 * Which of the package's executable cases a scenario names: the original's demo case of that number — by the
 * scenario's input for the case switch (`{ p_case: 7 }`, the switch parameter the engine read from the original),
 * or by its ID (`CASE-07`, `case_07`, `7`) on a reference scenario. Only cases the package carries.
 */
export function scenarioCases(scenarios: readonly CaseScenario[] | null, demo: PackageDemo | null): Map<string, number> {
  const out = new Map<string, number>();
  if (!scenarios || !demo || demo.cases.length === 0) return out;
  const carried = new Set(demo.cases.map((c) => c.number));
  const param = demo.switch?.parameter?.toLowerCase() ?? null;
  for (const s of scenarios) {
    let n: number | null = null;
    if (param && isPlainObject(s.input)) {
      const hit = Object.entries(s.input).find(([k]) => k.toLowerCase() === param);
      const v = hit ? Number(hit[1]) : NaN;
      if (Number.isInteger(v)) n = v;
    }
    if (n === null && s.group === 'reference') {
      const m = /^(?:case[-_ ]?)?(\d{1,3})$/i.exec(s.id);
      if (m) n = Number(m[1]);
    }
    if (n !== null && carried.has(n)) out.set(s.id, n);
  }
  return out;
}

/* ---------------------------------------------------------------- compare */

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
/** A data object's name without the original's prefix: `gv_hidden_known` → `hiddenknown`. */
const bareKey = (k: string) => normKey(k.replace(/^(?:gv|gs|gt|lv|ls|lt|g|l|p|s)_/i, '').replace(/^(?:gv|gs|gt|lv|ls|lt)(?=[A-Z])/, ''));
const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A value as compared: decimal text and numbers by their exact value, 'X' and '' as true and false, text trimmed. */
export function canon(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'X' : '';
  const t = String(v).trim();
  const m = /^([-+]?)(\d+)(?:\.(\d+))?$/.exec(t);
  if (m) {
    const whole = m[2].replace(/^0+(?=\d)/, '');
    const frac = (m[3] ?? '').replace(/0+$/, '');
    const zero = /^0+$/.test(whole) && frac === '';
    return `${m[1] === '-' && !zero ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
  }
  return t;
}

/** A value by its key among the output's places: by its name first, then by its name without the original's prefix. */
function locate(key: string, places: ReadonlyArray<Record<string, unknown>>): { found: boolean; value?: unknown } {
  for (const place of places) for (const [k, v] of Object.entries(place)) if (normKey(k) === normKey(key)) return { found: true, value: v };
  for (const place of places) for (const [k, v] of Object.entries(place)) if (bareKey(k) === bareKey(key)) return { found: true, value: v };
  return { found: false };
}

type Ran = Extract<DemoCaseSummary, { state: 'ran' }>;

/** The table of the output that holds rows of this shape: the run's rows, else the global table whose columns cover most. */
function rowsFor(expected: ReadonlyArray<Record<string, unknown>>, out: Ran): unknown[] | null {
  const keys = new Set(expected.flatMap((r) => Object.keys(r).map(bareKey)));
  const cover = (rows: unknown[]) => {
    const first = rows.find(isPlainObject);
    return first ? Object.keys(first).filter((k) => keys.has(bareKey(k))).length : 0;
  };
  let best: unknown[] | null = null;
  let bestCover = 0;
  for (const c of [out.rows, ...Object.values(out.local).filter((v): v is unknown[] => Array.isArray(v))]) {
    const n = cover(c);
    if (n > bestCover) {
      best = c;
      bestCover = n;
    }
  }
  return best;
}

export interface ScenarioComparison {
  verdict: 'pass' | 'fail' | 'not-judged';
  /** Expected values found in the output, of all; of those found, how many differ. Counts only, never a value. */
  located: number;
  total: number;
  differ: number;
}

/**
 * One machine expectation against one case's output. Each expected value is looked for in the output: a list of
 * rows in the run's rows or the global table of that shape (its length, then row by row and column by column), a
 * list of messages among the run's issues, any other value in the run's result or the globals by its name. Pass
 * only when every expected value was found and equal; fail when a found one differs and at least half were found;
 * otherwise not judged.
 */
export function compareScenario(expected: unknown, out: Ran): ScenarioComparison {
  const c: ScenarioComparison = { verdict: 'not-judged', located: 0, total: 0, differ: 0 };
  const leaf = (found: boolean, equal: boolean) => {
    c.total++;
    if (!found) return;
    c.located++;
    if (!equal) c.differ++;
  };
  const visit = (key: string, value: unknown, within: ReadonlyArray<Record<string, unknown>>) => {
    if (Array.isArray(value) && value.length > 0 && value.every(isPlainObject)) {
      const rows = rowsFor(value, out);
      if (!rows) {
        for (const r of value) for (let i = Object.keys(r).length; i > 0; i--) leaf(false, false);
        return;
      }
      leaf(true, rows.length === value.length);
      value.forEach((r, i) => {
        const got = rows[i];
        for (const [k, v] of Object.entries(r)) {
          if (!isPlainObject(got)) {
            leaf(false, false);
            continue;
          }
          const hit = Object.entries(got).find(([gk]) => normKey(gk) === normKey(k)) ?? Object.entries(got).find(([gk]) => bareKey(gk) === bareKey(k));
          leaf(Boolean(hit), hit ? canon(hit[1]) === canon(v) : false);
        }
      });
      return;
    }
    if (Array.isArray(value) && value.every((x) => typeof x === 'string') && /issue|message/i.test(key)) {
      // The run's issues: as many as expected, each expected message among them (case and spacing aside).
      const said = out.issues.map((m) => m.replace(/\s+/g, ' ').trim().toLowerCase());
      leaf(true, said.length === value.length);
      for (const m of value) {
        const w = m.replace(/\s+/g, ' ').trim().toLowerCase();
        leaf(true, said.some((s) => s === w || (w.length > 0 && s.includes(w))));
      }
      return;
    }
    if (isPlainObject(value)) {
      const hit = locate(key, within);
      const inner = hit.found && isPlainObject(hit.value) ? [hit.value] : within;
      for (const [k, v] of Object.entries(value)) visit(k, v, inner);
      return;
    }
    const hit = locate(key, within);
    const scalar = hit.found && !isPlainObject(hit.value) && !Array.isArray(hit.value);
    leaf(scalar, scalar && canon(hit.value) === canon(value));
  };
  if (isPlainObject(expected)) for (const [k, v] of Object.entries(expected)) visit(k, v, [out.result, out.local]);
  // A fail needs the output found: at least half of the expected values located (real SD run 15.10.2026: 5 of 115
  // found — the package keeps its rows under other names — and "fail" on those 5 said nothing about the rest).
  if (c.differ > 0 && c.located * 2 >= c.total) c.verdict = 'fail';
  else if (c.total > 0 && c.located === c.total) c.verdict = 'pass';
  return c;
}

/**
 * The verdicts of the scenarios the package's demo cases answer: a case that ran complete is compared with a
 * machine expectation (`compareScenario`); a prose one ran and stays with a reviewer; a case that did not run,
 * threw or reached a stub says so. Words and counts only.
 */
export function demoCaseVerdicts(scenarios: readonly CaseScenario[] | null, cases: ReadonlyMap<string, number>, runs: DemoCaseRuns | null): Record<string, ScenarioVerdict> {
  const out: Record<string, ScenarioVerdict> = {};
  for (const s of scenarios ?? []) {
    const n = cases.get(s.id);
    if (n === undefined) continue;
    const r = runs?.byNumber[String(n)];
    if (!runs || !runs.executed || !r) {
      out[s.id] = { ran: false, verdict: `not-run: demo case ${n} — ${(runs?.reason ?? 'the harness did not run it').slice(0, 160)}` };
    } else if (r.state === 'not-run') {
      out[s.id] = { ran: false, verdict: `not-run: demo case ${n} — ${r.reason.slice(0, 160)}` };
    } else if (r.state === 'threw') {
      // The package's code threw on the original's own case: the package fails it.
      out[s.id] = { ran: true, verdict: 'fail', detail: 'the package threw on the case' };
    } else if (!r.complete) {
      out[s.id] = { ran: true, verdict: `not-run: demo case ${n} reached ${r.notFilled.length} function(s) still left as stubs` };
    } else if (s.expectedForm !== 'machine') {
      out[s.id] = { ran: true, verdict: `ran: demo case ${n} — a prose expectation, judged by a reviewer` };
    } else {
      const cmp = compareScenario(s.expected, r);
      const detail = `${cmp.differ} of ${cmp.located} found values differ, ${cmp.located} of ${cmp.total} found`;
      out[s.id] = cmp.verdict === 'not-judged' ? { ran: true, verdict: `ran: demo case ${n} — not judged, ${cmp.located} of ${cmp.total} expected values found in the output`, detail } : { ran: true, verdict: cmp.verdict, detail: `${cmp.differ} of ${cmp.located} found values differ, ${cmp.located} of ${cmp.total} found` };
    }
  }
  return out;
}
