/**
 * Every choice has one address, and a way back (owner 11.10.2026, roadmap after
 * 3.0.8: "every choice leads straight to its place — and back").
 *
 * A *choice* is a place where the reader decides something: the target
 * architecture's sign-off in Design, an option in Management, the rules in
 * Business, the rates in Economics. Many surfaces ask for the same choice —
 * the decision card, the delivery chain, "Next step", the tool bar — and until
 * now each built its own link, most of them to the top of a tool. Here each
 * choice has exactly one address: the surface it lives on (a tool, or a view of
 * the workspace) and the anchor of the control itself (`CHOICES`).
 *
 * An *origin* is the place that asked. A link to a choice carries it as
 * `?origin=<key>`, and the place of the choice shows "Back to <origin>". The
 * origin is a key of a **closed list** (`ORIGINS`) and nothing else: no path,
 * no id, no URL travels in the address, so the way back cannot be pointed
 * anywhere this module does not name (no open redirect — the same stance as
 * `lib/return-path.ts`). The base the hrefs are built on is checked too
 * (`isChoiceBase`): `/project/<id>` or `/demo`, nothing else. It is never stored, never sent to an API, and it goes
 * one level deep: the way back carries no origin of its own.
 *
 * Pure: no component imports, no browser. `tests/choice-addresses.spec.ts`
 * holds every key, every href and every refusal.
 *
 * Note on the import of `stageHref`: `lib/workspace-back-href.ts` reads the
 * origin back from this module (`stageBackLink`), and this module builds its
 * tool links on `stageHref`. Neither touches the other at module evaluation
 * time — only inside functions — so the cycle is harmless in every bundler and
 * in the specs; keep it that way (no top-level use of the other's exports).
 */
import { isWorkspaceView, VIEW_LABELS, type WorkspaceView } from '@/lib/workspace-model';
import { PHASES, type PhaseKey, type PhaseState } from '@/lib/workflow-steps';
import { DEMO_ROUTE, DEMO_WORKSPACE_ROUTE } from '@/lib/demo-marks';
import { nav, navViewLabel, type NavigationMessageKey } from '@/lib/messages/navigation';
import { OPEN_QUESTION_ACTIONS, type OpenQuestionAction } from '@/lib/open-questions';
import { stageHref } from '@/lib/workspace-back-href';

/** An id that can stand in a fragment: letters, digits, `_` and `-`, starting with a letter. */
export const PLACE_ID = /^[A-Za-z][\w-]{0,63}$/;

/** The longest origin key the address may carry; anything longer is not one of ours. */
const ORIGIN_MAX = 96;

/** Where a choice or an origin lives: a tool of the project, or a view of its workspace. */
export type ChoiceSurface =
  | { kind: 'tool'; path: string }
  | { kind: 'view'; view: WorkspaceView }
  /** The workspace in the view the reader is in (the tool bar, the status line). */
  | { kind: 'workspace' };

export interface ChoiceAddress {
  surface: ChoiceSurface;
  /** The id of the control's section, the link's fragment; `null` where the address is a query (`?add=`). */
  anchor: string | null;
  /** What the reader does there, in words ("Sign off the target architecture"). */
  label: string;
  /** Where it is, in words ("Design"). */
  place: string;
  /**
   * What the target page has to open before the anchor can be reached — a tab,
   * a fold, an editing mode. A hint for the page's own `useRevealOnHash`; the
   * address works without it.
   */
  reveal?: string;
  /** A query the address carries instead of, or besides, an anchor (`?add=usage`). */
  query?: Readonly<Record<string, string>>;
  /** A selector, inside the anchor, of the control that takes the focus on arrival (`[data-choice-focus]` is the default). */
  focus?: string;
}

/* ------------------------------------------------------------------ choices */

const TOOL = (path: string): ChoiceSurface => ({ kind: 'tool', path });
const VIEW = (view: WorkspaceView): ChoiceSurface => ({ kind: 'view', view });
const PHASE_LABEL = (key: PhaseKey): string => PHASES.find((p) => p.key === key)?.label ?? key;
const VIEW_PLACE = (view: WorkspaceView): string => navViewLabel(VIEW_LABELS[view]);

/** The choices with a fixed address — inventory C1–C21 of the plan, the parameterised ones below. */
export const STATIC_CHOICE_KEYS = [
  'design.target-signoff',
  'management.options',
  'management.confirm',
  'business.rules',
  'business.walk',
  'business.open-questions',
  'it.open-questions',
  'management.open-questions',
  'it.target',
  'it.standard-fit',
  'economics.rates',
  'economics.cadence',
  'economics.effort',
  'economics.result',
  'economics.compare',
  'testing.run',
  'testing.write',
  'testing.sap-result',
  'testing.hand',
  'delivery.audit-pack',
  'delivery.still-needed',
  'analyze.add-usage',
  'analyze.add-atc',
  'requirements.nfr-questions',
] as const;
export type StaticChoiceKey = (typeof STATIC_CHOICE_KEYS)[number];

/** The choices whose address names one thing — an option, a deferral, a requirement, a group of questions. */
export type ParamChoiceKey =
  | `economics.option.${string}`
  | `economics.deferral.${string}`
  | `requirements.decision.${string}`
  | `requirements.req.${string}`
  | `requirements.nfr-questions.${string}`
  | `${WorkspaceView}.open-questions.${OpenQuestionAction}`;

export type ChoiceKey = StaticChoiceKey | ParamChoiceKey;

const c = (
  surface: ChoiceSurface,
  anchor: string | null,
  label: NavigationMessageKey,
  place: string,
  extra: Pick<ChoiceAddress, 'reveal' | 'query' | 'focus'> = {},
): ChoiceAddress => ({ surface, anchor, label: nav(label), place, ...extra });

/** Every choice with a fixed address. */
export const CHOICES: Readonly<Record<StaticChoiceKey, ChoiceAddress>> = Object.freeze({
  // C1 — inside Design's "Decision" tab; the confirm control takes the focus.
  'design.target-signoff': c(TOOL('design'), 'architect-sign-off', 'nav.choice.designTargetSignoff', PHASE_LABEL('design'), {
    reveal: 'design-decision-tab',
    focus: '[data-design-confirm]',
  }),
  // C2, C3 — the decision in Management.
  'management.options': c(VIEW('management'), 'decision-options', 'nav.choice.managementOptions', VIEW_PLACE('management')),
  'management.confirm': c(VIEW('management'), 'decision-card', 'nav.choice.managementConfirm', VIEW_PLACE('management')),
  // C4 — the rules are answered as the questions for the business in Design
  // (owner decision 21.10.2026: the Business view's opening asks for no rule decision).
  'business.rules': c(TOOL('design'), 'rule-questions', 'nav.choice.businessRules', PHASE_LABEL('design')),
  // C5 — scroll only; the shell's own map follower owns `#process-map`.
  'business.walk': c(VIEW('business'), 'process-map', 'nav.choice.businessWalk', VIEW_PLACE('business')),
  // C6 — the open questions of each view; Management's live in its Evidence fold.
  'business.open-questions': c(VIEW('business'), 'not-determined', 'nav.choice.openQuestions', VIEW_PLACE('business')),
  'it.open-questions': c(VIEW('it'), 'not-determined', 'nav.choice.openQuestions', VIEW_PLACE('it')),
  'management.open-questions': c(VIEW('management'), 'not-determined', 'nav.choice.openQuestions', VIEW_PLACE('management'), {
    reveal: 'management-evidence',
  }),
  // C7
  'it.target': c(VIEW('it'), 'it-target-profile', 'nav.choice.itTarget', VIEW_PLACE('it')),
  // IT's Standard fit section (ADR-096) — asked from Transformation's tips when
  // no decision on record weighed SAP standard against a rebuild.
  'it.standard-fit': c(VIEW('it'), 'standard', 'nav.choice.itStandardFit', VIEW_PLACE('it')),
  // C8–C13 — Economics' four steps and what is inside them.
  'economics.rates': c(TOOL('tco'), 'economics-step-rates', 'nav.choice.economicsRates', PHASE_LABEL('tco')),
  'economics.cadence': c(TOOL('tco'), 'economics-cadence', 'nav.choice.economicsCadence', PHASE_LABEL('tco')),
  'economics.effort': c(TOOL('tco'), 'economics-step-effort', 'nav.choice.economicsEffort', PHASE_LABEL('tco')),
  'economics.result': c(TOOL('tco'), 'economics-step-result', 'nav.choice.economicsResult', PHASE_LABEL('tco')),
  'economics.compare': c(TOOL('tco'), 'economics-compare', 'nav.choice.economicsCompare', PHASE_LABEL('tco')),
  // C14–C16
  'testing.run': c(TOOL('testing'), 'testing-verified', 'nav.choice.testingRun', PHASE_LABEL('testing')),
  'testing.write': c(TOOL('testing'), 'testing-write', 'nav.choice.testingWrite', PHASE_LABEL('testing')),
  'testing.sap-result': c(TOOL('testing'), 'testing-sap-result', 'nav.choice.testingSapResult', PHASE_LABEL('testing')),
  'testing.hand': c(TOOL('testing'), 'testing-hand', 'nav.choice.testingHand', PHASE_LABEL('testing')),
  // C17, C18 — there is no release command, and none is added (owner decision).
  'delivery.audit-pack': c(TOOL('delivery'), 'audit-pack', 'nav.choice.deliveryAuditPack', PHASE_LABEL('delivery')),
  'delivery.still-needed': c(TOOL('delivery'), 'still-needed', 'nav.choice.deliveryStillNeeded', PHASE_LABEL('delivery')),
  // C19 — a query, not an anchor: Analyze opens the matching input.
  'analyze.add-usage': c(TOOL('analyze'), null, 'nav.choice.analyzeAddUsage', PHASE_LABEL('analyze'), { query: { add: 'usage' } }),
  'analyze.add-atc': c(TOOL('analyze'), null, 'nav.choice.analyzeAddAtc', PHASE_LABEL('analyze'), { query: { add: 'atc' } }),
  // C21 without a category — the non-functional section of the specification.
  'requirements.nfr-questions': c(TOOL('design/requirements'), 'spec-s4', 'nav.choice.requirementsNfr', nav('nav.place.requirements')),
});

/**
 * The address of any choice key — fixed or parameterised — or `null` for a key
 * that is not one, or whose id could not stand in a fragment.
 */
export function choiceAddress(key: string): ChoiceAddress | null {
  if (typeof key !== 'string' || key.length > ORIGIN_MAX + 64) return null;
  if (Object.prototype.hasOwnProperty.call(CHOICES, key)) return CHOICES[key as StaticChoiceKey];
  const param = (prefix: string): string | null => {
    if (!key.startsWith(prefix)) return null;
    const id = key.slice(prefix.length);
    return PLACE_ID.test(id) ? id : null;
  };
  let id: string | null;
  // C10, C11 — one option's card; editing opens on arrival, a deferral focuses its field.
  if ((id = param('economics.option.'))) {
    return c(TOOL('tco'), `cost-option-${id}`, 'nav.choice.economicsEffort', PHASE_LABEL('tco'), { reveal: 'cost-option-edit' });
  }
  if ((id = param('economics.deferral.'))) {
    return c(TOOL('tco'), `cost-option-${id}`, 'nav.choice.economicsDeferral', PHASE_LABEL('tco'), {
      reveal: 'cost-option-edit',
      focus: `#${id}-upgrade-delay`,
    });
  }
  // C20, C21 — the specification under Design.
  if ((id = param('requirements.decision.'))) {
    return c(TOOL('design/requirements'), `decision-${id}`, 'nav.choice.requirementsDecision', nav('nav.place.requirements'));
  }
  if ((id = param('requirements.req.'))) {
    return c(TOOL('design/requirements'), `req-${id}`, 'nav.choice.requirementsRequirement', nav('nav.place.requirements'));
  }
  if ((id = param('requirements.nfr-questions.'))) {
    return c(TOOL('design/requirements'), `nfr-q-${id}`, 'nav.choice.requirementsNfr', nav('nav.place.requirements'));
  }
  // C6 — one group of open questions, by the action that answers it.
  const group = /^(business|it|management)\.open-questions\.(.+)$/.exec(key);
  if (group && (OPEN_QUESTION_ACTIONS as readonly string[]).includes(group[2])) {
    const parent = CHOICES[`${group[1] as WorkspaceView}.open-questions` as StaticChoiceKey];
    return { ...parent, anchor: `oq-${group[2]}` };
  }
  return null;
}

export function isChoiceKey(key: unknown): key is ChoiceKey {
  return typeof key === 'string' && choiceAddress(key) !== null;
}

/* ------------------------------------------------------------------ origins */

/** The places a choice may be asked from — a closed list. */
export const STATIC_ORIGIN_KEYS = [
  'management.rests-on.need',
  'management.rests-on.option',
  'management.rests-on.cost',
  'management.rests-on.contract',
  'management.options',
  'business.next-step',
  'it.next-step',
  'management.next-step',
  'business.open-questions',
  'it.open-questions',
  'management.open-questions',
  'it.target-profile',
  'it.elsewhere',
  'management.elsewhere',
  'workspace.tools',
  'workspace.status',
  'delivery.still-needed',
  'delivery.next',
  'analyze.open-questions',
  'analyze.decide',
  'documentation.questions',
  'design.requirements-entry',
  'transformation.tips',
] as const;

/**
 * The links of Delivery's evidence chain (`HANDOVER_LINKS` in `lib/handover.ts`).
 * Repeated here rather than imported, so the shell does not carry the handover
 * model to name a way back; `tests/choice-addresses.spec.ts` holds the two lists together.
 */
export const CHAIN_LINKS = [
  'source',
  'run',
  'analysis',
  'design',
  'transformation',
  'documentation',
  'tests',
  'economics',
  'decision',
] as const;
export type ChainLinkKey = (typeof CHAIN_LINKS)[number];

export type OriginKey = (typeof STATIC_ORIGIN_KEYS)[number] | `delivery.chain.${ChainLinkKey}`;

export interface OriginAddress {
  surface: ChoiceSurface;
  anchor: string;
  /** The place in words — "Options", "Still needed". */
  label: string;
}

const o = (surface: ChoiceSurface, anchor: string, label: NavigationMessageKey): OriginAddress => ({
  surface,
  anchor,
  label: nav(label),
});

/** Every place a choice may be asked from, and where its way back lands. */
export const ORIGINS: Readonly<Record<OriginKey, OriginAddress>> = Object.freeze({
  'management.rests-on.need': o(VIEW('management'), 'decision-rests-on-need', 'nav.place.restsOnNeed'),
  'management.rests-on.option': o(VIEW('management'), 'decision-rests-on-option', 'nav.place.restsOnOption'),
  'management.rests-on.cost': o(VIEW('management'), 'decision-rests-on-cost', 'nav.place.restsOnCost'),
  'management.rests-on.contract': o(VIEW('management'), 'decision-rests-on-contract', 'nav.place.restsOnContract'),
  'management.options': o(VIEW('management'), 'decision-options', 'nav.place.options'),
  'business.next-step': o(VIEW('business'), 'next-step', 'nav.place.nextStep'),
  'it.next-step': o(VIEW('it'), 'next-step', 'nav.place.nextStep'),
  'management.next-step': o(VIEW('management'), 'next-step', 'nav.place.nextStep'),
  'business.open-questions': o(VIEW('business'), 'not-determined', 'nav.place.openQuestions'),
  'it.open-questions': o(VIEW('it'), 'not-determined', 'nav.place.openQuestions'),
  'management.open-questions': o(VIEW('management'), 'not-determined', 'nav.place.openQuestions'),
  'it.target-profile': o(VIEW('it'), 'it-target-profile', 'nav.place.targetProfile'),
  'it.elsewhere': o(VIEW('it'), 'it-elsewhere', 'nav.place.linksOut'),
  'management.elsewhere': o(VIEW('management'), 'management-elsewhere', 'nav.place.linksOut'),
  // The workspace's own controls stand in every view; the way back keeps the reader's.
  'workspace.tools': o({ kind: 'workspace' }, 'workspace-tools', 'nav.place.tools'),
  'workspace.status': o({ kind: 'workspace' }, 'workspace-status', 'nav.place.projectStatus'),
  'delivery.still-needed': o(TOOL('delivery'), 'still-needed', 'nav.place.stillNeeded'),
  'delivery.next': o(TOOL('delivery'), 'delivery-next', 'nav.place.nextStep'),
  'analyze.open-questions': o(TOOL('analyze'), 'analyze-open-questions', 'nav.place.openQuestions'),
  'analyze.decide': o(TOOL('analyze'), 'analyze-decide', 'nav.place.whatToDecide'),
  'documentation.questions': o(TOOL('documentation'), 'documentation-questions', 'nav.place.openQuestions'),
  'design.requirements-entry': o(TOOL('design'), 'requirements', 'nav.place.requirements'),
  // The tips before a generation (roadmap 3.0.12): every tip leads to its place and back to the tips.
  'transformation.tips': o(TOOL('transformation'), 'transformation-tips', 'nav.place.qualityTips'),
  ...(Object.fromEntries(
    CHAIN_LINKS.map((k) => [`delivery.chain.${k}`, o(TOOL('delivery'), `evidence-chain-${k}`, 'nav.place.evidenceChain')]),
  ) as Record<`delivery.chain.${ChainLinkKey}`, OriginAddress>),
});

export function isOriginKey(key: unknown): key is OriginKey {
  return typeof key === 'string' && key.length <= ORIGIN_MAX && Object.prototype.hasOwnProperty.call(ORIGINS, key);
}

/**
 * The origin an address carries, or `null`. Only a key of `ORIGINS`, exactly as
 * written — never decoded beyond what `URLSearchParams` does, never repaired —
 * and only when the address carries exactly one.
 */
export function originOf(search: string | URLSearchParams | null | undefined): OriginKey | null {
  if (search === null || search === undefined) return null;
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const all = params.getAll('origin');
  if (all.length !== 1) return null;
  return isOriginKey(all[0]) ? all[0] : null;
}

/* ------------------------------------------------------------------- hrefs */

/**
 * Whether a base is one this module builds on: the demo's `/demo`, or
 * `/project/<id>` with one path segment that holds no `/`, `\`, `?`, `#` or
 * whitespace as written, and is not `.`/`..` and holds no `/` or `\` once
 * decoded (the caller encodes the id, so `p%201` is fine). Anything else —
 * `//host`, `https://host`, `/project/../x` — gets no href, so every address
 * this module returns stays a path of this origin.
 */
export function isChoiceBase(base: unknown): base is string {
  if (typeof base !== 'string') return false;
  if (base === DEMO_ROUTE) return true;
  const m = /^\/project\/([^/\\?#\s]+)$/.exec(base);
  if (!m) return false;
  let id: string;
  try {
    id = decodeURIComponent(m[1]);
  } catch {
    return false;
  }
  return id !== '.' && id !== '..' && !/[/\\]/.test(id);
}

/** The workspace page under a base: `/project/<id>`, or `/demo/workspace` for the demo's `/demo`. */
function workspaceOf(base: string): string {
  return base === DEMO_ROUTE ? DEMO_WORKSPACE_ROUTE : base;
}

function viewHref(base: string, view: WorkspaceView | null, origin: OriginKey | null, anchor: string | null): string {
  const params = new URLSearchParams();
  if (view) params.set('view', view);
  if (origin) params.set('origin', origin);
  const query = params.toString();
  return `${workspaceOf(base)}${query ? `?${query}` : ''}${anchor && PLACE_ID.test(anchor) ? `#${anchor}` : ''}`;
}

/**
 * The address of a choice, with the place that asked for it:
 *
 *   tool → `/project/<id>/<path>?view=<reader's view>&origin=<key>[&add=…]#<anchor>`
 *   view → `/project/<id>?view=<the choice's view>&origin=<key>#<anchor>`
 *
 * `base` is `/project/<id>` (encoded by the caller, as for `stageHref`) or
 * `/demo`. `view` is the reader's view — a tool keeps it, so the tool's own way
 * back to the workspace still returns there. An origin that is not on the list
 * is left out; a parameterised key whose id is not an id loses its anchor. A
 * base that is neither (`isChoiceBase`) gets `null`, never an href.
 */
export function choiceHref({
  base,
  choice,
  origin,
  view,
}: {
  base: string;
  choice: ChoiceKey;
  origin?: OriginKey | null;
  view?: string | null;
}): string | null {
  if (!isChoiceBase(base)) return null;
  const address = choiceAddress(choice);
  const from = isOriginKey(origin) ? origin : null;
  if (!address) return viewHref(base, isWorkspaceView(view) ? view : null, from, null);
  const { surface, anchor, query } = address;
  if (surface.kind === 'tool') {
    const href = stageHref({ base, path: surface.path, view, origin: from });
    const extra = query ? new URLSearchParams(query).toString() : '';
    const withQuery = extra ? `${href}${href.includes('?') ? '&' : '?'}${extra}` : href;
    return anchor && PLACE_ID.test(anchor) ? `${withQuery}#${anchor}` : withQuery;
  }
  const target = surface.kind === 'view' ? surface.view : isWorkspaceView(view) ? view : null;
  return viewHref(base, target, from, anchor);
}

/**
 * Where "Back to <origin>" leads: the origin's surface at its anchor, one level
 * deep — the result carries no origin. A tool keeps the reader's view (from the
 * address the reader is on), so that tool's own way back still works; a view is
 * the origin's own; the workspace's controls keep the reader's view.
 */
export function originBackHref({
  base,
  origin,
  search = '',
}: {
  base: string;
  origin: OriginKey;
  /** The address the reader is on, for the view to keep. */
  search?: string;
}): string | null {
  if (!isOriginKey(origin) || !isChoiceBase(base)) return null;
  const { surface, anchor } = ORIGINS[origin];
  const asked = new URLSearchParams(search).get('view');
  const view = isWorkspaceView(asked) ? asked : null;
  if (surface.kind === 'tool') return `${stageHref({ base, path: surface.path, view })}#${anchor}`;
  return viewHref(base, surface.kind === 'view' ? surface.view : view, null, anchor);
}

/**
 * The words of the way back: "Back to" and the place — "Management view,
 * Options", "Delivery, Still needed", "IT view, Tools".
 */
export function originBackLabel(origin: OriginKey, search = ''): { lead: string; place: string } | null {
  if (!isOriginKey(origin)) return null;
  const { surface, label } = ORIGINS[origin];
  const asked = new URLSearchParams(search).get('view');
  const where =
    surface.kind === 'tool'
      ? PHASE_LABEL(surface.path as PhaseKey)
      : surface.kind === 'view'
        ? VIEW_PLACE(surface.view)
        : isWorkspaceView(asked)
          ? VIEW_PLACE(asked)
          : null;
  return { lead: nav('nav.backTo'), place: where ? `${where}, ${label}` : label };
}

/* ----------------------------------------------------------------- helpers */

/**
 * The choice a phase asks for while it is not done — what "Next step" and the
 * tool bar point at. `null` where the phase is done, or where its next action
 * is the tool itself rather than one control in it (Analyze runs the analysis,
 * Transformation and Documentation generate).
 */
export function phaseChoice(key: PhaseKey, state: PhaseState): ChoiceKey | null {
  if (state === 'done') return null;
  switch (key) {
    case 'design':
      return 'design.target-signoff';
    case 'testing':
      return state === 'empty' ? 'testing.write' : 'testing.run';
    case 'tco':
      return state === 'empty' ? 'economics.rates' : 'economics.result';
    case 'delivery':
      return 'delivery.still-needed';
    default:
      return null;
  }
}

/**
 * The first open choice of Economics, in the order its steps ask for them:
 * the rates, the upgrade cadence, each option's effort, a deferral, the
 * budget — and, with everything in, the comparison.
 */
export function economicsChoice(rows: {
  rates: boolean;
  cadence: boolean;
  options: ReadonlyArray<{ id: string; effort: boolean; deferral?: boolean | null }>;
  result: boolean;
}): ChoiceKey {
  if (!rows.rates) return 'economics.rates';
  if (!rows.cadence) return 'economics.cadence';
  for (const option of rows.options) {
    if (!option.effort) return PLACE_ID.test(option.id) ? `economics.option.${option.id}` : 'economics.effort';
    if (option.deferral === false) return PLACE_ID.test(option.id) ? `economics.deferral.${option.id}` : 'economics.effort';
  }
  if (!rows.result) return 'economics.result';
  return 'economics.compare';
}

/**
 * The choice Testing asks for: scenarios first; then, on the ABAP Cloud route,
 * the result from the reader's SAP system; otherwise the run here.
 */
export function testingChoice({ abapCloud, hasScenarios }: { abapCloud: boolean; hasScenarios: boolean }): ChoiceKey {
  if (!hasScenarios) return 'testing.write';
  return abapCloud ? 'testing.sap-result' : 'testing.run';
}
