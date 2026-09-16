'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Info,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  FileCode2,
  ShieldOff,
} from 'lucide-react';
import { clsx } from 'clsx';
import StageHeader from '@/components/StageHeader';
import Stepper from '@/components/Stepper';
import { tcoForecast, TCO_TARGET_SCORE } from '@/lib/tco-model';
import type { PhaseKey } from '@/lib/workflow-steps';
import type { DemoProject } from '@/lib/demo-project';
import {
  DEMO_INVITATION,
  DEMO_QUOTA_NOTICE,
  DEMO_RESET_LABEL,
  DEMO_STORAGE_KEY,
  DEMO_STRIP_NOTICE,
  DEMO_TAG,
  DEMO_UNSIGNED_NOTICE,
} from '@/lib/demo-marks';

/**
 * The demo project's seven stages — roadmap step 0.10, `DESIGN.md` §6.1.2.
 *
 * Everything on screen arrives as a prop from `lib/demo-project.ts`, which built
 * it on the server from a real engine run over the example file. This component
 * adds no figure of its own; what it owns is the part a reader can operate —
 * filtering, confirming, deciding, entering assumptions — and that lives in this
 * browser's `localStorage` and nowhere else. "Reset demo" throws it away.
 *
 * Nothing here talks to Firestore, to `/api/runs/create`, or to any route that
 * signs, charges or stores. That is not a habit, it is the mechanism: the demo
 * cannot consume a run because there is no code path from this file to one, and
 * `tests/demo-project.spec.ts` fails if one appears.
 */

interface DemoState {
  /** Findings the reader ticked off. */
  reviewed: string[];
  severityFilter: 'all' | 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  targetConfirmed: boolean;
  /** Assumptions for the Economics stage. Null means nobody entered one. */
  devRate: number | null;
  userRate: number | null;
  upgradeFreq: number;
  fpFreq: number;
  oneTimeCost: number | null;
  decision: 'undecided' | 'proceed' | 'park';
  decisionNote: string;
}

const EMPTY_STATE: DemoState = {
  reviewed: [],
  severityFilter: 'all',
  targetConfirmed: false,
  devRate: null,
  userRate: null,
  upgradeFreq: 1,
  fpFreq: 2,
  oneTimeCost: null,
  decision: 'undecided',
  decisionNote: '',
};

function readState(): DemoState {
  try {
    const raw = window.localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<DemoState>;
    return { ...EMPTY_STATE, ...parsed, reviewed: Array.isArray(parsed.reviewed) ? parsed.reviewed : [] };
  } catch {
    return EMPTY_STATE;
  }
}

const card = 'bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-sm';
const label = 'text-[11px] font-black uppercase tracking-widest text-gray-500';
const severityTone: Record<string, string> = {
  Critical: 'bg-rose-50 text-rose-700 border-rose-200',
  High: 'bg-orange-50 text-orange-700 border-orange-200',
  Medium: 'bg-amber-50 text-amber-700 border-amber-200',
  Low: 'bg-blue-50 text-blue-700 border-blue-200',
  Info: 'bg-gray-50 text-gray-600 border-gray-200',
};

export default function DemoWorkspace({ demo, stage }: { demo: DemoProject; stage: PhaseKey }) {
  const [state, setState] = useState<DemoState>(EMPTY_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* A browser that refuses storage still runs the demo; it just forgets. */
    }
  }, [state, hydrated]);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(DEMO_STORAGE_KEY);
    } catch {
      /* Nothing to clear. */
    }
    setState(EMPTY_STATE);
  }, []);

  const patch = useCallback((next: Partial<DemoState>) => setState((s) => ({ ...s, ...next })), []);

  const current = demo.rail.find((r) => r.key === stage) ?? demo.rail[0];

  return (
    // `data-demo-ready` flips once the browser has taken over: the demo is
    // server-rendered and every control on it is inert until then, so a test
    // that clicks earlier is testing the wrong thing.
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pb-24" data-demo-ready={hydrated ? 'true' : 'false'}>
      <DemoStrip onReset={reset} />

      {/* No cast: `DemoRailStep` has to stay assignable to the product's own
          `RailStep`, so a future field that drifts apart is a type error here. */}
      <Stepper steps={demo.rail} current={stage} projectId="demo" basePath="/demo" />

      <StageHeader
        title={`${demo.title} — ${current.label}`}
        eyebrow={
          <>
            <span
              data-testid="demo-stage-tag"
              className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200"
            >
              {DEMO_TAG}
            </span>
            <span className={clsx('text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border', severityTone.Info)}>
              {current.badge}
            </span>
          </>
        }
      >
        {current.detail}
      </StageHeader>

      <div data-testid={`demo-stage-${stage}`} className="space-y-6">
        {stage === 'analyze' && <Analyze demo={demo} state={state} patch={patch} />}
        {stage === 'design' && <Design demo={demo} state={state} patch={patch} />}
        {stage === 'transformation' && <Transformation demo={demo} />}
        {stage === 'documentation' && <Documentation demo={demo} />}
        {stage === 'testing' && <Testing demo={demo} />}
        {stage === 'tco' && <Economics demo={demo} state={state} patch={patch} />}
        {stage === 'delivery' && <Delivery demo={demo} state={state} patch={patch} />}
      </div>
    </div>
  );
}

/**
 * The strip that sits above every demo screen.
 *
 * It carries the three things a reader has to know before anything else on the
 * page means something: this is a demo, nothing is kept, and nothing here is
 * signed. The invitation lives in it too — one per screen, an inline link, never
 * a dialog and never in the way (`DESIGN.md` §6.1.2).
 */
function DemoStrip({ onReset }: { onReset: () => void }) {
  return (
    <div
      data-testid="demo-strip"
      role="status"
      className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" aria-hidden />
          <div className="min-w-0">
            <p data-testid="demo-notice" className="text-sm font-bold text-blue-900 leading-relaxed">
              {DEMO_STRIP_NOTICE}
            </p>
            <p data-testid="demo-unsigned" className="text-xs text-blue-900 leading-relaxed mt-1.5">
              {DEMO_UNSIGNED_NOTICE}
            </p>
            <p className="text-xs text-blue-900 leading-relaxed mt-1.5">{DEMO_QUOTA_NOTICE}</p>
            <Link
              href="/dashboard"
              data-demo-invitation
              data-testid="demo-invitation"
              className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-blue-800 hover:text-blue-950 mt-3 underline underline-offset-4"
            >
              {DEMO_INVITATION} <ArrowRight className="w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        </div>
        <button
          type="button"
          onClick={onReset}
          data-testid="demo-reset"
          className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-xs font-bold text-blue-800 hover:bg-blue-100 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden /> {DEMO_RESET_LABEL}
        </button>
      </div>
    </div>
  );
}

/** Said on the stages where a real run would hand over to the model. */
function ModelHalfNotice({ what }: { what: string }) {
  return (
    <div className={clsx(card, 'border-dashed')}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
        <div>
          <h3 className="text-sm font-black text-gray-900">The demo stops where the model begins</h3>
          <p className="text-sm text-gray-600 leading-relaxed mt-1.5">
            {what} comes out of a model call against the source in a real run. A demo makes no model call, so
            there is none here — and writing a convincing one by hand is the one thing this product may never do.
            What you see above is what the deterministic engine produced, which is the half that carries the line
            numbers.
          </p>
        </div>
      </div>
    </div>
  );
}

function Analyze({
  demo,
  state,
  patch,
}: {
  demo: DemoProject;
  state: DemoState;
  patch: (n: Partial<DemoState>) => void;
}) {
  const filtered = useMemo(
    () =>
      state.severityFilter === 'all'
        ? demo.analyze.findings
        : demo.analyze.findings.filter((f) => f.severity === state.severityFilter),
    [demo.analyze.findings, state.severityFilter],
  );
  const reviewed = new Set(state.reviewed);

  const toggle = (id: string) => {
    const next = new Set(reviewed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patch({ reviewed: [...next] });
  };

  const counts: Array<[string, number]> = [
    ['Critical', demo.analyze.summary.criticalCount],
    ['High', demo.analyze.summary.highCount],
    ['Medium', demo.analyze.summary.mediumCount],
    ['Low', demo.analyze.summary.lowCount],
    ['Info', demo.analyze.summary.infoCount],
  ];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className={card}>
          <p className={label}>Clean Core Score</p>
          <p data-testid="demo-score" className="text-4xl font-black text-gray-950 mt-1">
            {demo.analyze.cleanCoreScore}
          </p>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            Computed by the engine in this release from {demo.analyze.findings.length} findings. Not signed —
            see the strip above.
          </p>
        </div>
        <div className={card}>
          <p className={label}>Source</p>
          <p className="text-sm font-mono font-bold text-gray-900 mt-1 break-all">{demo.sourceFile}</p>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            {demo.totalLines.toLocaleString()} lines, {demo.linesOfCode.toLocaleString()} of them code.{' '}
            {demo.subject}. Catalog {demo.catalogVersion}.
          </p>
        </div>
        <div className={card}>
          <p className={label}>Complexity / criticality</p>
          <p className="text-sm font-bold text-gray-900 mt-1">
            {demo.analyze.complexityScore} / {demo.analyze.criticalityScore}
          </p>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
            Both on the engine&apos;s own ten-point scale, over the same source.
          </p>
        </div>
      </div>

      <div className={card}>
        <p className={label}>What the engine did not judge</p>
        <p data-testid="demo-caveat" className="text-sm text-gray-700 leading-relaxed mt-2">
          {demo.analyze.caveat ??
            'Nothing in this source falls outside what the detectors judge — which is rare enough to be worth saying.'}
        </p>
        <ul className="mt-3 space-y-1.5">
          {demo.analyze.coverage.gaps.map((g) => (
            <li key={g.gap} className="text-xs text-gray-600">
              <span className="font-bold text-gray-800">{g.count} ×</span> {g.label} — first at line {g.firstLine}
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black text-gray-950">Findings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {reviewed.size} of {demo.analyze.findings.length} marked reviewed in this browser.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter findings by severity">
            {(['all', ...counts.map((c) => c[0])] as DemoState['severityFilter'][]).map((s) => (
              <button
                key={s}
                type="button"
                data-testid={`demo-filter-${s}`}
                onClick={() => patch({ severityFilter: s })}
                aria-pressed={state.severityFilter === s}
                className={clsx(
                  'text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-colors',
                  state.severityFilter === s
                    ? 'bg-gray-900 text-white border-gray-900'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400',
                )}
              >
                {s === 'all' ? `All ${demo.analyze.findings.length}` : `${s} ${counts.find((c) => c[0] === s)?.[1] ?? 0}`}
              </button>
            ))}
          </div>
        </div>

        <ul data-testid="demo-findings" className="divide-y divide-gray-100">
          {filtered.map((f) => (
            <li key={f.id} className="py-3.5 flex items-start gap-3">
              <button
                type="button"
                onClick={() => toggle(f.id)}
                aria-pressed={reviewed.has(f.id)}
                aria-label={`Mark ${f.id} reviewed`}
                data-testid={`demo-review-${f.id}`}
                className="shrink-0 mt-0.5 text-gray-400 hover:text-green-600 transition-colors"
              >
                {reviewed.has(f.id) ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden />
                ) : (
                  <Circle className="w-5 h-5" aria-hidden />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-gray-500">{f.id}</span>
                  <span className="text-sm font-bold text-gray-900">{f.title}</span>
                  <span
                    className={clsx(
                      'text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border',
                      severityTone[f.severity],
                    )}
                  >
                    {f.severity}
                  </span>
                  <span className="text-[11px] font-mono text-gray-500">line {f.lineStart}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed mt-1">{f.recommendation}</p>
                {f.sapReplacement && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    <span className="font-bold text-gray-700">Successor: </span>
                    {f.sapReplacement.objectName} ({f.sapReplacement.confidence})
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function Design({
  demo,
  state,
  patch,
}: {
  demo: DemoProject;
  state: DemoState;
  patch: (n: Partial<DemoState>) => void;
}) {
  const r = demo.design;
  return (
    <>
      <div className={card}>
        <p className={label}>Proposed route</p>
        <p data-testid="demo-route" className="text-2xl font-black text-gray-950 mt-1">
          {r.recommendedRoute}
        </p>
        <p className="text-sm text-gray-600 leading-relaxed mt-2">{r.rationale}</p>
        <p className="text-xs text-gray-500 mt-2">
          Target artefact: <span className="font-bold text-gray-700">{r.targetArtifact}</span> · routing
          confidence {r.confidenceScore} · deployment assumed {demo.deployment}
        </p>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-3">Decision checkpoints</h3>
        <ul className="space-y-3">
          {r.checkpoints.map((c) => (
            <li key={c.checkpointName} className="border-l-2 border-gray-200 pl-3">
              <p className="text-sm font-bold text-gray-900">{c.checkpointName}</p>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{c.question}</p>
              <p className="text-xs text-gray-700 leading-relaxed mt-1">
                <span className="font-bold">{c.resultState}: </span>
                {c.evaluation}
              </p>
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Assumptions behind the route</h3>
        <p className="text-xs text-gray-500 mb-3">
          The engine names them so they can be argued with, rather than folding them into the answer.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          {r.assumptions.map((a) => (
            <li key={a} className="text-xs text-gray-600 leading-relaxed">
              {a}
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Confirm the target architecture</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          On a real project this is the point where a person puts their name to the target — a self-declaration,
          not an organisational approval. In the demo it is a switch in this browser: no name is recorded, nothing
          is stored, and nothing downstream is unlocked by it.
        </p>
        <button
          type="button"
          data-testid="demo-confirm-target"
          aria-pressed={state.targetConfirmed}
          onClick={() => patch({ targetConfirmed: !state.targetConfirmed })}
          className={clsx(
            'mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors',
            state.targetConfirmed
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'bg-gray-900 text-white hover:bg-gray-800',
          )}
        >
          {state.targetConfirmed ? (
            <>
              <CheckCircle2 className="w-4 h-4" aria-hidden /> Confirmed in this browser
            </>
          ) : (
            <>
              <Circle className="w-4 h-4" aria-hidden /> Confirm {r.recommendedRoute}
            </>
          )}
        </button>
      </div>
    </>
  );
}

function Transformation({ demo }: { demo: DemoProject }) {
  return (
    <>
      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">The plan the engine can write on its own</h3>
        <p className="text-xs text-gray-500 mb-4">
          One line per finding: where it is, what the route is, and the released successor when the catalog names
          one. {demo.transformation.unplanned > 0
            ? `${demo.transformation.unplanned} findings carry no target option and are left out rather than guessed at.`
            : 'Every finding carries at least one target option.'}
        </p>
        <div className="overflow-x-auto">
          <table data-testid="demo-plan" className="w-full text-left text-xs">
            <thead>
              <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                <th className="py-2 pr-3 font-black">Line</th>
                <th className="py-2 pr-3 font-black">Finding</th>
                <th className="py-2 pr-3 font-black">Route</th>
                <th className="py-2 font-black">Successor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {demo.transformation.plan.map((p) => (
                <tr key={p.findingId}>
                  <td className="py-2 pr-3 font-mono text-gray-500 align-top">{p.lineStart}</td>
                  <td className="py-2 pr-3 align-top">
                    <span className="font-bold text-gray-900">{p.title}</span>
                    <span className="block text-gray-500 mt-0.5">{p.recommendation}</span>
                  </td>
                  <td className="py-2 pr-3 text-gray-700 align-top">{p.target}</td>
                  <td className="py-2 text-gray-700 align-top">
                    {p.successor ? `${p.successor} (${p.successorProvenance})` : 'none in the catalog'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ModelHalfNotice what="The transformed code" />
    </>
  );
}

function Documentation({ demo }: { demo: DemoProject }) {
  return (
    <>
      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Object inventory</h3>
        <p className="text-xs text-gray-500 mb-4">
          {demo.documentation.inventory.length} objects parsed out of the source, each with the lines it occupies
          — the anchors every later statement hangs on.
        </p>
        <div className="overflow-x-auto">
          <table data-testid="demo-inventory" className="w-full text-left text-xs">
            <thead>
              <tr className="text-gray-500 uppercase tracking-wider text-[10px]">
                <th className="py-2 pr-3 font-black">Object</th>
                <th className="py-2 pr-3 font-black">Type</th>
                <th className="py-2 pr-3 font-black">Criticality</th>
                <th className="py-2 font-black">Lines</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {demo.documentation.inventory.map((o) => (
                <tr key={`${o.objectName}-${o.lineStart ?? 0}`}>
                  <td className="py-2 pr-3 font-mono text-gray-900 align-top">{o.objectName}</td>
                  <td className="py-2 pr-3 text-gray-600 align-top">{o.type}</td>
                  <td className="py-2 pr-3 text-gray-600 align-top">{o.criticality}</td>
                  <td className="py-2 font-mono text-gray-500 align-top">
                    {o.lineStart ?? '—'}
                    {o.lineEnd ? `–${o.lineEnd}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Tables this program is coupled to</h3>
        <p className="text-xs text-gray-500 mb-4">{demo.documentation.coupling.length} tables, read or written directly.</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {demo.documentation.coupling.map((t) => (
            <li key={t.tableName} className="text-xs text-gray-600 border border-gray-100 rounded-xl px-3 py-2">
              <span className="font-mono font-bold text-gray-900">{t.tableName}</span> · {t.accessType} ·{' '}
              {t.isCustom ? 'custom' : 'SAP standard'} · risk {t.riskLevel}
            </li>
          ))}
        </ul>
      </div>

      <ModelHalfNotice what="The written blueprint, and the process drawing on top of it," />
    </>
  );
}

function Testing({ demo }: { demo: DemoProject }) {
  return (
    <>
      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Nothing here has run</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          {demo.testing.verdicts.total} tests generated, {demo.testing.verdicts.passed} passed,{' '}
          {demo.testing.verdicts.failed} failed. There is no pass rate, because a rate over nothing is not a
          number. A real run generates a suite from the transformed code and executes it in a restricted runner;
          the demo has neither.
        </p>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">What a tester would have to check by hand</h3>
        <p className="text-xs text-gray-500 mb-4">
          Straight out of the engine&apos;s coverage report: every construct it says it did not judge is a place
          where no generated test can stand in for a person.
        </p>
        <ul data-testid="demo-manual-areas" className="space-y-2.5">
          {demo.testing.manualAreas.map((a) => (
            <li key={`${a.label}-${a.line}`} className="border-l-2 border-amber-300 pl-3">
              <p className="text-sm font-bold text-gray-900">
                {a.label} <span className="font-mono text-xs font-normal text-gray-500">line {a.line}</span>
              </p>
              <p className="text-xs text-gray-600 leading-relaxed mt-0.5">{a.why}</p>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/**
 * Economics — a scenario, and only ever a scenario.
 *
 * The inputs start empty on purpose (roadmap 0.4): no day rate, no investment,
 * so no output. The forecast itself is `lib/tco-model.ts`, the same function the
 * Economics stage of a real project calls, so the demo cannot show arithmetic
 * the product does not do.
 *
 * It reports the model's day counts and ratios rather than amounts. Amounts
 * belong on one screen in this product and this is not it — a demo is the last
 * place a figure with a currency on it should be able to be screenshotted.
 */
function Economics({
  demo,
  state,
  patch,
}: {
  demo: DemoProject;
  state: DemoState;
  patch: (n: Partial<DemoState>) => void;
}) {
  const forecast = useMemo(
    () =>
      tcoForecast({
        loc: demo.economics.loc,
        devRate: state.devRate,
        userRate: state.userRate,
        upgradeFreq: state.upgradeFreq,
        fpFreq: state.fpFreq,
        oneTimeCost: state.oneTimeCost,
        scoreBefore: demo.economics.scoreBefore,
      }),
    [demo.economics.loc, demo.economics.scoreBefore, state],
  );

  const missing = [
    state.devRate === null && 'developer day rate',
    state.userRate === null && 'business tester day rate',
    state.oneTimeCost === null && 'modernisation investment',
  ].filter(Boolean) as string[];

  const num = (v: string): number | null => {
    const n = Number(v);
    return v.trim() === '' || !Number.isFinite(n) ? null : n;
  };

  return (
    <>
      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Your assumptions</h3>
        <p className="text-xs text-gray-500 mb-4">
          Nothing is filled in for you. The model refuses to produce a figure until the numbers behind it are
          yours, and it says which ones are still missing.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field
            id="demo-dev-rate"
            title="Developer day rate"
            hint="in euro, per day"
            value={state.devRate}
            onChange={(v) => patch({ devRate: num(v) })}
          />
          <Field
            id="demo-user-rate"
            title="Business tester day rate"
            hint="in euro, per day"
            value={state.userRate}
            onChange={(v) => patch({ userRate: num(v) })}
          />
          <Field
            id="demo-investment"
            title="One-time modernisation investment"
            hint="in euro"
            value={state.oneTimeCost}
            onChange={(v) => patch({ oneTimeCost: num(v) })}
          />
          <Field
            id="demo-upgrades"
            title="Major upgrades per year"
            hint="whole number"
            value={state.upgradeFreq}
            onChange={(v) => patch({ upgradeFreq: num(v) ?? 0 })}
          />
          <Field
            id="demo-feature-packs"
            title="Feature packs per year"
            hint="whole number"
            value={state.fpFreq}
            onChange={(v) => patch({ fpFreq: num(v) ?? 0 })}
          />
          <div className="rounded-xl border border-gray-200 px-3 py-2.5 bg-gray-50">
            <p className={label}>Measured, not assumed</p>
            <p className="text-sm text-gray-700 mt-1 leading-relaxed">
              {demo.economics.loc.toLocaleString()} lines of code, Clean Core Score {demo.economics.scoreBefore},
              target {TCO_TARGET_SCORE} — the target is the model&apos;s assumption, the other two come from the run.
            </p>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Maintenance effort · scenario</h3>
        {forecast === null ? (
          <p data-testid="demo-forecast-refused" className="text-sm text-gray-600 leading-relaxed">
            No forecast yet
            {missing.length > 0 ? `: still missing the ${missing.join(', the ')}.` : ' — the model declines these inputs.'}{' '}
            An output built on a number nobody entered is not a scenario, it is an invention.
          </p>
        ) : (
          <div data-testid="demo-forecast" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
            <Metric title="Legacy effort" value={`${forecast.legacyDevDaysTotal + forecast.legacyTestDaysTotal} days per year`} />
            <Metric title="After modernisation" value={`${forecast.modernDevDaysTotal + forecast.modernTestDaysTotal} days per year`} />
            <Metric title="Overhead reduction" value={`${forecast.overheadReductionPct}%`} />
            <Metric
              title="Payback"
              value={forecast.paybackMonths === null ? 'not reached' : `${forecast.paybackMonths} months`}
            />
          </div>
        )}
        <p className="text-xs text-gray-500 leading-relaxed mt-4">
          A scenario, not a quotation: the day counts come from your assumptions and the score the run measured,
          and the target score of {TCO_TARGET_SCORE} is an assumption of the model itself. The amounts behind
          these days appear on the Economics stage of your own project.
        </p>
      </div>
    </>
  );
}

function Field({
  id,
  title,
  hint,
  value,
  onChange,
}: {
  id: string;
  title: string;
  hint: string;
  value: number | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2.5">
      <label htmlFor={id} className={label}>
        {title}
      </label>
      <input
        id={id}
        data-testid={id}
        type="number"
        min={0}
        inputMode="numeric"
        value={value === null ? '' : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="mt-1 w-full bg-transparent text-lg font-black text-gray-900 outline-none"
      />
      <p className="text-[11px] text-gray-400">{hint}</p>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 px-3 py-2.5">
      <p className={label}>{title}</p>
      <p className="text-lg font-black text-gray-950 mt-1">{value}</p>
    </div>
  );
}

function Delivery({
  demo,
  state,
  patch,
}: {
  demo: DemoProject;
  state: DemoState;
  patch: (n: Partial<DemoState>) => void;
}) {
  return (
    <>
      <div className={card}>
        <div className="flex items-start gap-3">
          <ShieldOff className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" aria-hidden />
          <div>
            <h3 className="text-lg font-black text-gray-950">No pack leaves this screen</h3>
            <p data-testid="demo-no-pack" className="text-sm text-gray-600 leading-relaxed mt-1.5">
              There is no download here, and there is no button that would make one. An audit pack is sealed
              against a signed run and carries the account that made it; a demo has neither, so a pack out of the
              demo would be a document that looks like evidence and is not. That is the one failure mode this
              product cannot afford, so the capability is absent rather than disabled.
            </p>
          </div>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">What a real handover would still need</h3>
        <ul data-testid="demo-missing" className="mt-3 space-y-2">
          {demo.delivery.missing.map((m) => (
            <li key={m} className="flex items-start gap-2.5 text-sm text-gray-700">
              <FileCode2 className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-hidden />
              <span>{m}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={card}>
        <h3 className="text-lg font-black text-gray-950 mb-1">Record a decision</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          Try the shape of it. The choice and the note stay in this browser, they are attributed to nobody, and{' '}
          {DEMO_RESET_LABEL} removes them.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {(['proceed', 'park'] as const).map((d) => (
            <button
              key={d}
              type="button"
              data-testid={`demo-decision-${d}`}
              aria-pressed={state.decision === d}
              onClick={() => patch({ decision: state.decision === d ? 'undecided' : d })}
              className={clsx(
                'rounded-xl px-4 py-2.5 text-sm font-bold border transition-colors',
                state.decision === d
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400',
              )}
            >
              {d === 'proceed' ? 'Proceed with the route' : 'Park it for now'}
            </button>
          ))}
        </div>
        <label htmlFor="demo-decision-note" className={clsx(label, 'block mt-4')}>
          Why
        </label>
        <textarea
          id="demo-decision-note"
          data-testid="demo-decision-note"
          rows={3}
          value={state.decisionNote}
          onChange={(e) => patch({ decisionNote: e.target.value })}
          placeholder="The reasoning a colleague would need in six months."
          className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-gray-400"
        />
      </div>
    </>
  );
}
