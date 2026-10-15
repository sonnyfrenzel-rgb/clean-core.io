/**
 * The pre-release acceptance suite (roadmap 3.0.13, "an acceptance suite with a
 * real model key"; owner decision 14.10.2026): every demo program generated end
 * to end, per program and track the gate result, the reviewers' scenarios,
 * functions written and not written, duration, model calls and cost — median of
 * three runs, diffed against the previous run, written where git never sees it.
 *
 *   npx tsx scripts/acceptance/suite.ts                          # dry: the stub model, every program, 1 run
 *   npx tsx scripts/acceptance/suite.ts --programs po-mm-po-approval,sd-order-cockpit --tracks rap
 *   npx tsx scripts/acceptance/suite.ts --mode real --runs 3 --cap-usd 10 \
 *        --price-in <USD per 1M input tokens> --price-out <USD per 1M output+thinking tokens> [--seal]
 *
 * Options: --mode dry|real · --programs a,b · --tracks rap,node · --runs n (default 1 dry, 3 real) ·
 * --cap-usd x (default 10; hard, for the whole invocation) · --price-in / --price-out (real only, required;
 * or ACCEPTANCE_PRICE_IN / ACCEPTANCE_PRICE_OUT) · --model name (default PRODUCT_GEMINI_MODEL) ·
 * --sources dir (sources not in the repository; default the owner's Desktop) · --out dir
 * (default .acceptance/runs, gitignored) · --env-file f (keys; default .env.local) · --seal (write the
 * report sealed and remove the plaintext) · --list.
 *
 * WHICH PIPELINE, AND WHY THIS PATH. The suite runs the very modules the
 * Transformation page runs, in the page's order and with the page's arguments:
 * `prepareEngineLed` (engine facts → unit plan → scaffold → fill requests),
 * `preflightFactsOf` + `preflight`, `runGeneration` (the orchestrator: bundling,
 * ≤ 4 in flight, retries, body guards via `guardBodyOf`, `normalizeBodyOf`, the
 * verify loop with `createRunnerVerifier` + `generatedCodeLints` + — on the RAP
 * track — the package formats and the scaffold check, at most two repair
 * rounds), and `assembleEngineLed` with the last round's activation / type
 * check. Behind the verifier's `runOnRunner` stands `localVerifyRoute`: what
 * `/api/run-tests` verify mode computes, with the route's functions — `abapCheck`
 * on an ABAP candidate, `typeCheckCandidate` on a Node one — so their errors
 * become the units' repair reasons exactly as on the page. The
 * model call goes to the provider directly with what `/api/gemini` sends for a
 * leased fill call: the same model constant, `responseSchemaForStage('transformation',
 * 'transformation-fill')`, `thinkingConfigFor('transformation-fill')` (LOW), JSON
 * mode, the route's deadline (`modelDeadline`), its three transient retries, and
 * its completeness check (`modelCompletion`); the lease's budget (48) and
 * in-flight cap (4) are the orchestrator's arguments. Going through a running
 * instance's `/api/gemini` instead would add only what is not under test here —
 * a Firebase account, a project document, the lease transaction in Firestore,
 * the hourly limits — and would need a signed-in user and a live database for a
 * CLI; the route's own gates have specs of their own.
 *
 * WHAT IS NOT THE PAGE. (1) The context pack is empty and there are no rule
 * decisions: the suite measures the engine-led path from the source alone, not
 * a project's earlier tools. (2) The runner half of the route inside the repair
 * loop (engine cases and probes in the isolated runner) is not called — the loop
 * sees lints, formats and the activation / type check; the cases and probes run
 * once afterwards with the repository's harness (`harness-step.mjs`) under its
 * own execution rule — in a Node 25 child when this Node is older, since only
 * Node >= 25 denies a child network access. (3) No signing, no store.
 *
 * GATES. RAP: `lib/transformation/abap-check.ts` (`abapCheck`), the activation
 * gate the product runs: parser and syntax errors fail it, findings that name SAP
 * objects the check cannot see are counted apart. Node: `lib/test-sandbox/type-check.ts`
 * (`typeCheckCandidate`), the candidate compiled under its own tsconfig.json.
 *
 * PRIVACY. The reports carry the reviewers' scenario IDs and verdicts, never
 * their values, but the folder is still gitignored, and `--seal` keeps only the
 * sealed form. Nothing here prints a prompt, an answer or a key.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { GoogleGenAI } from '@google/genai';
import JSZip from 'jszip';

import { prepareEngineLed, preflightFactsOf, guardBodyOf, normalizeBodyOf, candidateFiles, assembleEngineLed, type CheckSummary, type EngineLedPrepared } from '../../lib/transformation/engine-led';
import { runGeneration, type CheckKind, type FillModel, type GenerationRunResult, type Verify } from '../../lib/transformation/orchestrator';
import { createRunnerVerifier, abapScaffoldCheck, nodeScaffoldCheck, markerSpans, unitAt, type TypeCheckAnswer, type VerifyRunAnswer } from '../../lib/transformation/verify';
import { packageFormatsHook } from '../../lib/transformation/abapgit-check';
import { affSchemaSource } from '../../lib/transformation/aff-schemas';
import { preflight } from '../../lib/transformation/preflight';
import { checkSummaryOf, typeCheckRecordOf, isAbapPackage, ABAP_CASES_NOT_RUN, ABAP_PROBES_NOT_RUN, type AbapActivation } from '../../lib/transformation/check-words';
import { sandboxFilesFromStoredCode } from '../../lib/test-sandbox/files';
import { abapCheck } from '../../lib/transformation/abap-check';
import { typeCheckCandidate } from '../../lib/test-sandbox/type-check';
import { LEASE_GATE_REPAIR_CALLS, LEASE_MAX_CALLS, LEASE_MAX_IN_FLIGHT } from '../../lib/transformation/lease';
import { generatedCodeLints, packedDecimalFields } from '../../lib/generated-code-lints';
import { geminiTestStubFillText } from '../../lib/gemini-test-stub';
import { PRODUCT_GEMINI_MODEL } from '../../lib/constants';
import { responseSchemaForStage } from '../../lib/model-response-schema';
import { thinkingConfigFor } from '../../lib/model-thinking';
import { modelCompletion, MODEL_INCOMPLETE_CODE } from '../../lib/model-completion';
import { modelDeadline, MODEL_CALL_DEADLINE_MS, MODEL_TIMEOUT_CODE } from '../../lib/model-deadline';
import { isTransientModelError } from '../../lib/model-retry';
import type { GenerationEvent, GenerationStatus } from '../../lib/transformation/types';
import { demoCaseVerdicts, scenarioCases, type DemoCaseRuns, type PackageDemo, type ScenarioVerdict } from './scenario-cases';

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;

/* ----------------------------------------------------------------- types */

export type Track = 'rap' | 'node';

export interface ProgramEntry {
  id: string;
  title: string;
  source: { repo: string | null; file: string | null; entry: string | null; sha256: string; lines: number };
  tracks: Track[];
  holdout: boolean;
  scenarios: { sealed: string | null; provenance: string[] };
}

export interface Scenario {
  id: string;
  group: string;
  title: string;
  expectedForm: 'machine' | 'prose';
  harnessProbe?: string | null;
  pattern?: string | null;
  /** The reviewer's input and expected outcome. Held in memory only; never written to a report. */
  input?: unknown;
  expected?: unknown;
}

export interface ScenarioFile {
  program: string;
  scenarios: Scenario[];
}

/** What a gate reports. `state` passed only when it ran and found nothing that stops activation / compilation. */
export interface GateResult {
  kind: 'abap-activation' | 'node-type-check';
  tool: string;
  state: 'passed' | 'failed' | 'not-run';
  parserErrors: number | null;
  syntaxErrors: number | null;
  typeErrors: number | null;
  otherFindings: number | null;
  reason: string | null;
}

export interface CallRecord {
  ms: number;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  usd: number;
  code: string | null;
}

export interface RunRecord {
  program: string;
  track: Track;
  run: number;
  /** The package's own status (GenerationStatus: complete, partial, not-activatable, not-runnable, not-verified) or why there is none. */
  status: GenerationStatus | 'blocked' | 'fallback' | 'failed' | 'cap-reached';
  reason: string | null;
  durationMs: number;
  prepareMs: number;
  generateMs: number;
  functions: { total: number; written: number; notWritten: number; repaired: number };
  notWritten: Array<{ unitId: string; reason: string }>;
  calls: { count: number; failed: number; usd: number; inputTokens: number; outputTokens: number; thoughtTokens: number };
  stop: GenerationRunResult['stop'] | null;
  rounds: number;
  checks: CheckSummary[];
  gate: GateResult;
  engineCases: { derived: number; passed: number; failed: number; notRun: number; reason: string | null };
  probes: { pass: number; fail: number; notRunnable: number; notApplicable: number; executed: boolean; reason: string | null; byPattern: Record<string, string> };
  /** The Node that ran the harness step (cases and probes); null when it did not run (ABAP, nothing generated). */
  harnessNode: string | null;
  /** Each round of checks in the repair loop: what the gate check (abap / types) found and how much of it became repair reasons. */
  loop: LoopRound[];
  scenarios: ScenarioTally;
}

/** One verify round of the orchestrator, as the suite saw it. Counts and unit ids only. */
export interface LoopRound {
  round: number;
  /** The gate check that ran in this round ('abap' on RAP, 'types' on Node), or null when it did not. */
  gate: 'abap' | 'types' | null;
  /** Its files with errors, of its files. */
  gateFailedFiles: number;
  gateFiles: number;
  /** Repair reasons of this round by check kind (lint, formats, abap, types, …), and how many name a unit. */
  failures: Record<string, number>;
  /** Gate failures handed to a unit — these are what the next repair round sends to the model. */
  gateToUnits: string[];
  /** Gate failures in engine-written code (no unit): reported, never sent to the model. */
  gateUnowned: number;
  notRun: string[];
}

/** One raw gate finding of the final package, for pattern analysis (gate-findings.json; never in the report). */
export interface RawGateFinding {
  path: string;
  line: number;
  unit: string | null;
  kind: string;
  message: string;
}

export interface ScenarioTally {
  total: number;
  machine: number;
  /** Scenarios whose case of the package ran (3.0.14 item 3): matched by ID to one of the package's executable cases. */
  ran: number;
  matched: number;
  failed: number;
  notJudged: number;
  /** Scenario id → verdict ('pass' | 'fail' | 'not-run: <why>'). IDs only, never values. */
  verdicts: Record<string, string>;
  note: string | null;
}

export interface Row {
  program: string;
  track: Track;
  holdout: boolean;
  runs: number;
  gatePassed: number;
  gate: { parserErrors: number | null; syntaxErrors: number | null; typeErrors: number | null; state: string };
  functions: { total: number; written: number; notWritten: number };
  /** `ran` since 3.0.14 (item 3); a report from before has none. */
  scenarios: { total: number; ran?: number; matched: number; failed: number; notJudged: number };
  engineCases: { derived: number; passed: number; failed: number; notRun: number };
  durationMs: number;
  calls: number;
  usd: number;
  statuses: string[];
}

export interface SuiteReport {
  format: 'clean-core.acceptance-suite/1';
  mode: 'dry' | 'real';
  model: string;
  commit: string;
  dirty: boolean;
  startedAt: string;
  node: string;
  capUsd: number;
  prices: { inPerM: number; outPerM: number } | null;
  spentUsd: number;
  capReached: boolean;
  runsPerProgram: number;
  rows: Row[];
  totals: { programs: number; rows: number; gatePassed: number; functionsWritten: number; functionsTotal: number; scenariosRan?: number; scenariosMatched: number; scenariosFailed?: number; scenariosTotal: number; calls: number; usd: number; durationMs: number };
  diff: Array<{ key: string; changes: string[] }> | null;
  previous: string | null;
  runs: RunRecord[];
  limits: string[];
}

/* ------------------------------------------------------------- arguments */

interface Args {
  mode: 'dry' | 'real';
  programs: string[] | null;
  tracks: Track[] | null;
  runs: number;
  capUsd: number;
  priceIn: number | null;
  priceOut: number | null;
  model: string;
  sources: string;
  out: string;
  envFile: string | null;
  seal: boolean;
  list: boolean;
}

export function parseArgs(argv: string[], env: Record<string, string | undefined> = process.env): Args {
  const a: Args = {
    mode: 'dry',
    programs: null,
    tracks: null,
    runs: 0,
    capUsd: 10,
    priceIn: null,
    priceOut: null,
    model: PRODUCT_GEMINI_MODEL,
    sources: path.join(env.USERPROFILE ?? env.HOME ?? '.', 'OneDrive', 'Desktop'),
    out: path.join(ROOT, '.acceptance', 'runs'),
    envFile: null,
    seal: false,
    list: false,
  };
  const num = (v: string | undefined, name: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a non-negative number`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => argv[++i];
    if (k === '--mode') {
      const m = v();
      if (m !== 'dry' && m !== 'real') throw new Error('--mode must be dry or real');
      a.mode = m;
    } else if (k === '--programs') a.programs = v().split(',').map((s) => s.trim()).filter(Boolean);
    else if (k === '--tracks') {
      const t = v().split(',').map((s) => s.trim());
      if (t.some((x) => x !== 'rap' && x !== 'node')) throw new Error('--tracks takes rap and/or node');
      a.tracks = t as Track[];
    } else if (k === '--runs') a.runs = Math.max(1, Math.floor(num(v(), '--runs')));
    else if (k === '--cap-usd') a.capUsd = num(v(), '--cap-usd');
    else if (k === '--price-in') a.priceIn = num(v(), '--price-in');
    else if (k === '--price-out') a.priceOut = num(v(), '--price-out');
    else if (k === '--model') a.model = v();
    else if (k === '--sources') a.sources = path.resolve(v());
    else if (k === '--out') a.out = path.resolve(v());
    else if (k === '--env-file') a.envFile = path.resolve(v());
    else if (k === '--seal') a.seal = true;
    else if (k === '--list') a.list = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (a.runs === 0) a.runs = a.mode === 'real' ? 3 : 1;
  if (a.priceIn === null && env.ACCEPTANCE_PRICE_IN) a.priceIn = num(env.ACCEPTANCE_PRICE_IN, 'ACCEPTANCE_PRICE_IN');
  if (a.priceOut === null && env.ACCEPTANCE_PRICE_OUT) a.priceOut = num(env.ACCEPTANCE_PRICE_OUT, 'ACCEPTANCE_PRICE_OUT');
  // No invented list price: a real run says what a token costs, or it does not start.
  if (a.mode === 'real' && (a.priceIn === null || a.priceOut === null)) {
    throw new Error('--mode real needs --price-in and --price-out (USD per 1M tokens, from the provider pricing page) so the cost cap can hold');
  }
  return a;
}

/* --------------------------------------------------------------- helpers */

function loadEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const l of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest('hex');

export function loadPrograms(): ProgramEntry[] {
  return (JSON.parse(fs.readFileSync(path.join(HERE, 'programs.json'), 'utf8')) as { programs: ProgramEntry[] }).programs;
}

/** The program's ABAP, from the repository or the sources folder, refused unless it matches its fingerprint. */
export async function loadSource(p: ProgramEntry, sourcesDir: string): Promise<string> {
  let buf: Buffer;
  if (p.source.repo) {
    buf = fs.readFileSync(path.join(ROOT, p.source.repo));
  } else {
    const file = path.join(sourcesDir, p.source.file ?? '');
    if (!p.source.file || !fs.existsSync(file)) throw new Error(`source ${p.source.file} not found in ${sourcesDir} (pass --sources)`);
    const raw = fs.readFileSync(file);
    if (p.source.entry) {
      // Read in memory only; nothing of the archive is written or executed.
      const zip = await JSZip.loadAsync(raw);
      const entry = zip.file(p.source.entry);
      if (!entry) throw new Error(`${p.source.file} has no entry ${p.source.entry}`);
      buf = await entry.async('nodebuffer');
    } else buf = raw;
  }
  // The pin is over the text with LF line ends: a file in the repository is
  // checked out with CRLF on Windows and LF in CI, and both are the same source.
  const text = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const got = sha256(Buffer.from(text, 'utf8'));
  if (got !== p.source.sha256) throw new Error(`${p.id}: the source does not match its fingerprint (sha256 ${got.slice(0, 12)}…, expected ${p.source.sha256.slice(0, 12)}…)`);
  return text;
}

async function openScenarioFile(p: ProgramEntry, key: string | null): Promise<{ file: ScenarioFile | null; reason: string | null }> {
  if (!p.scenarios.sealed) return { file: null, reason: p.holdout ? 'holdout: no tuned expectations' : 'no external scenarios for this program' };
  const mod = (await import(pathToFileURL(path.join(HERE, 'scenarios.mjs')).href)) as { openScenarios: (p: ProgramEntry, key: string | null) => ScenarioFile | null };
  try {
    return { file: mod.openScenarios(p, key), reason: null };
  } catch (err) {
    return { file: null, reason: `scenarios not opened: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ----------------------------------------------------------------- model */

export interface Meter {
  capUsd: number;
  spentUsd: number;
  capReached: boolean;
}

/** The refusal the orchestrator reads as "the lease ended": no further call of this generation starts. */
const capError = () => Object.assign(new Error('the acceptance cost cap is reached'), { code: 'lease-exhausted', status: 403, capReached: true });

export function dryModel(calls: CallRecord[]): FillModel {
  return async (prompt) => {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 5));
    calls.push({ ms: Date.now() - t0, ok: true, inputTokens: 0, outputTokens: 0, thoughtTokens: 0, usd: 0, code: null });
    return geminiTestStubFillText(prompt);
  };
}

const RETRY_DELAYS_MS = [2_000, 4_000, 8_000];

export function realModel(opts: { apiKey: string; model: string; priceIn: number; priceOut: number; meter: Meter; calls: CallRecord[] }): FillModel {
  const ai = new GoogleGenAI({ apiKey: opts.apiKey });
  const schema = responseSchemaForStage('transformation', 'transformation-fill');
  const thinkingConfig = thinkingConfigFor('transformation-fill');
  // Before any call: the worst case it can still cost — its prompt at ~3 characters a token and a
  // full 65,536-token answer — must fit under the cap, or it is not sent.
  const worstCase = (prompt: string) => ((prompt.length / 3) * opts.priceIn + 65_536 * opts.priceOut) / 1e6;
  return async (prompt, signal) => {
    if (opts.meter.capReached || opts.meter.spentUsd + worstCase(prompt) > opts.meter.capUsd) {
      opts.meter.capReached = true;
      throw capError();
    }
    const t0 = Date.now();
    const deadline = modelDeadline(MODEL_CALL_DEADLINE_MS, signal);
    const record = (r: Partial<CallRecord>) => {
      const c: CallRecord = { ms: Date.now() - t0, ok: false, inputTokens: 0, outputTokens: 0, thoughtTokens: 0, usd: 0, code: null, ...r };
      opts.meter.spentUsd += c.usd;
      opts.calls.push(c);
    };
    try {
      let lastErr: unknown = null;
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        try {
          const result = await ai.models.generateContent({
            model: opts.model,
            contents: prompt,
            config: { responseMimeType: 'application/json', ...(schema ? { responseJsonSchema: schema } : {}), ...(thinkingConfig ? { thinkingConfig } : {}), abortSignal: deadline.signal },
          });
          const u = result.usageMetadata ?? {};
          const inputTokens = u.promptTokenCount ?? 0;
          const outputTokens = u.candidatesTokenCount ?? 0;
          const thoughtTokens = u.thoughtsTokenCount ?? 0;
          const usd = (inputTokens * opts.priceIn + (outputTokens + thoughtTokens) * opts.priceOut) / 1e6;
          const completion = modelCompletion({ text: result.text, finishReason: result.candidates?.[0]?.finishReason ?? null, blockReason: result.promptFeedback?.blockReason ?? null });
          record({ ok: completion.ok, inputTokens, outputTokens, thoughtTokens, usd, code: completion.ok ? null : MODEL_INCOMPLETE_CODE });
          if (!completion.ok) throw Object.assign(new Error(`the answer was not complete (${completion.reason})`), { status: 502, code: MODEL_INCOMPLETE_CODE });
          return completion.text;
        } catch (err) {
          if ((err as { code?: string }).code === MODEL_INCOMPLETE_CODE) throw err;
          lastErr = err;
          const message = err instanceof Error ? err.message : String(err);
          if (deadline.signal.aborted || attempt === RETRY_DELAYS_MS.length || !isTransientModelError(message)) break;
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
      }
      if (deadline.timedOut()) {
        record({ code: MODEL_TIMEOUT_CODE });
        throw Object.assign(new Error('the model did not answer before the deadline'), { status: 504, code: MODEL_TIMEOUT_CODE });
      }
      const e = lastErr as { name?: string; status?: unknown; message?: string } | null;
      if (e?.name === 'AbortError' || signal.aborted) throw lastErr;
      const status = typeof e?.status === 'number' ? e.status : 502;
      record({ code: `provider-${status}` });
      // Only the status and the first line: never the prompt or what the provider echoed of it.
      throw Object.assign(new Error(`the provider refused the call (HTTP ${status}): ${String(e?.message ?? '').split('\n')[0].slice(0, 160)}`), { status });
    } finally {
      deadline.clear();
    }
  };
}

/* ----------------------------------------------------------------- gates */

type FileLike = { path: string; content: string };

/** The gate's findings onto the units whose fill markers enclose them (verify.ts `markerSpans` / `unitAt`). */
function rawFindings(files: FileLike[], findings: ReadonlyArray<{ path: string; line: number; kind: string; message: string }>): RawGateFinding[] {
  const spans = markerSpans(files);
  return findings.map((f) => ({ path: f.path, line: f.line, unit: unitAt(spans, f.path, f.line), kind: f.kind, message: f.message }));
}

export async function abapGate(files: FileLike[], sink?: (findings: RawGateFinding[]) => void): Promise<GateResult> {
  // The activation gate of 3.0.13 item 1 (lib/transformation/abap-check.ts): abaplint with the
  // package's shipped config and the SAP stubs; parser and syntax errors make it not activatable.
  const tool = 'lib/transformation/abap-check.ts (abapCheck)';
  const r = abapCheck(files);
  if (!r.ran) return { kind: 'abap-activation', tool, state: 'not-run', parserErrors: null, syntaxErrors: null, typeErrors: null, otherFindings: null, reason: r.reason };
  const a = r.activation;
  sink?.(rawFindings(files, a.findings));
  return {
    kind: 'abap-activation',
    tool: `${tool}; abaplint ${a.abaplint}`,
    state: a.activatable ? 'passed' : 'failed',
    parserErrors: a.parserErrors,
    syntaxErrors: a.syntaxErrors,
    typeErrors: null,
    otherFindings: a.unresolved + a.lint,
    reason: a.unresolved > 0 ? `${a.unresolved} finding(s) name SAP objects the check cannot see (${a.unresolvedNames.join(', ') || 'unnamed'}) - not counted as errors` : null,
  };
}

export async function nodeGate(files: FileLike[], sink?: (findings: RawGateFinding[]) => void): Promise<GateResult> {
  // The compile gate of the Node route (3.0.13, Node core): the candidate under its own tsconfig.json, in process.
  const tool = 'lib/test-sandbox/type-check.ts (typeCheckCandidate)';
  const r = typeCheckCandidate(files);
  if (!r.ran) return { kind: 'node-type-check', tool, state: 'not-run', parserErrors: null, syntaxErrors: null, typeErrors: null, otherFindings: null, reason: r.reason };
  sink?.(rawFindings(files, r.findings.map((f) => ({ path: f.path, line: f.line, kind: f.code, message: f.message }))));
  return {
    kind: 'node-type-check',
    tool: `${tool}; TypeScript ${r.typescript}`,
    state: r.errors === 0 ? 'passed' : 'failed',
    parserErrors: null,
    syntaxErrors: null,
    typeErrors: r.errors,
    otherFindings: null,
    reason: r.errors > 0 ? `${r.failedFiles} of ${r.files} file(s) do not compile` : null,
  };
}

/** The demo cases a package carries (`test/fixtures/original-demo.json`), or null when it has none or it is unreadable. */
export function packageDemoOf(files: readonly FileLike[]): PackageDemo | null {
  const f = files.find((x) => x.path.replace(/\\/g, '/') === 'test/fixtures/original-demo.json');
  if (!f) return null;
  try {
    const d = JSON.parse(f.content) as { switch?: { parameter?: string | null } | null; cases?: Array<{ number?: unknown }> };
    const cases = (d.cases ?? []).filter((c) => Number.isInteger(c.number)).map((c) => ({ number: c.number as number }));
    return { switch: d.switch ? { parameter: d.switch.parameter ?? null } : null, cases };
  } catch {
    return null;
  }
}

/** Unpack the package where the harness reads it: a fresh directory under the run folder, never a link. */
function writePackage(dir: string, files: FileLike[]): void {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    const rel = f.path.replace(/\\/g, '/').replace(/^\/+/, '');
    const target = path.resolve(dir, rel);
    if (!target.startsWith(path.resolve(dir) + path.sep)) throw new Error(`a package path leaves the package: ${f.path}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, f.content);
  }
}

interface HarnessOutcome {
  engineCases: RunRecord['engineCases'];
  probes: RunRecord['probes'];
}

interface HarnessStepOutcome extends HarnessOutcome {
  node: string;
  /** The original's demo cases the scenarios name, run through the package (`harness-step.mjs` demoCaseRuns). */
  demoCases?: DemoCaseRuns;
}

/** Where the harness step runs: in this process (Node >= 25), under a Node 25 binary, or here with the reason that binary is missing. */
export interface HarnessNode {
  binary: string | null;
  version: string;
  reason: string | null;
}

let harnessNodeCache: HarnessNode | null = null;

const nodeMajor = (v: string) => Number(v.replace(/^v/, '').split('.')[0]);

/**
 * The Node the harness step runs under. The execution rule (`lib/sandbox.mjs`, `decideExecution`) runs a generated
 * package only when the platform refuses a socket under the permission model — Node >= 25. On an older local Node the
 * step runs in a Node 25 child: `ACCEPTANCE_HARNESS_NODE` (a binary), else `npx --yes --package=node@25` (cached by
 * npm after the first fetch); `ACCEPTANCE_HARNESS_NODE=self` keeps it in this process. Only the harness step runs
 * there; the generation and the gates stay in this process.
 */
export function harnessNode(env: Record<string, string | undefined> = process.env): HarnessNode {
  if (nodeMajor(process.version) >= 25) return { binary: null, version: process.version, reason: null };
  if (env.ACCEPTANCE_HARNESS_NODE === 'self') return { binary: null, version: process.version, reason: 'ACCEPTANCE_HARNESS_NODE=self keeps the harness step on this Node' };
  if (harnessNodeCache) return harnessNodeCache;
  const versionOf = (bin: string) => {
    const r = spawnSync(bin, ['-p', 'process.version'], { encoding: 'utf8', timeout: 30_000, windowsHide: true });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  let binary: string | null = null;
  let why = '';
  if (env.ACCEPTANCE_HARNESS_NODE) {
    binary = env.ACCEPTANCE_HARNESS_NODE;
    why = 'ACCEPTANCE_HARNESS_NODE';
  } else {
    // A fixed command, nothing interpolated; on Windows npx is npx.cmd, which only a shell starts.
    const opts = { encoding: 'utf8' as const, timeout: 300_000, windowsHide: true };
    const r =
      process.platform === 'win32'
        ? spawnSync('npx --yes --package=node@25 -- node -p process.execPath', { ...opts, shell: true })
        : spawnSync('npx', ['--yes', '--package=node@25', '--', 'node', '-p', 'process.execPath'], opts);
    const last = (r.stdout ?? '').trim().split(/\r?\n/).pop() ?? '';
    if (r.status === 0 && last && fs.existsSync(last)) binary = last;
    else why = `npx --package=node@25 failed (${r.error?.message ?? `exit ${r.status}`}: ${(r.stderr ?? '').trim().split(/\r?\n/).pop()?.slice(0, 160) ?? ''})`;
  }
  const version = binary ? versionOf(binary) : null;
  harnessNodeCache =
    binary && version && nodeMajor(version) >= 25
      ? { binary, version, reason: null }
      : { binary: null, version: process.version, reason: `no Node >= 25 for the harness step: ${binary ? `${why} gave ${version ?? 'nothing runnable'}` : why}` };
  return harnessNodeCache;
}

/** Only what the harness step needs to start and find a temp directory. Nothing from the caller's secrets. */
function harnessEnv(): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const k of ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'windir', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE']) if (process.env[k]) env[k] = process.env[k];
  return env as NodeJS.ProcessEnv;
}

/** The engine cases and the failure-pattern probes, by the repository's harness under its own execution rule (`harness-step.mjs`). */
export async function runHarnessChecks(pkgDir: string, derived: number, node: HarnessNode = harnessNode(), demoCases: readonly number[] = []): Promise<HarnessStepOutcome> {
  const step = path.join(HERE, 'harness-step.mjs');
  if (node.binary) {
    const out = `${pkgDir}.harness.json`;
    const args = [step, pkgDir, String(derived), out, ...(demoCases.length > 0 ? [demoCases.join(',')] : [])];
    const r = spawnSync(node.binary, args, { cwd: ROOT, env: harnessEnv(), encoding: 'utf8', timeout: 600_000, windowsHide: true });
    try {
      if (r.status === 0 && fs.existsSync(out)) return JSON.parse(fs.readFileSync(out, 'utf8')) as HarnessStepOutcome;
    } catch {
      /* unreadable: said below */
    } finally {
      fs.rmSync(out, { force: true });
    }
    const why = `the harness step under ${node.version} stopped (${r.error?.message ?? `exit ${r.status}`}: ${(r.stderr ?? '').trim().split(/\r?\n/).pop()?.slice(0, 160) ?? ''})`;
    return {
      node: node.version,
      engineCases: { derived, passed: 0, failed: 0, notRun: derived, reason: why },
      probes: { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: why, byPattern: {} },
    };
  }
  // In process: Node >= 25 here, or no Node 25 to be had (the rule then scans and says why; the reason says what was missing).
  let r: HarnessStepOutcome;
  try {
    const mod = (await import(pathToFileURL(step).href)) as { harnessStep: (pkg: string, derived: number) => Promise<HarnessStepOutcome>; demoCaseRuns: (pkg: string, numbers: readonly number[]) => Promise<DemoCaseRuns> };
    r = await mod.harnessStep(pkgDir, derived);
    if (demoCases.length > 0) r.demoCases = await mod.demoCaseRuns(pkgDir, demoCases);
  } catch (err) {
    // A harness that cannot be loaded is a check that did not run, never a stopped suite.
    const why = `the harness step could not be loaded: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
    r = { node: process.version, engineCases: { derived, passed: 0, failed: 0, notRun: derived, reason: why }, probes: { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: why, byPattern: {} } };
  }
  if (node.reason) {
    if (r.engineCases.reason) r.engineCases.reason = `${r.engineCases.reason} — ${node.reason}`;
    if (r.probes.reason) r.probes.reason = `${r.probes.reason} — ${node.reason}`;
  }
  return r;
}

/* ------------------------------------------------------------- scenarios */

/** Probe → the catalogue patterns it judges (the harness's own map, read from run.mjs). */
async function probePatterns(): Promise<Record<string, string[]>> {
  const harness = (await import(pathToFileURL(path.join(HERE, 'run.mjs')).href)) as { PROBE_PATTERNS: Record<string, string[]> };
  return harness.PROBE_PATTERNS;
}

/**
 * One verdict per scenario, by execution only. A scenario a harness probe
 * covers takes the probe's verdict on this package; every other one is
 * "not run" with the reason — a value merely found in the generated text is
 * never a match. A gate module that runs reference cases (ABAP Unit, the Node
 * case runner) can hand verdicts in by scenario id (`external`).
 */
export function judgeScenarios(file: ScenarioFile | null, reason: string | null, track: Track, probes: RunRecord['probes'], patterns: Record<string, string[]>, external: Record<string, ScenarioVerdict> = {}): ScenarioTally {
  const t: ScenarioTally = { total: 0, machine: 0, ran: 0, matched: 0, failed: 0, notJudged: 0, verdicts: {}, note: reason };
  if (!file) return t;
  for (const s of file.scenarios) {
    t.total++;
    if (s.expectedForm === 'machine') t.machine++;
    let v: string;
    const given = external[s.id];
    const ext = given === undefined ? undefined : typeof given === 'string' ? { ran: true, verdict: given } : given;
    if (ext && ext.ran) t.ran++;
    if (ext) v = ext.verdict;
    else if (track === 'rap' && s.expectedForm === 'machine') v = 'not-run: needs ABAP Unit execution in an SAP system';
    else if (s.harnessProbe && patterns[s.harnessProbe]) {
      const st = patterns[s.harnessProbe].map((p) => probes.byPattern[p]).find(Boolean) ?? 'not-runnable';
      v = st === 'pass' ? 'pass' : st === 'fail' ? 'fail' : `not-run: probe ${s.harnessProbe} ${st}${probes.reason ? ` (${probes.reason.slice(0, 80)})` : ''}`;
    } else if (s.expectedForm === 'prose') v = 'not-run: prose expectation, judged by a reviewer';
    else v = 'not-run: no case runner maps this scenario yet';
    t.verdicts[s.id] = v;
    if (v === 'pass') t.matched++;
    else if (v === 'fail') t.failed++;
    else t.notJudged++;
  }
  return t;
}

/* ------------------------------------------------------------------- run */

interface RunContext {
  args: Args;
  meter: Meter;
  apiKey: string | null;
  workDir: string;
  patterns: Record<string, string[]>;
  /** Raw gate findings per run, written to gate-findings.json beside the report. */
  findings: GateFindingsRecord[];
}

/** One run's raw gate findings: the final package's, and the repair reasons the gate gave in the loop's last round. */
export interface GateFindingsRecord {
  program: string;
  track: Track;
  run: number;
  tool: string;
  state: GateResult['state'];
  /** Errors only (parser/syntax on ABAP, every compiler error on Node), first 200, with their unit. */
  errors: RawGateFinding[];
  /** The same errors grouped by message (identifiers and numbers kept), most frequent first. */
  topMessages: Array<{ message: string; count: number; units: string[] }>;
  /** The ABAP check's other findings (unresolved SAP objects, lint) by kind; empty on Node. */
  otherByKind: Record<string, number>;
  /** The gate's repair reasons of the loop's last round, as the orchestrator handed them to the units. */
  lastRoundRepairReasons: Array<{ unitId: string | null; check: string; failure: string }>;
}

const GATE_ERRORS_KEPT = 200;

export function gateFindingsRecord(base: Pick<GateFindingsRecord, 'program' | 'track' | 'run' | 'tool' | 'state' | 'lastRoundRepairReasons'>, raw: readonly RawGateFinding[]): GateFindingsRecord {
  const isError = (f: RawGateFinding) => (base.track === 'rap' ? f.kind === 'parser' || f.kind === 'syntax' : true);
  const errors = raw.filter(isError);
  const groups = new Map<string, { count: number; units: Set<string> }>();
  for (const f of errors) {
    const key = base.track === 'rap' ? `${f.kind}: ${f.message}` : `${f.kind} ${f.message}`;
    const g = groups.get(key) ?? { count: 0, units: new Set<string>() };
    g.count++;
    g.units.add(f.unit ?? '(engine code)');
    groups.set(key, g);
  }
  const otherByKind: Record<string, number> = {};
  for (const f of raw) if (!isError(f)) otherByKind[f.kind] = (otherByKind[f.kind] ?? 0) + 1;
  return {
    ...base,
    errors: errors.slice(0, GATE_ERRORS_KEPT),
    topMessages: [...groups.entries()].sort((x, y) => y[1].count - x[1].count).slice(0, 40).map(([message, g]) => ({ message, count: g.count, units: [...g.units].sort() })),
    otherByKind,
  };
}

/** Why the route's runner half does not answer inside the suite's loop. */
export const LOOP_CASES_NOT_RUN = 'Engine cases not run in the loop: the acceptance suite runs them once after the generation with the repository harness.';
export const LOOP_PROBES_NOT_RUN = 'Failure-pattern probes not run in the loop: the acceptance suite runs them once after the generation with the repository harness.';

/**
 * What `POST /api/run-tests { mode: 'verify' }` answers for a candidate, computed here with the route's own functions
 * in the route's order (`verifyCandidateResponse`, app/api/run-tests/route.ts): the candidate read back through
 * `sandboxFilesFromStoredCode` as the route reads a draft's stored code; an ABAP package (`isAbapPackage`) checked
 * by `abapCheck`, with the cases and probes not run for the route's own reasons; a Node package type-checked by
 * `typeCheckCandidate`. The route's runner half (engine cases and probes in the isolated runner) needs a project,
 * a signed source and a runner, so here it answers "not run" — the suite runs both once after the generation with
 * the repository's harness. The answer goes into `createRunnerVerifier`, which maps it onto the units exactly as
 * on the page (`mapAbapFindings`, `mapTypeFindings`).
 */
export function localVerifyRoute(): (files: readonly FileLike[], signal: AbortSignal) => Promise<VerifyRunAnswer> {
  return async (files) => {
    const candidate = sandboxFilesFromStoredCode(JSON.stringify(files.map((f) => ({ path: f.path, content: f.content }))));
    if (isAbapPackage(candidate)) {
      const checked = abapCheck(candidate);
      return {
        mode: 'verify',
        buildError: null,
        abap: checked.ran ? { ran: true, activation: checked.activation } : { ran: false, reason: checked.reason },
        engine: { ran: false, reason: ABAP_CASES_NOT_RUN },
        probes: { ran: false, reason: ABAP_PROBES_NOT_RUN },
      };
    }
    const typed = typeCheckCandidate(candidate);
    const types: TypeCheckAnswer = typed.ran
      ? { ran: true, typescript: typed.typescript, files: typed.files, failedFiles: typed.failedFiles, errors: typed.errors, findings: typed.findings }
      : { ran: false, reason: typed.reason };
    return { mode: 'verify', buildError: null, types, engine: { ran: false, reason: LOOP_CASES_NOT_RUN }, probes: { ran: false, reason: LOOP_PROBES_NOT_RUN } };
  };
}

/** The verifier wrapped so each round's outcome is counted (it is passed through unchanged). */
function observed(verify: Verify, rounds: LoopRound[], last: { failures: Array<{ unitId: string | null; check: string; failure: string }> }): Verify {
  return async (bodies, ctx) => {
    const o = await verify(bodies, ctx);
    const gateCheck = o.checks.find((c) => c.kind === 'abap' || c.kind === 'types');
    const gateFailures = o.failures.filter((f) => f.check === 'abap' || f.check === 'types');
    const failures: Record<string, number> = {};
    for (const f of o.failures) failures[f.check] = (failures[f.check] ?? 0) + 1;
    rounds.push({
      round: ctx.round,
      gate: gateCheck ? (gateCheck.kind as 'abap' | 'types') : null,
      gateFailedFiles: gateCheck?.failed ?? 0,
      gateFiles: gateCheck?.total ?? 0,
      failures,
      gateToUnits: [...new Set(gateFailures.map((f) => f.unitId).filter((u): u is string => !!u))].sort(),
      gateUnowned: gateFailures.filter((f) => !f.unitId).length,
      notRun: o.notRun.map((n: { kind: CheckKind; reason: string }) => `${n.kind}: ${n.reason.slice(0, 160)}`),
    });
    last.failures = gateFailures.map((f) => ({ unitId: f.unitId, check: f.check, failure: f.failure }));
    return o;
  };
}


export async function runOne(p: ProgramEntry, track: Track, run: number, source: string, scen: { file: ScenarioFile | null; reason: string | null }, ctx: RunContext): Promise<RunRecord> {
  const t0 = Date.now();
  const calls: CallRecord[] = [];
  const empty = (): RunRecord => ({
    program: p.id,
    track,
    run,
    status: 'failed',
    reason: null,
    durationMs: 0,
    prepareMs: 0,
    generateMs: 0,
    functions: { total: 0, written: 0, notWritten: 0, repaired: 0 },
    notWritten: [],
    calls: { count: 0, failed: 0, usd: 0, inputTokens: 0, outputTokens: 0, thoughtTokens: 0 },
    stop: null,
    rounds: 0,
    checks: [],
    gate: { kind: track === 'rap' ? 'abap-activation' : 'node-type-check', tool: 'none', state: 'not-run', parserErrors: null, syntaxErrors: null, typeErrors: null, otherFindings: null, reason: 'nothing was generated' },
    engineCases: { derived: 0, passed: 0, failed: 0, notRun: 0, reason: null },
    probes: { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: 'nothing was generated', byPattern: {} },
    harnessNode: null,
    loop: [],
    scenarios: judgeScenarios(scen.file, scen.reason, track, { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: 'nothing was generated', byPattern: {} }, {}),
  });
  const rec = empty();
  const finish = () => {
    rec.durationMs = Date.now() - t0;
    rec.calls = {
      count: calls.length,
      failed: calls.filter((c) => !c.ok).length,
      usd: calls.reduce((s, c) => s + c.usd, 0),
      inputTokens: calls.reduce((s, c) => s + c.inputTokens, 0),
      outputTokens: calls.reduce((s, c) => s + c.outputTokens, 0),
      thoughtTokens: calls.reduce((s, c) => s + c.thoughtTokens, 0),
    };
    return rec;
  };
  if (ctx.meter.capReached) {
    rec.status = 'cap-reached';
    rec.reason = 'not started: the cost cap was reached earlier in this invocation';
    return finish();
  }

  // 1. Plan and scaffold — as the page's worker does.
  const contextText = '';
  const prep = prepareEngineLed({ source, track, program: p.id.toUpperCase(), decisions: [], contextText });
  rec.prepareMs = Date.now() - t0;
  if (!prep.ok) {
    rec.status = 'fallback';
    rec.reason = `the engine-led path refused the program (the page would fall back to the single call): ${prep.reason}`;
    return finish();
  }
  const prepared: EngineLedPrepared = prep;
  rec.engineCases.derived = prepared.facts.cases;
  const check = preflight({ ...preflightFactsOf(prepared, contextText), window: null });
  if (check.blocked) {
    rec.status = 'blocked';
    rec.reason = `the pre-flight check blocks the generation: ${check.blocked.title}`;
    return finish();
  }

  // 2. Fills, checks and repairs — the orchestrator with the page's arguments.
  const checkSummaries = new Map<string, CheckSummary>();
  const onEvent = (e: GenerationEvent) => {
    if (e.t !== 'check') return;
    checkSummaries.set(`${e.kind}:${e.scope ?? ''}`, checkSummaryOf<CheckSummary>({ kind: e.kind, total: e.total, failed: e.failed, passed: e.passed, notRun: e.notRun, scope: e.scope, notRunReason: e.notRunReason, baseThrew: e.baseThrew }));
  };
  // The verifier as the page builds it (transformation/page.tsx): the route's checks behind `runOnRunner` — here
  // `localVerifyRoute`, the route's own functions in process — with the activation check (RAP) and the type check
  // (Node) mapped onto the units by `createRunnerVerifier` and handed back as repair reasons.
  const runOnRunner = localVerifyRoute();
  let lastActivation: AbapActivation | null = null;
  let lastTypeCheck: TypeCheckAnswer | null = null;
  const lastRound = { failures: [] as Array<{ unitId: string | null; check: string; failure: string }> };
  const verify = observed(
    createRunnerVerifier({
      track: prepared.scaffold.track,
      onActivation: (a) => {
        lastActivation = a;
      },
      onTypeCheck: (t) => {
        lastTypeCheck = t;
      },
      candidate: (bodies) => candidateFiles(prepared, bodies),
      units: prepared.fillUnits.map((u) => ({ unitId: u.unitId, rules: u.rules.map((r) => r.id), kind: prepared.plan.units.find((x) => x.id === u.unitId)?.kind })),
      lint: (candidate) => generatedCodeLints(candidate, { decimalFields: packedDecimalFields(source) }).map((f) => ({ path: f.file, line: f.line, message: `${f.severity} ${f.message}` })),
      runOnRunner,
      formats: prepared.scaffold.track === 'rap' ? packageFormatsHook(affSchemaSource) : undefined,
    }),
    rec.loop,
    lastRound,
  );
  const model =
    ctx.args.mode === 'real'
      ? realModel({ apiKey: ctx.apiKey ?? '', model: ctx.args.model, priceIn: ctx.args.priceIn ?? 0, priceOut: ctx.args.priceOut ?? 0, meter: ctx.meter, calls })
      : dryModel(calls);
  const g0 = Date.now();
  let result: GenerationRunResult;
  try {
    result = await runGeneration({
      units: prepared.fillUnits,
      plan: prepared.plan.units,
      bundleOptions: { track: prepared.scaffold.track, program: prepared.plan.program, context: contextText },
      model,
      guardBody: guardBodyOf(prepared),
      normalizeBody: normalizeBodyOf(prepared),
      verify,
      // As on the page: on Node complete only when these ran in full; the scaffold's own gate first (RAP activation, Node type check).
      ...(prepared.scaffold.track === 'node' ? { mustRun: ['types', 'cases', 'probes'] as const } : {}),
      scaffoldCheck: (prepared.scaffold.track === 'rap' ? abapScaffoldCheck : nodeScaffoldCheck)(prepared.scaffold.files, runOnRunner),
      budget: LEASE_MAX_CALLS,
      // As a lease grants them (owner decision 14.10.2026): calls only repairs of gate errors may spend.
      gateRepairBudget: LEASE_GATE_REPAIR_CALLS,
      maxInFlight: LEASE_MAX_IN_FLIGHT,
      onEvent,
    });
  } catch (err) {
    rec.reason = `the generation stopped: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`;
    return finish();
  }
  rec.generateMs = Date.now() - g0;
  rec.stop = result.stop;
  rec.rounds = result.rounds;

  // 3. The package, as the page assembles it before storing.
  let files: FileLike[];
  try {
    const pkg = assembleEngineLed(prepared, result, {
      contextDigest: null,
      runId: null,
      checks: [...checkSummaries.values()],
      budget: LEASE_MAX_CALLS,
      gateRepairBudget: LEASE_GATE_REPAIR_CALLS,
      activation: lastActivation,
      typeCheck: typeCheckRecordOf(lastTypeCheck),
    });
    files = pkg.files;
    rec.checks = pkg.summary.checks;
    rec.functions = { total: pkg.summary.units, written: pkg.summary.written, notWritten: pkg.summary.notWritten.length, repaired: pkg.summary.repaired };
    rec.notWritten = pkg.summary.notWritten.map((n) => ({ unitId: n.unitId, reason: n.reason.slice(0, 160) }));
    rec.status = pkg.summary.status;
  } catch (err) {
    rec.reason = err instanceof Error ? err.message.split('\n')[0] : String(err);
    return finish();
  }
  if (ctx.meter.capReached) {
    rec.status = 'cap-reached';
    rec.reason = 'the cost cap stopped this generation; what was written is measured';
  }

  // 4. Gate, cases and probes on the package.
  let raw: RawGateFinding[] = [];
  const sink = (f: RawGateFinding[]) => {
    raw = f;
  };
  rec.gate = track === 'rap' ? await abapGate(files, sink) : await nodeGate(files, sink);
  let external: Record<string, ScenarioVerdict> = {};
  ctx.findings.push(gateFindingsRecord({ program: p.id, track, run, tool: rec.gate.tool, state: rec.gate.state, lastRoundRepairReasons: lastRound.failures }, raw));
  if (track === 'rap') {
    // An ABAP package carries its cases as ABAP Unit data; the JavaScript harness has nothing to run in it.
    const why = 'ABAP package: the cases are ABAP Unit data and the probes call JavaScript exports — running either needs an SAP system';
    rec.engineCases = { derived: prepared.facts.cases, passed: 0, failed: 0, notRun: prepared.facts.cases, reason: why };
    rec.probes = { pass: 0, fail: 0, notRunnable: 0, notApplicable: 0, executed: false, reason: why, byPattern: {} };
  } else {
    const pkgDir = path.join(ctx.workDir, `${p.id}-${track}-${run}`);
    writePackage(pkgDir, files);
    // The scenarios the package's own demo cases answer, matched by ID (3.0.14 item 3); their cases run in the
    // harness step, and the comparison with the sealed expectation happens here, in memory.
    const cases = scenarioCases(scen.file?.scenarios ?? null, packageDemoOf(files));
    const h = await runHarnessChecks(pkgDir, prepared.facts.cases, harnessNode(), [...new Set(cases.values())].sort((a, b) => a - b));
    rec.engineCases = h.engineCases;
    rec.probes = h.probes;
    rec.harnessNode = h.node;
    external = demoCaseVerdicts(scen.file?.scenarios ?? null, cases, h.demoCases ?? null);
  }
  rec.scenarios = judgeScenarios(scen.file, scen.reason, track, rec.probes, ctx.patterns, external);
  return finish();
}

/* ---------------------------------------------------------------- report */

export function rowsOf(runs: RunRecord[], programs: ProgramEntry[]): Row[] {
  const keys = [...new Set(runs.map((r) => `${r.program}|${r.track}`))];
  return keys.map((k) => {
    const [program, track] = k.split('|') as [string, Track];
    const rs = runs.filter((r) => r.program === program && r.track === track);
    const nullableMedian = (xs: Array<number | null>) => (xs.some((x) => x === null) ? null : median(xs as number[]));
    return {
      program,
      track,
      holdout: programs.find((p) => p.id === program)?.holdout ?? false,
      runs: rs.length,
      gatePassed: rs.filter((r) => r.gate.state === 'passed').length,
      gate: {
        parserErrors: nullableMedian(rs.map((r) => r.gate.parserErrors)),
        syntaxErrors: nullableMedian(rs.map((r) => r.gate.syntaxErrors)),
        typeErrors: nullableMedian(rs.map((r) => r.gate.typeErrors)),
        state: [...new Set(rs.map((r) => r.gate.state))].join('/'),
      },
      functions: { total: median(rs.map((r) => r.functions.total)), written: median(rs.map((r) => r.functions.written)), notWritten: median(rs.map((r) => r.functions.notWritten)) },
      scenarios: { total: rs[0]?.scenarios.total ?? 0, ran: median(rs.map((r) => r.scenarios.ran ?? 0)), matched: median(rs.map((r) => r.scenarios.matched)), failed: median(rs.map((r) => r.scenarios.failed)), notJudged: median(rs.map((r) => r.scenarios.notJudged)) },
      engineCases: { derived: median(rs.map((r) => r.engineCases.derived)), passed: median(rs.map((r) => r.engineCases.passed)), failed: median(rs.map((r) => r.engineCases.failed)), notRun: median(rs.map((r) => r.engineCases.notRun)) },
      durationMs: median(rs.map((r) => r.durationMs)),
      calls: median(rs.map((r) => r.calls.count)),
      usd: median(rs.map((r) => r.calls.usd)),
      statuses: rs.map((r) => r.status),
    };
  });
}

export function diffRows(now: Row[], before: Row[] | null): SuiteReport['diff'] {
  if (!before) return null;
  const out: NonNullable<SuiteReport['diff']> = [];
  for (const r of now) {
    const key = `${r.program}/${r.track}`;
    const b = before.find((x) => x.program === r.program && x.track === r.track);
    if (!b) {
      out.push({ key, changes: ['new in this run'] });
      continue;
    }
    const changes: string[] = [];
    const cmp = (label: string, a: number | null, c: number | null, better: 'up' | 'down') => {
      if (a === c || a === null || c === null) return;
      const worse = better === 'up' ? c < a : c > a;
      changes.push(`${label} ${a} → ${c}${worse ? ' (worse)' : ''}`);
    };
    cmp('gate passed', b.gatePassed, r.gatePassed, 'up');
    cmp('parser errors', b.gate.parserErrors, r.gate.parserErrors, 'down');
    cmp('syntax errors', b.gate.syntaxErrors, r.gate.syntaxErrors, 'down');
    cmp('type errors', b.gate.typeErrors, r.gate.typeErrors, 'down');
    cmp('functions written', b.functions.written, r.functions.written, 'up');
    cmp('scenarios ran', b.scenarios.ran ?? null, r.scenarios.ran ?? null, 'up');
    cmp('scenarios matched', b.scenarios.matched, r.scenarios.matched, 'up');
    cmp('scenarios failed', b.scenarios.failed, r.scenarios.failed, 'down');
    cmp('engine cases passed', b.engineCases.passed, r.engineCases.passed, 'up');
    // Noise below 10 s or 20 % is not a change.
    if (b.durationMs > 0 && Math.abs(r.durationMs - b.durationMs) > 10_000 && Math.abs(r.durationMs - b.durationMs) / b.durationMs > 0.2) changes.push(`duration ${Math.round(b.durationMs / 1000)} s → ${Math.round(r.durationMs / 1000)} s`);
    cmp('calls', b.calls, r.calls, 'down');
    if (changes.length) out.push({ key, changes });
  }
  for (const b of before) if (!now.some((r) => r.program === b.program && r.track === b.track)) out.push({ key: `${b.program}/${b.track}`, changes: ['not in this run'] });
  return out;
}

const fmtUsd = (x: number) => `$${x.toFixed(x < 1 ? 3 : 2)}`;
const cell = (s: unknown) => String(s ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

export function toMarkdown(r: SuiteReport): string {
  const L: string[] = [];
  L.push(`# Acceptance suite — ${r.commit.slice(0, 8)} (${r.mode})`);
  L.push('');
  L.push(`${r.startedAt} · model \`${r.model}\` · node ${r.node} · ${r.runsPerProgram} run(s) per program and track (medians) · cap ${fmtUsd(r.capUsd)}, spent ${fmtUsd(r.spentUsd)}${r.capReached ? ' — **cap reached**' : ''}${r.dirty ? ' · working tree had local changes' : ''}`);
  L.push('');
  const t = r.totals;
  L.push(`**${t.gatePassed} of ${t.rows} program/track rows pass the gate in every run · ${t.functionsWritten} of ${t.functionsTotal} functions written · ${t.scenariosRan ?? 0} of ${t.scenariosTotal} scenarios ran in the package, ${t.scenariosMatched} passed and ${t.scenariosFailed ?? 0} failed by execution · ${t.calls} model calls · ${fmtUsd(t.usd)} · ${Math.round(t.durationMs / 1000)} s**`);
  L.push('');
  L.push('| Program | Track | Gate (passed runs) | Parser / syntax / type errors | Functions written | Scenarios ran · passed / failed / not judged | Engine cases passed / failed / not run | Duration | Calls | Cost | Status |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const x of r.rows) {
    L.push(
      `| ${x.program}${x.holdout ? ' (holdout)' : ''} | ${x.track} | ${x.gate.state} (${x.gatePassed}/${x.runs}) | ${cell(x.gate.parserErrors)} / ${cell(x.gate.syntaxErrors)} / ${cell(x.gate.typeErrors)} | ${x.functions.written} of ${x.functions.total} | ${x.scenarios.ran ?? 0} · ${x.scenarios.matched} / ${x.scenarios.failed} / ${x.scenarios.notJudged} of ${x.scenarios.total} | ${x.engineCases.passed} / ${x.engineCases.failed} / ${x.engineCases.notRun} of ${x.engineCases.derived} | ${Math.round(x.durationMs / 1000)} s | ${x.calls} | ${fmtUsd(x.usd)} | ${x.statuses.join(', ')} |`,
    );
  }
  L.push('');
  L.push(`## Against the previous run${r.previous ? ` (${r.previous})` : ''}`);
  L.push('');
  if (!r.diff) L.push('No previous run in this folder.');
  else if (r.diff.length === 0) L.push('No change.');
  else for (const d of r.diff) L.push(`- **${d.key}**: ${d.changes.join('; ')}`);
  L.push('');
  L.push('## Per run');
  L.push('');
  for (const x of r.runs) {
    L.push(`### ${x.program} / ${x.track} / run ${x.run} — ${x.status}`);
    L.push('');
    if (x.reason) L.push(`- ${cell(x.reason)}`);
    L.push(`- gate: ${x.gate.state} by ${x.gate.tool}${x.gate.reason ? ` — ${cell(x.gate.reason)}` : ''}`);
    L.push(`- functions: ${x.functions.written} of ${x.functions.total} written (${x.functions.repaired} after repair), stop \`${x.stop ?? '—'}\`, ${x.rounds} repair round(s)`);
    for (const n of x.notWritten.slice(0, 10)) L.push(`  - not written ${n.unitId}: ${cell(n.reason)}`);
    L.push(`- checks in the loop: ${x.checks.map((c) => `${c.kind}${c.scope ? `/${c.scope}` : ''} ${c.failed}/${c.total} failed`).join(', ') || 'none'}`);
    for (const l of x.loop ?? []) {
      const f = Object.entries(l.failures).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
      L.push(`  - round ${l.round}: ${l.gate ? `${l.gate} ${l.gateFailedFiles}/${l.gateFiles} file(s) failed, ${l.gateToUnits.length} unit(s) sent back${l.gateUnowned ? `, ${l.gateUnowned} in engine code` : ''}` : 'no gate check'}; repair reasons: ${f}`);
    }
    L.push(`- engine cases: ${x.engineCases.passed} passed, ${x.engineCases.failed} failed, ${x.engineCases.notRun} not run of ${x.engineCases.derived}${x.engineCases.reason ? ` — ${cell(x.engineCases.reason.slice(0, 200))}` : ''}`);
    if (x.harnessNode) L.push(`- harness step under Node ${x.harnessNode}`);
    L.push(`- probes: ${x.probes.pass} pass, ${x.probes.fail} fail, ${x.probes.notRunnable} not runnable, ${x.probes.notApplicable} not applicable${x.probes.reason ? ` — ${cell(x.probes.reason.slice(0, 200))}` : ''}`);
    L.push(`- scenarios: ${x.scenarios.ran ?? 0} ran in the package, ${x.scenarios.matched} matched, ${x.scenarios.failed} failed, ${x.scenarios.notJudged} not judged of ${x.scenarios.total}${x.scenarios.note ? ` — ${cell(x.scenarios.note)}` : ''}`);
    const fails = Object.entries(x.scenarios.verdicts).filter(([, v]) => v === 'fail').map(([id]) => id);
    if (fails.length) L.push(`  - failed: ${fails.join(', ')}`);
    L.push(`- ${x.calls.count} model calls (${x.calls.failed} failed), ${x.calls.inputTokens} in / ${x.calls.outputTokens} out / ${x.calls.thoughtTokens} thinking tokens, ${fmtUsd(x.calls.usd)}; ${Math.round(x.durationMs / 1000)} s (plan ${x.prepareMs} ms, generation ${Math.round(x.generateMs / 1000)} s)`);
    L.push('');
  }
  L.push('## What this suite does not measure');
  L.push('');
  for (const l of r.limits) L.push(`- ${l}`);
  L.push('');
  return L.join('\n');
}

const LIMITS = [
  "The context pack is empty and no rule decisions are given: the generation runs from the source alone, not from a project's earlier tools.",
  "Inside the repair loop the checks are the page's: lints, on RAP the package formats and the activation check (abapCheck), on Node the type check (typeCheckCandidate) — their errors are the units' repair reasons. The runner's engine cases and probes are not part of the loop: they run once after the generation with the repository's harness under its execution rule (in a Node 25 child when the local Node is older), so a Node package's status reads 'not verified' unless it is partial or not runnable.",
  'A scenario counts as matched only when an executed check judged it (a harness probe, or verdicts a gate module hands in). Prose expectations and ABAP reference cases are listed as not judged: ABAP Unit needs an SAP system.',
  "On Node a scenario that names one of the original's demo cases (by the case switch in its input, or by its ID) runs that case through the generated package in the confined executor; its output is compared with the sealed expectation in memory — every expected value found and equal is a pass, a found value that differs a fail, anything less is \"ran, not judged\". A case that reaches a function still left as a stub is not run. The comparison reads the run's rows, result, issues and globals by name; a package that keeps its output under other names is not judged, never passed.",
  'Model calls go to the provider directly with the fill call settings of /api/gemini; the route\'s own gates (account, lease in Firestore, hourly limits) are not part of the run.',
];

function git(...a: string[]): string {
  try {
    return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function previousReport(outRoot: string, current: string, key: string | null): { name: string; rows: Row[] } | null {
  if (!fs.existsSync(outRoot)) return null;
  const dirs = fs.readdirSync(outRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== current).map((d) => d.name).sort().reverse();
  for (const d of dirs) {
    const plain = path.join(outRoot, d, 'suite-report.json');
    const sealedFile = path.join(outRoot, d, 'suite-report.enc.json');
    try {
      if (fs.existsSync(plain)) return { name: d, rows: (JSON.parse(fs.readFileSync(plain, 'utf8')) as SuiteReport).rows };
      if (fs.existsSync(sealedFile) && key) {
        const { open } = require('../qa/lib/crypto.mjs') as { open: (e: unknown, k: string) => SuiteReport };
        return { name: d, rows: open(JSON.parse(fs.readFileSync(sealedFile, 'utf8')), key).rows };
      }
    } catch {
      /* unreadable: try the one before */
    }
  }
  return null;
}

/** The raw gate findings of every run, for pattern analysis: beside the report, in the gitignored run folder. */
function gateFindingsFile(r: SuiteReport, findings: GateFindingsRecord[]) {
  return { format: 'clean-core.acceptance-gate-findings/1', commit: r.commit, mode: r.mode, model: r.model, startedAt: r.startedAt, runs: findings };
}

/* ------------------------------------------------------------------ main */

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const programs = loadPrograms();
  const selected = programs.filter((p) => !args.programs || args.programs.includes(p.id));
  if (args.programs) for (const id of args.programs) if (!programs.some((p) => p.id === id)) throw new Error(`unknown program ${id} (see scripts/acceptance/programs.json)`);
  if (args.list) {
    for (const p of selected) console.log(`${p.id.padEnd(28)} ${p.tracks.join('+').padEnd(9)} ${p.holdout ? 'holdout ' : ''}${p.source.repo ?? `${p.source.file}${p.source.entry ? `!${p.source.entry}` : ''}`}`);
    return 0;
  }
  const env = { ...loadEnvFile(path.join(ROOT, '.env.local')), ...(args.envFile ? loadEnvFile(args.envFile) : {}), ...process.env } as Record<string, string | undefined>;
  const key = env.ACCEPTANCE_SEAL_KEY || env.QA_REVIEW_KEY || null;
  const apiKey = env.GEMINI_API_KEY || null;
  if (args.mode === 'real' && !apiKey) throw new Error('--mode real needs GEMINI_API_KEY (environment, --env-file or .env.local)');
  if (args.seal && !key) throw new Error('--seal needs ACCEPTANCE_SEAL_KEY or QA_REVIEW_KEY');

  const commit = git('rev-parse', 'HEAD') || 'unknown';
  const startedAt = new Date();
  const runName = `${startedAt.toISOString().replace(/[:.]/g, '-')}-${commit.slice(0, 8)}-${args.mode}`;
  const runDir = path.join(args.out, runName);
  const workDir = path.join(runDir, 'packages');
  fs.mkdirSync(workDir, { recursive: true });
  const meter: Meter = { capUsd: args.capUsd, spentUsd: 0, capReached: false };
  const ctx: RunContext = { args, meter, apiKey, workDir, patterns: await probePatterns(), findings: [] };

  console.log(`acceptance suite · ${args.mode} · ${selected.length} program(s) · ${args.runs} run(s) · cap ${fmtUsd(args.capUsd)} · ${commit.slice(0, 8)}`);
  const runs: RunRecord[] = [];
  for (const p of selected) {
    let source: string;
    try {
      source = await loadSource(p, args.sources);
    } catch (err) {
      console.log(`  ${p.id}: skipped — ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    const scen = await openScenarioFile(p, key);
    for (const track of p.tracks.filter((t) => !args.tracks || args.tracks.includes(t))) {
      for (let run = 1; run <= args.runs; run++) {
        const r = await runOne(p, track, run, source, scen, ctx);
        runs.push(r);
        // Counts only on the console: CI logs may be public.
        console.log(`  ${p.id}/${track}#${run}: ${r.status} · gate ${r.gate.state} · ${r.functions.written}/${r.functions.total} written · scenarios ${r.scenarios.ran} ran, ${r.scenarios.matched} passed, ${r.scenarios.failed} failed of ${r.scenarios.total} · ${r.calls.count} calls · ${fmtUsd(r.calls.usd)} · ${Math.round(r.durationMs / 1000)} s`);
      }
    }
  }

  const rows = rowsOf(runs, programs);
  const prev = previousReport(args.out, runName, key);
  const report: SuiteReport = {
    format: 'clean-core.acceptance-suite/1',
    mode: args.mode,
    model: args.mode === 'real' ? args.model : 'gemini-test-stub (dry)',
    commit,
    dirty: git('status', '--porcelain', '--untracked-files=no') !== '',
    startedAt: startedAt.toISOString(),
    node: process.version,
    capUsd: args.capUsd,
    prices: args.mode === 'real' ? { inPerM: args.priceIn ?? 0, outPerM: args.priceOut ?? 0 } : null,
    spentUsd: meter.spentUsd,
    capReached: meter.capReached,
    runsPerProgram: args.runs,
    rows,
    totals: {
      programs: new Set(rows.map((r) => r.program)).size,
      rows: rows.length,
      gatePassed: rows.filter((r) => r.gatePassed === r.runs && r.runs > 0).length,
      functionsWritten: rows.reduce((s, r) => s + r.functions.written, 0),
      functionsTotal: rows.reduce((s, r) => s + r.functions.total, 0),
      scenariosRan: rows.reduce((s, r) => s + (r.scenarios.ran ?? 0), 0),
      scenariosMatched: rows.reduce((s, r) => s + r.scenarios.matched, 0),
      scenariosFailed: rows.reduce((s, r) => s + r.scenarios.failed, 0),
      scenariosTotal: rows.reduce((s, r) => s + r.scenarios.total, 0),
      calls: runs.reduce((s, r) => s + r.calls.count, 0),
      usd: meter.spentUsd,
      durationMs: runs.reduce((s, r) => s + r.durationMs, 0),
    },
    diff: diffRows(rows, prev?.rows ?? null),
    previous: prev?.name ?? null,
    runs,
    limits: LIMITS,
  };

  // The unpacked packages were only the harness's input.
  fs.rmSync(workDir, { recursive: true, force: true });
  const { writeReportFiles } = (await import(pathToFileURL(path.join(HERE, 'lib', 'write-report.mjs')).href)) as { writeReportFiles: (dir: string, files: Record<string, string>) => string[] };
  if (args.seal && key) {
    const { seal } = require('../qa/lib/crypto.mjs') as { seal: (p: unknown, k: string) => unknown };
    writeReportFiles(runDir, {
      'suite-report.enc.json': `${JSON.stringify(seal({ ...report, markdown: toMarkdown(report) }, key))}\n`,
      'gate-findings.enc.json': `${JSON.stringify(seal(gateFindingsFile(report, ctx.findings), key))}\n`,
    });
    console.log(`sealed report: ${path.relative(ROOT, path.join(runDir, 'suite-report.enc.json'))}`);
  } else {
    writeReportFiles(runDir, {
      'suite-report.json': `${JSON.stringify(report, null, 2)}\n`,
      'suite-report.md': toMarkdown(report),
      'gate-findings.json': `${JSON.stringify(gateFindingsFile(report, ctx.findings), null, 2)}\n`,
    });
    console.log(`report: ${path.relative(ROOT, path.join(runDir, 'suite-report.md'))}`);
  }
  const t = report.totals;
  console.log(`${t.gatePassed}/${t.rows} rows pass the gate · ${t.functionsWritten}/${t.functionsTotal} functions written · scenarios ${t.scenariosRan ?? 0} ran, ${t.scenariosMatched} passed, ${t.scenariosFailed ?? 0} failed of ${t.scenariosTotal} · ${t.calls} calls · ${fmtUsd(t.usd)}${meter.capReached ? ' · CAP REACHED' : ''}`);
  return meter.capReached ? 3 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(`acceptance suite: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(2);
    },
  );
}
