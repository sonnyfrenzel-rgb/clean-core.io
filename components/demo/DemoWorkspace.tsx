'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RotateCcw, ArrowRight } from 'lucide-react';
import StageHeader from '@/components/StageHeader';
import StageFrame from '@/components/StageFrame';
import DemoTesting from '@/components/demo/DemoTesting';
import DemoAnalyze from '@/components/demo/DemoAnalyze';
import CcButton from '@/components/cc/Button';
import CcAnchor from '@/components/cc/Anchor';
import CcMessageStrip from '@/components/cc/MessageStrip';
import CcTable from '@/components/cc/Table';
import { CcTag } from '@/components/cc/Tag';
import DemoEconomics from '@/components/tco/DemoEconomics';
import type { PhaseKey } from '@/lib/workflow-steps';
import type { DemoProject } from '@/lib/demo-project';
import type { WorklistItem } from '@/lib/types';
import DemoDelivery from '@/components/delivery/DemoDelivery';
import TransformationObjectPage from '@/components/transformation/TransformationObjectPage';
import { trackOfRoute } from '@/lib/transformation-view';
import DemoDocumentation from './DemoDocumentation';
import { FoldedListSection } from '@/components/documentation/FoldedList';
import { couplingSummary, inventorySummary } from '@/lib/documentation-lists';
import DemoDesign from './DemoDesign';
import DemoRequirements from './DemoRequirements';
import type { DemoDesignData } from '@/lib/demo-design';
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
  /**
   * The Analyze worklist as the reader moved it. Analyze no longer draws the
   * worklist (owner decision 02.10.2026); the field stays so a demo state
   * stored by an earlier version still reads.
   */
  worklist: WorklistItem[] | null;
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
  worklist: null,
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
    return { ...EMPTY_STATE, ...parsed };
  } catch {
    return EMPTY_STATE;
  }
}

const lead = 'm-0 mb-3 cc-text-cell text-cc-ink-muted';

export default function DemoWorkspace({
  demo,
  stage,
  design = null,
  source = null,
  sub = null,
}: {
  demo: DemoProject;
  stage: PhaseKey;
  /** The Design stage's contract and findings (`lib/demo-design.ts`); built for that stage only. */
  design?: DemoDesignData | null;
  /** The example's source, for the Documentation stage's map on a phone; read for that stage only. */
  source?: string | null;
  /** A page under the stage — the Design tool's requirements workspace (ADR-078). */
  sub?: 'requirements' | null;
}) {
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
    // The width of a real stage: the shell's own column, no narrower one of
    // the demo's (the stages are compared side by side with a project's).
    <StageFrame stage={stage} className="cc pb-24" data-demo-ready={hydrated ? 'true' : 'false'}>
      <DemoStrip onReset={reset} />

      {/* `stage` for the header's identity, `title` because the demo's title
          must carry "Demo ·" — a reader may never mistake it for a project of
          their own (§6.1.2, `tests/demo-project.spec.ts`). The seven tools
          under it are the bar every real stage carries (ADR-060), in place of
          the old stepper — one way across, not two. No cast: `DemoRailStep`
          has to stay assignable to the product's own `RailStep`, so a future
          field that drifts apart is a type error here. */}
      <StageHeader
        stage={stage}
        tools={{ steps: demo.rail, base: '/demo' }}
        title={sub === 'requirements' ? `${demo.title} — Requirements specification` : `${demo.title} — ${current.label}`}
        eyebrow={
          <>
            <CcTag>{DEMO_TAG}</CcTag>
            <CcTag>{current.badge}</CcTag>
            {sub === 'requirements' ? (
              <Link href="/demo/design" data-spec-back-design="" className="text-[13px] font-semibold text-cc-information underline-offset-2 hover:underline">
                ‹ Design
              </Link>
            ) : null}
          </>
        }
      >
        {sub === 'requirements'
          ? 'The functional and non-functional requirements of the new solution, as one document an external implementer can build from — the engine’s draft of the example, read-only.'
          : current.detail}
      </StageHeader>

      <div data-testid={`demo-stage-${stage}`} className="space-y-6">
        {stage === 'analyze' && (
          <DemoAnalyze demo={demo} />
        )}
        {stage === 'design' && sub === 'requirements' && <DemoRequirements demo={demo} data={design} />}
        {stage === 'design' && sub !== 'requirements' && <Design demo={demo} data={design} state={state} patch={patch} />}
        {stage === 'transformation' && <Transformation demo={demo} />}
        {stage === 'documentation' && <Documentation demo={demo} source={source} />}
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
    </StageFrame>
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

function Design({
  demo,
  data,
  state,
  patch,
}: {
  demo: DemoProject;
  data: DemoDesignData | null;
  state: DemoState;
  patch: (n: Partial<DemoState>) => void;
}) {
  // The tool a real project's Design stage is (owner direction B, canvas first).
  return (
    <DemoDesign
      demo={demo}
      data={data}
      confirmed={state.targetConfirmed}
      onConfirm={(targetConfirmed) => patch({ targetConfirmed })}
    />
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

function Documentation({ demo, source }: { demo: DemoProject; source: string | null }) {
  return (
    <>
      {/* The stage a real project shows, in its order: the process
          description, the business layer (here: where the demo stops), the
          map with its chapters, the technical trace. The inventory and the
          coupled tables follow. */}
      <DemoDocumentation
        source={source}
        process={demo.documentation.process}
        gaps={demo.analyze.coverage.unassessed.map((u) => ({ label: u.label, why: u.why, line: u.line }))}
        levels={demo.analyze.levels}
        businessLayer={<ModelHalfNotice what="The business SOP and RACI layer on top of this description" />}
      />

      {/* Owner 02.10.2026: the long lists start folded with their count and
          one line computed from the same rows (`lib/documentation-lists.ts`). */}
      <FoldedListSection
        name="inventory"
        title="Object inventory"
        rows={demo.documentation.inventory.length}
        summary={inventorySummary(demo.documentation.inventory)}
      >
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
      </FoldedListSection>

      <FoldedListSection
        name="coupling"
        title="Tables this program is coupled to"
        rows={demo.documentation.coupling.length}
        summary={couplingSummary(demo.documentation.coupling)}
      >
        <p className={lead}>{demo.documentation.coupling.length} tables, read or written directly.</p>
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {demo.documentation.coupling.map((t) => (
            <li key={t.tableName} className="rounded-cc-row border border-cc-line px-3 py-2 cc-text-cell text-cc-ink-muted">
              <span className="font-cc-mono font-semibold text-cc-ink">{t.tableName}</span> · {t.accessType} ·{' '}
              {t.isCustom ? 'custom' : 'SAP standard'} · risk {t.riskLevel}
            </li>
          ))}
        </ul>
      </FoldedListSection>

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
