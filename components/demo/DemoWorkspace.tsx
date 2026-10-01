'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
import StageHeader from '@/components/StageHeader';
import DemoTesting from '@/components/demo/DemoTesting';
import Stepper from '@/components/Stepper';
import CcButton from '@/components/cc/Button';
import CcCard from '@/components/cc/Card';
import CcAnchor from '@/components/cc/Anchor';
import CcIconButton from '@/components/cc/IconButton';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import { CcSeverity } from '@/components/cc/Identifier';
import { normaliseSeverity } from '@/lib/severity';
import { formatNumber } from '@/lib/format';
import DemoEconomics from '@/components/tco/DemoEconomics';
import type { PhaseKey } from '@/lib/workflow-steps';
import type { DemoProject } from '@/lib/demo-project';
import DemoDelivery from '@/components/delivery/DemoDelivery';
import { catalogForReader } from '@/lib/messages/demo';
import TransformationObjectPage from '@/components/transformation/TransformationObjectPage';
import { trackOfRoute } from '@/lib/transformation-view';
import DemoDocumentation from './DemoDocumentation';
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
 *
 * Block D (D.22b): the stages wear what a real project's stages wear — the
 * stage header of §2.3, cards, tables, fields and buttons from `components/cc`,
 * tokens instead of the palette, severity through `CcSeverity`. The demo marks
 * are a tag and a message strip, not badges of their own.
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

/** The key-figure tile of a real stage (analyze's evidence-only report). */
const tile = 'rounded-cc-card border border-cc-line bg-cc-surface shadow-cc px-4 py-4';
const label = 'cc-text-label text-cc-ink-muted';
const lead = 'm-0 mb-3 cc-text-cell text-cc-ink-muted';
const num = (n: number) => formatNumber(n) ?? String(n);

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
    <div className="cc max-w-6xl mx-auto px-4 sm:px-6 pb-24" data-demo-ready={hydrated ? 'true' : 'false'}>
      <DemoStrip onReset={reset} />

      {/* No cast: `DemoRailStep` has to stay assignable to the product's own
          `RailStep`, so a future field that drifts apart is a type error here. */}
      <Stepper steps={demo.rail} current={stage} projectId="demo" basePath="/demo" />

      {/* `stage` for the header's identity, `title` because the demo's title
          must carry "Demo ·" — a reader may never mistake it for a project of
          their own (§6.1.2, `tests/demo-project.spec.ts`). */}
      <StageHeader
        stage={stage}
        title={`${demo.title} — ${current.label}`}
        eyebrow={
          <>
            <CcTag>{DEMO_TAG}</CcTag>
            <CcTag>{current.badge}</CcTag>
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
        {stage === 'testing' && <DemoTesting demo={demo} />}
        {stage === 'tco' && (
          <DemoEconomics
            loc={demo.economics.loc}
            scoreBefore={demo.economics.scoreBefore}
            values={state}
            onChange={patch}
          />
        )}
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
 * a dialog and never in the way (`DESIGN.md` §6.1.2). A message strip that was
 * on the page all along, so it does not take the focus (§2.6).
 */
function DemoStrip({ onReset }: { onReset: () => void }) {
  return (
    <div data-testid="demo-strip" className="mt-6 mb-4">
      <CcMessageStrip
        state="information"
        headline={<span data-testid="demo-notice">{DEMO_STRIP_NOTICE}</span>}
        actions={
          <CcButton onClick={onReset} data-testid="demo-reset" icon={<RotateCcw size={14} aria-hidden={true} />}>
            {DEMO_RESET_LABEL}
          </CcButton>
        }
      >
        <span data-testid="demo-unsigned" className="mt-1 block">
          {DEMO_UNSIGNED_NOTICE}
        </span>
        <span className="mt-1 block">{DEMO_QUOTA_NOTICE}</span>
        <Link
          href="/dashboard"
          data-demo-invitation
          data-testid="demo-invitation"
          className="mt-2 inline-flex items-center gap-1 font-semibold text-cc-ink underline underline-offset-2"
        >
          {DEMO_INVITATION} <ArrowRight size={14} aria-hidden={true} />
        </Link>
      </CcMessageStrip>
    </div>
  );
}

/** Said on the stages where a real run would hand over to the model. */
function ModelHalfNotice({ what }: { what: string }) {
  return (
    <CcMessageStrip state="neutral" headline="The demo stops where the model begins.">
      {what} comes out of a model call against the source in a real run. A demo makes no model call, so there is
      none here — and writing a convincing one by hand is the one thing this product may never do. What you see
      above is what the deterministic engine produced, which is the half that carries the line numbers.
    </CcMessageStrip>
  );
}

/** A source line, as the anchor every statement in the product hangs on. */
function Line({ n }: { n: number }) {
  return <CcAnchor label={`Source line ${n}`}>{`L${n}`}</CcAnchor>;
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
        <div className={tile}>
          <span className={label}>Clean Core Score</span>
          <p data-testid="demo-score" className="m-0 mt-2 cc-text-title text-cc-ink">
            {demo.analyze.cleanCoreScore}
          </p>
          <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
            Computed by the engine in this release from {demo.analyze.findings.length} findings. Not signed — see
            the strip above.
          </p>
        </div>
        <div className={tile}>
          <span className={label}>Source</span>
          <p className="m-0 mt-2 cc-text-identifier font-cc-mono text-cc-ink break-all">{demo.sourceFile}</p>
          <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
            {num(demo.totalLines)} lines, {num(demo.linesOfCode)} of them code. {demo.subject}. Catalog{' '}
            <span title={demo.catalogVersion}>{catalogForReader(demo.catalogVersion)}</span>.
          </p>
        </div>
        <div className={tile}>
          <span className={label}>Complexity / criticality</span>
          <p className="m-0 mt-2 cc-text-h2 text-cc-ink">
            {demo.analyze.complexityScore} / {demo.analyze.criticalityScore}
          </p>
          <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">
            Both on the engine&apos;s own ten-point scale, over the same source.
          </p>
        </div>
      </div>

      <CcCard level={2} title="What the engine did not judge">
        <p data-testid="demo-caveat" className="m-0 cc-text-body text-cc-ink">
          {demo.analyze.caveat ??
            'Nothing in this source falls outside what the detectors judge — which is rare enough to be worth saying.'}
        </p>
        <ul className="m-0 mt-3 list-none space-y-1 p-0">
          {demo.analyze.coverage.gaps.map((g) => (
            <li key={g.gap} className="cc-text-cell text-cc-ink-muted">
              <span className="font-semibold text-cc-ink">{g.count} ×</span> {g.label} — first at line{' '}
              <Line n={g.firstLine} />
            </li>
          ))}
        </ul>
      </CcCard>

      <CcCard level={2}
        title="Findings"
        count={demo.analyze.findings.length}
        actions={
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter findings by severity">
            {(['all', ...counts.map((c) => c[0])] as DemoState['severityFilter'][]).map((s) => (
              <CcButton
                key={s}
                variant={state.severityFilter === s ? 'dark' : 'ghost'}
                data-testid={`demo-filter-${s}`}
                aria-pressed={state.severityFilter === s}
                onClick={() => patch({ severityFilter: s })}
              >
                {s === 'all' ? `All ${demo.analyze.findings.length}` : `${s} ${counts.find((c) => c[0] === s)?.[1] ?? 0}`}
              </CcButton>
            ))}
          </div>
        }
      >
        <p className={lead}>
          {reviewed.size} of {demo.analyze.findings.length} marked reviewed in this browser.
        </p>

        <ul data-testid="demo-findings" className="m-0 list-none divide-y divide-cc-line p-0">
          {filtered.map((f) => {
            const sev = normaliseSeverity(f.severity);
            const done = reviewed.has(f.id);
            return (
              <li key={f.id} className="flex items-start gap-3 py-3">
                <CcIconButton
                  label={`Mark ${f.id} reviewed`}
                  aria-pressed={done}
                  data-testid={`demo-review-${f.id}`}
                  onClick={() => toggle(f.id)}
                >
                  {done ? (
                    <CheckCircle2 size={18} className="text-cc-ink" aria-hidden={true} />
                  ) : (
                    <Circle size={18} aria-hidden={true} />
                  )}
                </CcIconButton>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cc-text-meta font-cc-mono text-cc-ink-muted">{f.id}</span>
                    <span className="cc-text-h3 text-cc-ink">{f.title}</span>
                    {sev ? <CcSeverity value={sev} /> : <CcTag>{f.severity}</CcTag>}
                    <Line n={f.lineStart} />
                  </div>
                  <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{f.recommendation}</p>
                  {f.sapReplacement && (
                    <p className="m-0 mt-1 cc-text-meta text-cc-ink-muted">
                      <span className="text-cc-ink">Successor: </span>
                      {f.sapReplacement.objectName} ({f.sapReplacement.confidence})
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </CcCard>
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
      <div className={tile}>
        <span className={label}>Proposed route</span>
        <p data-testid="demo-route" className="m-0 mt-2 cc-text-title text-cc-ink">
          {r.recommendedRoute}
        </p>
        <p className="m-0 mt-2 cc-text-body text-cc-ink-muted">{r.rationale}</p>
        <p className="m-0 mt-2 cc-text-cell text-cc-ink-muted">
          Target artefact: <span className="font-semibold text-cc-ink">{r.targetArtifact}</span> · routing
          confidence {r.confidenceScore} · deployment assumed {demo.deployment}
        </p>
      </div>

      <CcCard level={2} title="Decision checkpoints">
        <ul className="m-0 list-none space-y-3 p-0">
          {r.checkpoints.map((c) => (
            <li key={c.checkpointName} className="border-l-2 border-cc-line pl-3">
              <p className="m-0 cc-text-h3 text-cc-ink">{c.checkpointName}</p>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink-muted">{c.question}</p>
              <p className="m-0 mt-1 cc-text-cell text-cc-ink">
                <span className="font-semibold">{c.resultState}: </span>
                {c.evaluation}
              </p>
            </li>
          ))}
        </ul>
      </CcCard>

      <CcCard level={2} title="Assumptions behind the route">
        <p className={lead}>
          The engine names them so they can be argued with, rather than folding them into the answer.
        </p>
        <ul className="m-0 list-disc space-y-1 pl-5">
          {r.assumptions.map((a) => (
            <li key={a} className="cc-text-cell text-cc-ink-muted">
              {a}
            </li>
          ))}
        </ul>
      </CcCard>

      <CcCard level={2} title="Confirm the target architecture">
        <p className="m-0 cc-text-body text-cc-ink-muted">
          On a real project this is the point where a person puts their name to the target — a self-declaration,
          not an organisational approval. In the demo it is a switch in this browser: no name is recorded, nothing
          is stored, and nothing downstream is unlocked by it.
        </p>
        <div className="mt-4">
          {/* The action is the page's primary button; once pressed it steps
              back to ghost rather than turning into a success colour — green
              says "proven" (§1.1), and a switch in a browser proves nothing. */}
          <CcButton
            variant={state.targetConfirmed ? 'ghost' : 'primary'}
            density="cozy"
            data-testid="demo-confirm-target"
            aria-pressed={state.targetConfirmed}
            onClick={() => patch({ targetConfirmed: !state.targetConfirmed })}
            icon={
              state.targetConfirmed ? (
                <CheckCircle2 size={16} aria-hidden={true} />
              ) : (
                <Circle size={16} aria-hidden={true} />
              )
            }
          >
            {state.targetConfirmed ? 'Confirmed in this browser' : `Confirm ${r.recommendedRoute}`}
          </CcButton>
        </div>
      </CcCard>
    </>
  );
}

/**
 * The Transformation tool of the demo — the same Object Page as a real
 * project (proposal A, owner decision 01.10.2026), from the same engine run.
 * `files={null}`: a demo makes no model call, so the package and every
 * "generated change" say where the demo stops instead of showing a file.
 * The route of each finding is its own (`findingTarget`), not the first
 * option of its kind — that column used to read "Developer Extensibility /
 * RAP" on every row of a side-by-side demo.
 */
function Transformation({ demo }: { demo: DemoProject }) {
  const track = trackOfRoute(demo.design.recommendedRoute);
  return (
    <div data-testid="demo-plan">
      <TransformationObjectPage
        findings={demo.analyze.findings}
        coverage={demo.analyze.coverage}
        track={track}
        codeKind={track === 'side-by-side' ? 'Node.js (TypeScript)' : 'ABAP Cloud (RAP)'}
        files={null}
        openSignOffs={null}
      />
    </div>
  );
}

function Documentation({ demo }: { demo: DemoProject }) {
  return (
    <>
      {/* Owner decision 01.10.2026 — the stage a real project shows: the
          process map as the canvas, a handbook chapter beside it, the
          chapters below. The inventory and the coupled tables follow. */}
      <DemoDocumentation process={demo.documentation.process} />

      <CcCard level={2} title="Object inventory" count={demo.documentation.inventory.length}>
        <p className={lead}>
          {demo.documentation.inventory.length} objects parsed out of the source, each with the lines it occupies
          — the anchors every later statement hangs on.
        </p>
        <div data-testid="demo-inventory">
          <CcTable
            caption="Objects parsed out of the demo source"
            columns={[
              { key: 'object', label: 'Object' },
              { key: 'type', label: 'Type' },
              { key: 'criticality', label: 'Criticality' },
              { key: 'lines', label: 'Lines' },
            ]}
            rows={demo.documentation.inventory.map((o) => ({
              key: `${o.objectName}-${o.lineStart ?? 0}`,
              cells: {
                object: <span className="font-cc-mono">{o.objectName}</span>,
                type: o.type,
                criticality: o.criticality,
                lines:
                  o.lineStart ? (
                    <CcAnchor label={o.lineEnd ? `Source lines ${o.lineStart} to ${o.lineEnd}` : `Source line ${o.lineStart}`}>
                      {`L${o.lineStart}${o.lineEnd ? `-${o.lineEnd}` : ''}`}
                    </CcAnchor>
                  ) : (
                    '—'
                  ),
              },
            }))}
          />
        </div>
      </CcCard>

      <CcCard level={2} title="Tables this program is coupled to" count={demo.documentation.coupling.length}>
        <p className={lead}>{demo.documentation.coupling.length} tables, read or written directly.</p>
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {demo.documentation.coupling.map((t) => (
            <li key={t.tableName} className="rounded-cc-row border border-cc-line px-3 py-2 cc-text-cell text-cc-ink-muted">
              <span className="font-cc-mono font-semibold text-cc-ink">{t.tableName}</span> · {t.accessType} ·{' '}
              {t.isCustom ? 'custom' : 'SAP standard'} · risk {t.riskLevel}
            </li>
          ))}
        </ul>
      </CcCard>

      <ModelHalfNotice what="The business SOP and RACI layer on top of this handbook" />
    </>
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
  // The object page of the real Delivery stage (owner decision 01.10.2026).
  return <DemoDelivery demo={demo} state={state} patch={patch} />;
}
