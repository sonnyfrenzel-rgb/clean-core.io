/**
 * What the workspace shell is allowed to say about a project — roadmap 1.4.
 *
 * The shell of `DESIGN.md` §2.3 is four claims stacked on one screen: a meta
 * line that names the evidence a case rests on, seven object statuses that say
 * how far each facet of it has got, a layer bar that says where there is
 * anything to read, and a *Not determined* area that says what the engine could
 * not work out. Every one of them is a place to be dishonest cheaply, and the
 * roadmap row is blunt about the one that matters:
 *
 *   > sieben Status-Chips — jeder ehrlich, „nicht begonnen", solange nichts da ist
 *
 * A tick, a colour or a percentage for a phase nobody ran is the defect this
 * phase of the roadmap exists to remove. So the derivation lives here, in one
 * pure module, and the components below it render what it returns and compute
 * nothing of their own.
 *
 * **There is no second ladder.** Five of the seven statuses are derived from
 * `workflowSteps()` — the contract roadmap 1.7 made the single rule for what a
 * phase's state is and what colour it may wear. `statusOfPhase` is the *only*
 * bridge from that contract to the object-status vocabulary of `DESIGN.md`
 * §4.1, and it keeps 1.7's one invariant intact: the `success` state — green —
 * is reached if and only if `RailStep.proven` is true. A phase that is `done`
 * because a model wrote something and nobody checked it comes out as `draft`,
 * which is amber, which is what the stepper two screens away already paints it.
 *
 * **The other two say so.** *Need* and *Standard* are facets of the case whose
 * artefacts this release does not record: business-rule confirmation arrives
 * with the process model, and a standard candidate only carries an evidence
 * level from roadmap 7.2. They could borrow a number — the routing
 * recommendation is right there on the project — and that is precisely what
 * `DESIGN.md` §5.3 forbids: *nie „deckt der Standard ab", solange die Stufe das
 * nicht trägt*. They read "not started" and name the artefact that is missing.
 * That one of them cannot move yet is the honest result, not an oversight.
 */

import type { Project } from './types';
import { workflowSteps, phaseTone, type PhaseKey, type RailStep } from './workflow-steps';
import type { ObjectStatusValue } from './object-status';
import type { ProvenanceValue } from './provenance';
import { INPUT_IDS, type InputManifest } from './input-manifest';
import { assessCoverage, type UnassessedConstruct } from './abap/coverage';

/* ------------------------------------------------------------------ views */

/**
 * The three views, in the one order they are ever written (ADR-044): Business
 * leads, IT follows the process, Management decides at the end. Management in
 * the middle reads as the centre of gravity, and it is not.
 */
export const WORKSPACE_VIEWS = ['business', 'it', 'management'] as const;
export type WorkspaceView = (typeof WORKSPACE_VIEWS)[number];

/** The view a workspace opens in — ADR-002, and the reason §5 exists. */
export const DEFAULT_VIEW: WorkspaceView = 'business';

export const VIEW_LABELS: Record<WorkspaceView, string> = {
  business: 'Business',
  it: 'IT',
  management: 'Management',
};

/** The question each view answers, under the switcher (`DESIGN.md` §2.3, §5.6). */
export const VIEW_QUESTIONS: Record<WorkspaceView, string> = {
  business: 'Do I still need this, and what changes for me?',
  it: 'What exactly, where to, and is it right?',
  management: 'What do I risk, what do I decide?',
};

export function isWorkspaceView(value: unknown): value is WorkspaceView {
  return typeof value === 'string' && (WORKSPACE_VIEWS as readonly string[]).includes(value);
}

/**
 * A view in the URL is a perspective, never a grant (ADR-018). Reading it back
 * can therefore only ever choose between three renderings of the same data, and
 * an unknown value falls back to the one the workspace opens in.
 */
export function viewFromParam(value: string | null | undefined): WorkspaceView {
  return isWorkspaceView(value) ? value : DEFAULT_VIEW;
}

/**
 * "About this view" (roadmap 6.1, `DESIGN.md` §6.1): the paragraph behind the
 * one-sentence question, naming what the view shows **and what it does not** —
 * so a reader who opens it learns the boundary of the screen they are on
 * rather than a restatement of the sentence above it.
 *
 * Written to what this shell actually renders today, not to layers roadmap 6.2
 * onward still has to build: claiming a findings table or a Clean Core Score
 * history here, before either exists, would be the same "the standard covers
 * it" kind of statement `DESIGN.md` §5.3 forbids for a status chip — the text
 * is not exempt from that rule just because it lives under a link.
 */
export const VIEW_ABOUT: Record<WorkspaceView, string> = {
  business:
    'Business folds the meta line and the seven status facets into one line — ' +
    '"Show project status" opens them — and lays the seven tools under a single ' +
    '"Tools" menu. It shows the plain-language reveal of what the code does, the ' +
    'rule-based next step and what could not be determined; it does not show line ' +
    'numbers, a findings table or a cost figure — those belong to IT and to Economics.',
  it: 'IT opens the meta line, all seven statuses and every tool as its own link, ' +
    'rather than folding them behind a summary or a menu. It shows the findings with both ' +
    'SAP catalog views, the clean core levels across them, and the trace from a requirement ' +
    'through the anchor and the finding to a target draft — for the finding you select, and ' +
    'it says how many findings that trace is complete for. The Focus above still scopes ' +
    'nothing: it will narrow the same evidence to one Application, the Solution it belongs ' +
    'to, or the wider Enterprise landscape, and today it only records where you are looking. ' +
    'It does not decide anything, and switching either the view or the Focus calls no model ' +
    'and stores nothing.',
  management:
    'Management opens the seven statuses — what is confirmed, what is missing — ' +
    'while the meta line stays behind "Details", the same as Business. It does not ' +
    'show source code, line anchors or a findings table, and it is not a separate ' +
    'rollup: it reads the identical case Business and IT do, with no figure of its own.',
};

/* -------------------------------------------------------------- IT focus */

/**
 * The IT view's secondary focus (roadmap 6.1, mockup screen `s4`): the same
 * evidence read at three widening scopes. Application first — the scope a
 * finding already opens at — because a reader widens deliberately from one
 * object outward, rather than starting at the landscape and narrowing past
 * everything else first.
 *
 * Like the view itself, this is ordering, not a filter: it is a perspective
 * held in the URL and the browser, the same as `WorkspaceView`, and it must
 * never reach a stored project, run or audit pack either — see
 * `tests/view-attribute-guard.spec.ts`.
 */
export const IT_FOCUS_OPTIONS = ['application', 'solution', 'enterprise'] as const;
export type ItFocus = (typeof IT_FOCUS_OPTIONS)[number];

/** The scope the IT view opens at. */
export const DEFAULT_IT_FOCUS: ItFocus = 'application';

export const IT_FOCUS_LABELS: Record<ItFocus, string> = {
  application: 'Application',
  solution: 'Solution',
  enterprise: 'Enterprise',
};

export function isItFocus(value: unknown): value is ItFocus {
  return typeof value === 'string' && (IT_FOCUS_OPTIONS as readonly string[]).includes(value);
}

/** Same rule as `viewFromParam`: an unknown or missing value is the default, never an error. */
export function itFocusFromParam(value: string | null | undefined): ItFocus {
  return isItFocus(value) ? value : DEFAULT_IT_FOCUS;
}

/* --------------------------------------------------------------- meta line */

/**
 * What a value reads when nothing recorded it.
 *
 * Not an em dash and not an empty cell: both read as "zero" or as a rendering
 * fault. A run signed before the input manifest existed (roadmap 0.5) genuinely
 * has none, and that is a fact about the run, not about this screen.
 */
export const META_ABSENT = 'not recorded';

export interface MetaEntry {
  key: string;
  /** The word before the value — "manifest", "revision", "engine". */
  label: string;
  /** The value in monospace, or `null` when nothing recorded it. */
  value: string | null;
}

/** A hash is quoted at the length a person can compare by eye, never in full. */
function shortHash(hash: string | undefined | null): string | null {
  return typeof hash === 'string' && hash.length >= 8 ? hash.slice(0, 8) : null;
}

function inputRevision(manifest: InputManifest | null, id: string): string | null {
  const found = manifest?.inputs?.find((i) => i.id === id);
  return typeof found?.revision === 'string' && found.revision.length > 0 ? found.revision : null;
}

/**
 * The manifest this project's active run signed.
 *
 * `loadProjectAndHydrate` spreads the run over the project document, so a
 * hydrated project carries the run's own manifest; a bare project document
 * carries the copy in `auditMetadata`. Both are server-written — neither is in
 * the client allowlist of `firestore.rules` — which is the only reason this
 * line is worth printing at all.
 */
export function activeManifest(project: Project | null): InputManifest | null {
  return project?.inputManifest ?? project?.auditMetadata?.inputManifest ?? null;
}

/**
 * The mono meta line of `DESIGN.md` §2.3 — what this case's evidence rests on.
 *
 * Open in IT, behind "Details" in Business and Management (§2.11). The order is
 * the mockup's: identity first, then the record, then what produced it.
 */
export function metaLine(project: Project | null, projectId: string): MetaEntry[] {
  const manifest = activeManifest(project);
  return [
    { key: 'project', label: 'project', value: projectId || null },
    { key: 'manifest', label: 'manifest', value: shortHash(manifest?.hash) },
    {
      key: 'revision',
      label: 'revision',
      value: typeof manifest?.revision === 'number' ? String(manifest.revision) : null,
    },
    { key: 'source', label: 'source', value: inputRevision(manifest, INPUT_IDS.source) },
    { key: 'engine', label: 'engine', value: inputRevision(manifest, INPUT_IDS.engine) },
    { key: 'rules', label: 'rules', value: inputRevision(manifest, INPUT_IDS.ruleset) },
    { key: 'catalog', label: 'catalog', value: inputRevision(manifest, INPUT_IDS.catalog) },
  ];
}

/* ---------------------------------------------------- the seven statuses */

export const STATUS_FACETS = [
  'provenance',
  'need',
  'standard',
  'costs',
  'confirmed',
  'execution',
  'handover',
] as const;
export type StatusFacet = (typeof STATUS_FACETS)[number];

export interface WorkspaceStatus {
  facet: StatusFacet;
  /** The word before the status — "Provenance", "Costs" (`DESIGN.md` §2.3). */
  label: string;
  status: ObjectStatusValue;
  /**
   * What is on record, or — when nothing is — what would put something there.
   * Never empty: a status with no reason behind it is a claim a reader cannot
   * check, and every one of these is checkable.
   */
  detail: string;
  /**
   * The phase whose evidence this reads, so that nothing here is a second
   * derivation of how far a project has got. `null` for the two facets this
   * release records no artefact for, which is the honest answer and is stated
   * as one.
   */
  from: PhaseKey | null;
  /**
   * Where the statement comes from, when it has a source worth naming — never
   * mixed into the status itself (ADR-023). `null` when there is nothing to
   * attribute, which is the ordinary case for "not started".
   */
  provenance: ProvenanceValue | null;
}

/**
 * The one bridge from roadmap 1.7's phase contract to the object statuses of
 * `DESIGN.md` §4.1.
 *
 * The invariant it exists to keep: `done` is the only object status in the
 * `success` state, and it is reached only from `proven`. Generated work that
 * nothing checked is `draft` — on record, provisional, amber — which is exactly
 * what the stepper and the rail paint it under `phaseTone`. A `stale` phase is
 * `partial`, because it is not finished, and it carries the *Stale* provenance
 * chip beside it rather than a status of its own: *stale* is where a statement
 * stands, not how far the work got (ADR-023, and the note in `lib/object-status.ts`).
 */
export function statusOfPhase(step: RailStep): ObjectStatusValue {
  switch (step.state) {
    case 'empty':
      return 'not-started';
    case 'stale':
      return 'partial';
    case 'partial':
      return 'partial';
    case 'done':
      return step.proven ? 'done' : 'draft';
  }
}

/** The *Stale* chip beside a status, and nothing else about staleness. */
function staleChip(step: RailStep): ProvenanceValue | null {
  return step.state === 'stale' ? 'stale' : null;
}

/**
 * The seven object statuses of the status line, each derived from something on
 * record.
 *
 * Open in IT and Management; in Business they are folded into the single
 * "Project status" row of ADR-026 and reached from there.
 */
export function workspaceStatusLine(project: Project | null): WorkspaceStatus[] {
  const steps = workflowSteps(project);
  const by = Object.fromEntries(steps.map((s) => [s.key, s])) as Record<PhaseKey, RailStep>;

  const usage = project?.usageReport ?? null;
  const usageCount = Array.isArray(usage?.records) ? usage.records.length : 0;

  const provenance: WorkspaceStatus = {
    facet: 'provenance',
    label: 'Provenance',
    status: statusOfPhase(by.analyze),
    detail: by.analyze.detail,
    from: 'analyze',
    provenance: staleChip(by.analyze) ?? (by.analyze.proven ? 'proven' : null),
  };

  // Need — "do I still need this?" (§5.6). Rule confirmation does not exist in
  // this release, so the only thing on record that speaks to the question is an
  // imported usage report. It is `partial` when there is one: usage says whether
  // a program still runs, which is half the question and is stated as half.
  const need: WorkspaceStatus =
    usageCount > 0
      ? {
          facet: 'need',
          label: 'Need',
          status: 'partial',
          detail: `Usage imported for ${usageCount} object${usageCount === 1 ? '' : 's'}. No business rule has been confirmed — rule confirmation comes with the process model.`,
          from: null,
          provenance: 'imported',
        }
      : {
          facet: 'need',
          label: 'Need',
          status: 'not-started',
          detail:
            'No business rule confirmed and no usage imported. Usage that was never imported is unknown, never “unused”.',
          from: null,
          provenance: null,
        };

  // Standard — a standard candidate is only worth showing with the evidence
  // level that says how strongly it is backed, and evidence levels arrive with
  // roadmap 7.2. The routing recommendation on the project is not that, and
  // reading it here would be the "the standard covers it" claim §5.3 forbids.
  const standard: WorkspaceStatus = {
    facet: 'standard',
    label: 'Standard',
    status: 'not-started',
    detail: 'No standard candidate carries an evidence level yet, so none is claimed here.',
    from: null,
    provenance: null,
  };

  const costs: WorkspaceStatus = {
    facet: 'costs',
    label: 'Costs',
    status: statusOfPhase(by.tco),
    detail: by.tco.detail,
    from: 'tco',
    provenance: staleChip(by.tco) ?? (by.tco.state === 'partial' ? 'simulation' : null),
  };

  // Confirmed — the architecture sign-off. A self-declaration by the signed-in
  // account, so it wears the *Confirmed* chip (information) and never the green
  // of *Proven*: `workflowSteps` already refuses to mark the design phase
  // `proven`, and `statusOfPhase` therefore cannot return `done` for it.
  const signedOff = project?.approvedByArchitect === true;
  const confirmed: WorkspaceStatus = {
    facet: 'confirmed',
    label: 'Confirmed',
    status: statusOfPhase(by.design),
    detail: by.design.detail,
    from: 'design',
    provenance: staleChip(by.design) ?? (signedOff ? 'confirmed' : null),
  };

  // Execution — a test run. "mock only" is its own object status because a
  // simulation that reads as a partial pass is the single most expensive lie
  // this product could tell.
  const tests = Array.isArray(project?.testCases) ? project!.testCases! : [];
  const simulated = tests.filter((t) => t?.status === 'Simulated').length;
  const executed = tests.filter((t) => t?.status === 'Passed' || t?.status === 'Failed').length;
  const failed = tests.filter((t) => t?.status === 'Failed').length;
  const mockOnly = tests.length > 0 && executed === 0 && simulated > 0;
  const execution: WorkspaceStatus = {
    facet: 'execution',
    label: 'Execution',
    status:
      by.testing.state === 'stale'
        ? 'partial'
        : failed > 0
          ? 'failed'
          : mockOnly
            ? 'mock-only'
            : statusOfPhase(by.testing),
    detail: by.testing.detail,
    from: 'testing',
    provenance: staleChip(by.testing) ?? (mockOnly ? 'demonstrated-mock' : by.testing.proven ? 'proven' : null),
  };

  const handover: WorkspaceStatus = {
    facet: 'handover',
    label: 'Handover',
    status: statusOfPhase(by.delivery),
    detail: by.delivery.detail,
    from: 'delivery',
    provenance: staleChip(by.delivery),
  };

  return [provenance, need, standard, costs, confirmed, execution, handover];
}

/* -------------------------------------------------------------- the layers */

/**
 * The layers of the Anchor Bar — `DESIGN.md` §2.3 item 4, and only these.
 *
 * The bar carries layers and nothing else: the views are a segmented control in
 * the header and the seven stages are a toolbar under it, so that each of the
 * three navigations has exactly one job (ADR-018).
 */
export const LAYERS = [
  'need',
  'standard',
  'costs',
  'architecture',
  'evidence',
  'changes',
] as const;
export type LayerKey = (typeof LAYERS)[number];

export interface LayerRow {
  /** Stable within the layer — the React key and the test's handle. */
  key: string;
  /** The word before the value. */
  label: string;
  /** The value, in the reader's terms. Never empty: a row exists because it has one. */
  value: string;
  /** `L225–L234`, or `null` when the row has no line of its own. */
  anchor: string | null;
}

export interface WorkspaceLayer {
  key: LayerKey;
  label: string;
  /** The URL fragment that holds where the reader is (ADR-018). */
  hash: string;
  /** What is in it — "42 findings", "1 signed run". `null` when it is empty. */
  count: string | null;
  /** Why it is empty, in the reader's terms — under "More" and in the section itself (§2.11). */
  missing: string;
  /**
   * What the layer holds, at most the first five (§2.11). Empty **exactly** when
   * `count` is `null` — the one invariant that keeps the bar and the section
   * from disagreeing about whether there is anything to read. Without it a tab
   * with a count opens on nothing, or a layer under "More" quietly has content.
   */
  rows: LayerRow[];
  /** How many rows exist in total, so the section can say "Show all 42" (§2.11). */
  total: number;
  /**
   * Where the rows come from (§4) — one of the nine values of
   * `lib/provenance.ts`, never a wording of this module's own. An empty layer
   * carries `not-determined`, which is what it is: nothing was worked out here.
   */
  provenance: ProvenanceValue;
}

/**
 * The layer a `#fragment` names, or `null`.
 *
 * `null` rather than the default, deliberately: `#L231` is a line anchor and
 * not a layer, and a reader who arrived on one has not chosen a layer at all.
 * Collapsing the two here would leave the shell unable to tell "no layer
 * chosen" from "the first layer chosen", and the first filled layer would
 * become a decision the reader never made.
 */
export function layerFromHash(hash: string | null | undefined): LayerKey | null {
  if (typeof hash !== 'string') return null;
  const bare = hash.replace(/^#/, '');
  return (LAYERS as readonly string[]).includes(bare) ? (bare as LayerKey) : null;
}

/** A hash is quoted at the length a person can compare by eye, never in full. */
function shortId(hash: string | undefined | null): string | null {
  return typeof hash === 'string' && hash.length >= 8 ? hash.slice(0, 8) : null;
}

/** An entry of a stored list that is an object at all — records from every version are read. */
function isRecord<T>(value: T): value is T & object {
  return typeof value === 'object' && value !== null;
}

/** A stored name, or the sentence that says it was not recorded — never `undefined` on screen. */
function nameOr(value: unknown, absent: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : absent;
}

/**
 * Whose table it is — three answers, not two (`DataCouplingEntry.isStandard`).
 *
 * A reserved-namespace name is neither a customer's nor SAP's by its name, and
 * an entry stored before 2.16 does not say which it is; reading `!isCustom` as
 * "SAP table" is the misreading the field exists to stop.
 */
function ownershipOf(entry: { isCustom?: unknown; isStandard?: unknown }): string {
  if (entry.isCustom === true) return 'custom table';
  if (entry.isStandard === true) return 'SAP table';
  if (entry.isStandard === false) return 'ownership not determined';
  return 'ownership not recorded';
}

/**
 * Layers with content first; empty ones go under "More" and say what is missing
 * (§2.11). Every row below comes from a field that is actually on the project,
 * which is why four of them are routinely empty on a fresh case — and why the
 * bar says so instead of showing six confident-looking tabs.
 *
 * **A layer with nothing in it says that, and why** (roadmap 6.2, W22-A03).
 * Each of the six carries its own temptation — *Standard fit* could read the
 * routing recommendation sitting on the project, *Costs* could print the Clean
 * Core score as if it were money, *Changes* could call the project's
 * `updatedAt` a revision — and every one of those is the "the standard covers
 * it" claim `DESIGN.md` §5.3 forbids, one layer down. So an empty layer carries
 * the sentence that names the artefact that is missing, and no row.
 */
export function workspaceLayers(project: Project | null): WorkspaceLayer[] {
  const usage = project?.usageReport ?? null;
  const usageRecords = Array.isArray(usage?.records) ? usage.records : [];
  const inventory = Array.isArray(project?.codeInventory) ? project.codeInventory : [];
  const coupling = Array.isArray(project?.dataCoupling) ? project.dataCoupling : [];
  const runId = typeof project?.activeRunId === 'string' ? project.activeRunId.trim() : '';
  // A run the loader could not read is not a signed run this screen can show
  // (roadmap 3.0.2): the id is on the project, the signature is on the run, and
  // the run is not here. Both layers that derive from it say so instead.
  const runUnreadable = runId.length > 0 && project?._runLoadFailed === true;
  const hasRun = runId.length > 0 && !runUnreadable;
  const fingerprint = project?.auditMetadata?.inputFingerprint ?? null;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  /** §2.11: the first five, and the section says how many there are in all. */
  const FIRST = 5;

  /* ------------------------------------------------------------- need */
  const needRows: LayerRow[] = usageRecords.filter(isRecord).map((record, i) => ({
    key: `usage-${i}`,
    label: nameOr(record.objectName, 'object name not recorded'),
    // `null` is not zero (`lib/workspace-rows.ts`): an export with no call
    // column did not measure zero calls, it measured nothing at all — and the
    // difference decides whether an object is a retirement candidate.
    value:
      typeof record.callCount === 'number'
        ? `${plural(record.callCount, 'call')} in the measured window`
        : 'no call count in the export',
    anchor: null,
  }));

  /* ----------------------------------------------------- architecture */
  const architectureRows: LayerRow[] = [
    ...inventory.filter(isRecord).map((item, i) => ({
      key: `object-${i}`,
      label: nameOr(item.objectName, 'object name not recorded'),
      value: nameOr(item.type, 'type not recorded'),
      anchor:
        typeof item.lineStart === 'number' && typeof item.lineEnd === 'number'
          ? `L${item.lineStart}–L${item.lineEnd}`
          : typeof item.lineStart === 'number'
            ? `L${item.lineStart}`
            : null,
    })),
    ...coupling.filter(isRecord).map((entry, i) => ({
      key: `table-${i}`,
      label: nameOr(entry.tableName, 'table name not recorded'),
      value: `${nameOr(entry.accessType, 'access not recorded')} · ${ownershipOf(entry)}`,
      anchor:
        Array.isArray(entry.lineNumbers) && typeof entry.lineNumbers[0] === 'number'
          ? `L${entry.lineNumbers[0]}`
          : null,
    })),
  ];

  /* ------------------------------------------------------------ costs */
  const costsRows: LayerRow[] = hasRun
    ? [
        {
          key: 'basis',
          label: 'Basis',
          value: 'assumed effort coefficients, not observed costs',
          anchor: null,
        },
        ...(typeof project?.cleanCoreScore === 'number'
          ? [
              {
                key: 'score',
                label: 'Clean Core score the estimate starts from',
                value: String(project.cleanCoreScore),
                anchor: null,
              },
            ]
          : []),
      ]
    : [];

  /* --------------------------------------------------------- evidence */
  const evidenceRows: LayerRow[] = hasRun
    ? [
        { key: 'run', label: 'Signed run', value: shortId(runId) ?? runId, anchor: null },
        ...(shortId(fingerprint?.sha256)
          ? [
              {
                key: 'fingerprint',
                label: 'Source fingerprint',
                value: `${shortId(fingerprint?.sha256)}${
                  fingerprint?.fileName ? ` · ${fingerprint.fileName}` : ''
                }`,
                anchor: null,
              },
            ]
          : []),
        ...(typeof project?.auditMetadata?.auditPackExportedAt === 'string'
          ? [
              {
                key: 'pack',
                label: 'Audit pack exported',
                value: project.auditMetadata.auditPackExportedAt.slice(0, 10),
                anchor: null,
              },
            ]
          : []),
        ...(project?.atcReport
          ? [{ key: 'atc', label: 'ATC results', value: 'imported', anchor: null }]
          : []),
      ]
    : [];

  return [
    {
      key: 'need',
      label: 'Need & process',
      hash: '#need',
      count: needRows.length > 0 ? plural(needRows.length, 'object with usage') : null,
      missing: 'The process reconstructed from the code, and the rules hidden in it, are not here yet.',
      rows: needRows.slice(0, FIRST),
      total: needRows.length,
      provenance: needRows.length > 0 ? 'imported' : 'not-determined',
    },
    {
      key: 'standard',
      label: 'Standard fit',
      hash: '#standard',
      count: null,
      missing: 'No standard candidate carries an evidence level yet.',
      rows: [],
      total: 0,
      provenance: 'not-determined',
    },
    {
      key: 'costs',
      label: 'Costs & assumptions',
      hash: '#costs',
      count: costsRows.length > 0 ? 'model estimate' : null,
      missing: runUnreadable
        ? 'Economics models costs from a signed run, and the one on record could not be read.'
        : 'Economics models costs from a signed run; there is none.',
      rows: costsRows,
      total: costsRows.length,
      provenance: costsRows.length > 0 ? 'simulation' : 'not-determined',
    },
    {
      key: 'architecture',
      label: 'Architecture & dependencies',
      hash: '#architecture',
      count:
        architectureRows.length > 0
          ? [
              inventory.length > 0 ? plural(inventory.length, 'object') : null,
              coupling.length > 0
                ? `${coupling.length} ${coupling.length === 1 ? 'dependency' : 'dependencies'}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : null,
      missing: 'Nothing has been analysed, so there are no objects and no dependencies to show.',
      rows: architectureRows.slice(0, FIRST),
      total: architectureRows.length,
      provenance: architectureRows.length > 0 ? 'reconstructed' : 'not-determined',
    },
    {
      key: 'evidence',
      label: 'Evidence & controls',
      hash: '#evidence',
      count: evidenceRows.length > 0 ? '1 signed run' : null,
      missing: runUnreadable
        ? 'A signed run is on record and could not be read, so what it proves is not determined.'
        : 'No signed run — every figure in this product derives from one.',
      rows: evidenceRows.slice(0, FIRST),
      total: evidenceRows.length,
      provenance: evidenceRows.length > 0 ? 'proven' : 'not-determined',
    },
    {
      key: 'changes',
      label: 'Changes & commitments',
      hash: '#changes',
      count: null,
      missing: 'Revisions and decisions are recorded from the process model onward.',
      rows: [],
      total: 0,
      provenance: 'not-determined',
    },
  ];
}

/* ------------------------------------------------------- not determined */

export interface NotDeterminedItem {
  /** What was seen, in the reader's words. */
  label: string;
  /** Why it could not be judged — a limit of the engine, never an accusation. */
  why: string;
  /** The line anchor, `L502`. */
  anchor: string;
}

export interface NotDetermined {
  items: NotDeterminedItem[];
  /** How many constructs the detectors stepped over. */
  count: number;
  /** True when there is no source to assess at all — a different thing from zero. */
  noSource: boolean;
}

/**
 * What the engine could not work out — `DESIGN.md` §5.1, §5.5.
 *
 * *"Der Zweifel wird sofort beantwortet."* This area is the reason to trust the
 * rest of the screen, so it is a thing with its own place and not an absence.
 *
 * The source is `assessCoverage`, which already answers exactly this question:
 * which constructs in the code fall outside what the detectors judge, and why.
 * Three states, and they are three different sentences:
 *
 *   - **no source** — nothing has been uploaded, so nothing was stepped over
 *     and nothing was assessed either;
 *   - **none** — every construct fell inside the detectors that ran. Stated as
 *     the boundary of the question the engine answered, never as a clean bill;
 *   - **some** — each one with its reason and its line.
 */
export function notDetermined(project: Project | null): NotDetermined {
  const source = typeof project?.legacyCode === 'string' ? project.legacyCode : '';
  if (!source.trim()) return { items: [], count: 0, noSource: true };

  const report = assessCoverage(source);
  const items = report.unassessed.map((u: UnassessedConstruct) => ({
    label: u.label,
    why: u.why,
    anchor: `L${u.line}`,
  }));
  return { items, count: items.length, noSource: false };
}

/* ------------------------------------------------------------- the tools */

/**
 * The seven stages as tools under the header (`DESIGN.md` §2.3 item 3).
 *
 * Order and labels come from `lib/workflow-steps.ts` and are not restated here
 * — the toolbar is the eighth reader of that contract, not a new copy of it. A
 * tool opens a stage as its own page; it is **not** a progress indicator
 * (ADR-018), which is why nothing in the toolbar carries a state colour.
 */
export function workspaceTools(project: Project | null): Array<{ key: PhaseKey; label: string; path: string }> {
  return workflowSteps(project).map((s) => ({ key: s.key, label: s.label, path: s.path }));
}

/** Re-exported so a screen reading a status never has to reach for the ladder itself. */
export { phaseTone };
