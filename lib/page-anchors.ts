/**
 * The in-page anchor bar of each tool that has one — one rule for all of them
 * (owner 10.10.2026: "the 'On this page' bar in Documentation turned out very
 * smart and user-friendly — use it in the other tools too, so the app has the
 * same look & feel again"). ADR-091.
 *
 * Every bar is drawn by `components/PageAnchorBar.tsx`. Before this, four tools
 * carried an anchor bar of their own — Analyze, Testing (unused), Transformation
 * and Delivery — each with its own underline, its own scroll spy (Transformation
 * had none: its first link stayed marked wherever the reader was) and its own
 * "(n)" counts. This module says, per tool, which sections the bar names, by
 * which id, and what each one counts — pure, so `tests/page-anchor-guard.spec.ts`
 * can hold every id against the markup that renders it.
 *
 * The rules, the IT view's (ADR-086) and the Documentation stage's:
 *   - the page's own sections, in the page's order;
 *   - a section that is not on the page has no anchor; a section with nothing
 *     in it has none either, unless "none" is itself the answer (open items,
 *     what a handover still needs) — never an "empty" chip;
 *   - a count where it says something; the label alone where it would not.
 *
 * Which tools carry one, and why the others do not, is ADR-091: Design is a
 * canvas with its own tabs, Economics is a guided four-step flow whose step
 * guide is its navigation, and the Management view has none (ADR-087).
 */

/** One in-page jump of the bar: where it goes, what it is called, what is in it. */
export interface PageAnchor {
  key: string;
  /** The id of the section on the page — the link's fragment. */
  target: string;
  label: string;
  /** A count or a word ("none", "signed"); empty or null shows the label alone. */
  count?: string | null;
  /** The reader question the section answers — the chip's tooltip. */
  title?: string;
  /**
   * `open` paints the count amber: open questions, the one count that asks the reader for something (ADR-126 (3)).
   * Every other count is a quiet grey badge.
   */
  tone?: 'open';
}

/** The most items one "On this page" bar names (ADR-126 (3)). */
export const PAGE_ANCHOR_MAX = 6;

/**
 * The section ids each tool's bar may name. A guard reads these and finds each
 * one as an `id="…"` in the files that render the tool.
 */
export const PAGE_ANCHOR_IDS = {
  analyze: {
    focus: 'analyze-focus',
    where: 'analyze-where',
    kinds: 'analyze-kinds',
    summary: 'analyze-summary',
    detail: 'analyze-technical-detail',
  },
  transformation: {
    flow: 'tf-flow',
    package: 'tf-package',
    changes: 'tf-changes',
    plan: 'tf-plan',
    side: 'tf-side',
  },
  testing: {
    // The five sections of ADR-131 (S14), in page order …
    tested: 'testing-tested',
    ran: 'testing-ran',
    open: 'testing-open',
    acceptance: 'testing-acceptance',
    developers: 'testing-developers',
    // … and the places inside them the choice addresses and Delivery link to (`lib/choice-addresses.ts`).
    write: 'testing-write',
    run: 'testing-verified',
    sapResult: 'testing-sap-result',
    hand: 'testing-hand',
  },
  delivery: {
    chain: 'evidence-chain',
    needed: 'still-needed',
    artefacts: 'artefacts',
    pack: 'audit-pack',
    slides: 'presentation-preview',
  },
} as const;

/** The accessible name of each tool's bar — what a screen reader announces before the links. */
export const PAGE_ANCHOR_LABELS = {
  analyze: 'Sections of Analyze',
  transformation: 'Sections of Transformation',
  testing: 'Sections of Testing',
  delivery: 'Sections of Delivery',
} as const;

const n = (count: number) => String(count);

/* ------------------------------------------------------------------ Analyze */

/**
 * Analyze: Look here first, Where in the program, Findings by kind, then the
 * two folds below the findings. The side column (route, not determined) is
 * beside the findings and needs no jump. The Clean Core Score has no anchor:
 * it is the hero above the bar, the top of the page (ADR-093).
 */
export function analyzeAnchors(content: {
  /** How many findings "Look here first" picks — 0 hides the anchor. */
  picks: number;
  /** Whether "Where in the program" is drawn (a program map over a source). */
  where: boolean;
  /** All findings — the list's count; "none" is the engine's answer. */
  findings: number;
  /** Whether a model summary is on record (a run without a narrative folds a "not generated" note, no anchor). */
  summary: boolean;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.analyze;
  const out: PageAnchor[] = [];
  if (content.picks > 0) out.push({ key: 'focus', target: ids.focus, label: 'Look here first', count: n(content.picks), title: 'Which findings matter most?' });
  if (content.where) out.push({ key: 'where', target: ids.where, label: 'Where in the program', title: 'Where in the code are the findings?' });
  out.push({ key: 'kinds', target: ids.kinds, label: 'Findings by kind', count: content.findings > 0 ? n(content.findings) : 'none', title: 'Every finding, grouped' });
  if (content.summary) out.push({ key: 'summary', target: ids.summary, label: 'Model summary', title: 'What the analysis model wrote — a proposal' });
  out.push({ key: 'detail', target: ids.detail, label: 'Technical detail', title: 'Constructs, inventory, data access and imports' });
  return out;
}

/* ----------------------------------------------------------- Transformation */

export function transformationAnchors(content: {
  /** Files in the stored package; null where no model can have run (the demo). */
  files: number | null;
  findings: number;
  /** Kinds in the plan — 0 hides the anchor. */
  kinds: number;
  /** Extra sections the page adds under the two columns: [id, label]. */
  extra?: ReadonlyArray<readonly [string, string]>;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.transformation;
  const out: PageAnchor[] = [
    { key: 'flow', target: ids.flow, label: 'Code to package', title: 'From your code to the generated package' },
    {
      key: 'package',
      target: ids.package,
      label: 'Generated package',
      count: content.files === null ? null : content.files > 0 ? n(content.files) : 'none',
      title: 'The files the model wrote',
    },
    { key: 'changes', target: ids.changes, label: 'Finding to change', count: content.findings > 0 ? n(content.findings) : 'none', title: 'Each finding, its target and the generated code' },
  ];
  if (content.kinds > 0) out.push({ key: 'plan', target: ids.plan, label: 'Plan by kind', count: n(content.kinds), title: 'One line per kind of finding' });
  for (const [id, label] of content.extra ?? []) out.push({ key: id, target: id, label });
  return out;
}

/* ------------------------------------------------------------------ Testing */

export function testingAnchors(content: {
  /** Business rules the page lists under "What was tested"; null while none are read. */
  rules: number | null;
  /** "Where it ran" is drawn (not in the demo). */
  ran: boolean;
  /** Points of the *Not proven* list — amber, an open count. */
  notProven: number;
  /** Rules with acceptance checks; 0 or null hides the anchor. */
  acceptance: number | null;
  /** "For developers" is drawn (not in the demo). */
  developers: boolean;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.testing;
  const out: PageAnchor[] = [
    { key: 'tested', target: ids.tested, label: 'What was tested', count: content.rules && content.rules > 0 ? n(content.rules) : null, title: 'Every business rule with the scenarios that test it' },
  ];
  if (content.ran) out.push({ key: 'ran', target: ids.ran, label: 'Where it ran', title: 'Here against SAP mocks, or in your SAP system' });
  out.push({
    key: 'open',
    target: ids.open,
    label: 'Not proven',
    count: content.notProven > 0 ? n(content.notProven) : null,
    tone: content.notProven > 0 ? 'open' : undefined,
    title: 'What no result on this page proves',
  });
  if (content.acceptance && content.acceptance > 0) {
    out.push({ key: 'acceptance', target: ids.acceptance, label: 'Acceptance checks', count: n(content.acceptance), title: 'How a business tester checks each rule, without ABAP' });
  }
  if (content.developers) out.push({ key: 'developers', target: ids.developers, label: 'For developers', title: 'Test code, run output and the checks of the suite' });
  return out;
}

/* ----------------------------------------------------------------- Delivery */

export function deliveryAnchors(content: {
  stillNeeded: number;
  artefacts: number;
  /** The audit pack's state word ("Available", "Not available"); null hides the anchor. */
  pack: string | null;
  /** The stakeholder slides are drawn. */
  slides: boolean;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.delivery;
  const out: PageAnchor[] = [
    { key: 'chain', target: ids.chain, label: 'Evidence chain', title: 'Requirement → decision → receipt → artefact' },
    { key: 'needed', target: ids.needed, label: 'Still needed', count: content.stillNeeded > 0 ? n(content.stillNeeded) : 'none', title: 'What a real handover still needs' },
    { key: 'artefacts', target: ids.artefacts, label: 'Artefacts', count: content.artefacts > 0 ? n(content.artefacts) : null, title: 'What leaves with the package — not signed' },
  ];
  if (content.pack !== null) out.push({ key: 'pack', target: ids.pack, label: 'Audit pack', count: content.pack.toLowerCase(), title: 'The one artefact the server signs' });
  if (content.slides) out.push({ key: 'slides', target: ids.slides, label: 'Stakeholder slides', title: 'The deck built from the signed run' });
  return out;
}

/* ------------------------------------------------------------ Documentation */

/**
 * The AI-generated proposals of the Documentation stage — the business SOP and the
 * RACI — as a chapter of its bar (owner 16.10.2026). The seven chapters are
 * the description's (`documentOutline`); the proposals card stands after the
 * open questions and before the appendix, so it is named there. Without its
 * own anchor, a reader in the RACI saw "Open questions" marked: the scroll
 * spy kept the last section it had passed.
 */
export const DOCUMENTATION_PROPOSALS_ID = 'model-proposals';

export function documentationProposalsAnchor(content: {
  /** Business steps of the SOP on record; null while none is. */
  steps: number | null;
}): PageAnchor {
  return {
    key: 'proposals',
    target: DOCUMENTATION_PROPOSALS_ID,
    label: 'SOP & RACI',
    count: content.steps && content.steps > 0 ? n(content.steps) : null,
    title: 'Who does what, who is accountable — an AI-generated draft',
  };
}

/* ------------------------------------------------------------ the scroll spy */

/** Where a named section stands, as the bar measures it (viewport pixels). */
export interface AnchorRect {
  key: string;
  top: number;
  bottom: number;
  left: number;
}

/**
 * How far below the end of a section the reader may be and still be "in" it:
 * the gap between two sections. Further down, they are in something the bar
 * does not name — and nothing is marked, rather than the last section passed.
 */
export const ANCHOR_GAP_PX = 96;

/**
 * The section the bar marks: the one the reading line runs through (the main
 * column's — the one furthest left — where two do); in the gap after a
 * section, that section; below a section by more than the gap — inside a part
 * of the page the bar does not name — none. Before the first section, none.
 * Pure, so the rule can be held without a browser.
 */
export function currentAnchorKey(rects: readonly AnchorRect[], line: number, gap: number = ANCHOR_GAP_PX): string | null {
  let at: { key: string; left: number } | null = null;
  let passed: AnchorRect | null = null;
  for (const r of rects) {
    if (r.top > line) continue;
    if (!passed || r.top >= passed.top) passed = r;
    if (r.bottom > line && (!at || r.left < at.left)) at = { key: r.key, left: r.left };
  }
  if (at) return at.key;
  return passed && line - passed.bottom <= gap ? passed.key : null;
}
