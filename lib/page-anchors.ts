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
 * canvas with its own tabs, and the Management view has none (ADR-087).
 * Economics carries one since it leads with its answer (ADR-128, mock-up E6,
 * amending ADR-091's exemption of the old guided four-step flow).
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
    // In the page's order. `moves` and `touch` are the IT page's (AB-9, `lib/analyze-it.ts`); the demo names the rest.
    moves: 'analyze-moves',
    focus: 'analyze-focus',
    where: 'analyze-where',
    kinds: 'analyze-kinds',
    touch: 'analyze-touch',
    summary: 'analyze-summary',
    detail: 'analyze-technical-detail',
  },
  transformation: {
    flow: 'tf-flow',
    open: 'tf-open',
    package: 'tf-package',
    checks: 'tf-checks',
    trace: 'tf-trace',
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
  economics: {
    range: 'economics-range',
    options: 'economics-compare',
    firm: 'economics-firm',
    effort: 'economics-effort',
    how: 'economics-how',
    model: 'economics-model',
  },
  delivery: {
    open: 'before-go-live',
    package: 'in-the-package',
    proof: 'proof',
    pack: 'audit-pack',
    import: 'import-into-sap',
    timeline: 'timeline',
  },
  /**
   * Design (ADR-130, G12): each view and decision case names its own sections (`designAnchors` in
   * `lib/design-views.ts`), in this order, at most six.
   */
  design: {
    answer: 'design-answer',
    board: 'design-board',
    questions: 'design-questions',
    next: 'design-next',
    canvas: 'design-canvas',
    contract: 'design-contract',
    objects: 'design-objects',
    dependencies: 'design-dependencies',
    notRead: 'design-not-read',
    requirements: 'design-requirements',
  },
} as const;

/** The accessible name of each tool's bar — what a screen reader announces before the links. */
export const PAGE_ANCHOR_LABELS = {
  analyze: 'Sections of Analyze',
  transformation: 'Sections of Transformation',
  testing: 'Sections of Testing',
  economics: 'Sections of Economics',
  delivery: 'Sections of Delivery',
  design: 'Sections of Design',
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

/**
 * Transformation (ADR-129, mock-up T10): Findings · Open · Package · Checks · Trace — the page's five sections in their
 * order. Open counts in amber (it asks the reader for something), and so does a failed check; the package counts its
 * objects once one is stored. The code is in a drawer, not a section, and has no anchor.
 */
export function transformationAnchors(content: {
  findings: number;
  /** Items of "Still open"; 0 says "none". */
  open: number;
  /** Objects of the stored package; null where none is stored (nothing yet, being written, the demo). */
  objects: number | null;
  /** Checks that failed on the stored package. */
  checksFailed: number;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.transformation;
  return [
    { key: 'flow', target: ids.flow, label: 'Findings', count: content.findings > 0 ? n(content.findings) : 'none', title: 'Where each finding went' },
    { key: 'open', target: ids.open, label: 'Open', count: content.open > 0 ? n(content.open) : 'none', title: 'What is still open', ...(content.open > 0 ? { tone: 'open' as const } : {}) },
    { key: 'package', target: ids.package, label: 'Package', count: content.objects ? n(content.objects) : null, title: 'The generated package, by object' },
    {
      key: 'checks',
      target: ids.checks,
      label: 'Checks',
      count: content.checksFailed > 0 ? `${content.checksFailed} failed` : null,
      title: 'Every check, who ran it, and its outcome',
      ...(content.checksFailed > 0 ? { tone: 'open' as const } : {}),
    },
    { key: 'trace', target: ids.trace, label: 'Trace', count: content.findings > 0 ? n(content.findings) : null, title: 'Finding by finding, old lines to new code' },
  ];
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

/* ---------------------------------------------------------------- Economics */

/**
 * Economics (ADR-128, mock-up E6): the range chart, the options, *How firm is the answer?*, the effort in days, how
 * it is calculated, and the model's view — the last only where the analysis wrote one.
 */
export function economicsAnchors(content: {
  /** The model's business value and action plan is on record. */
  model: boolean;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.economics;
  const out: PageAnchor[] = [
    { key: 'range', target: ids.range, label: 'Cost range', title: 'What each choice costs, as a range' },
    { key: 'options', target: ids.options, label: 'Options', title: 'The four answers, with the difference to keeping' },
    { key: 'firm', target: ids.firm, label: 'How firm', title: 'Which of your figures could change the order' },
    { key: 'effort', target: ids.effort, label: 'Effort', title: 'The days behind every amount' },
    { key: 'how', target: ids.how, label: 'Method', title: 'How it is calculated' },
  ];
  if (content.model) out.push({ key: 'model', target: ids.model, label: "Model's view", title: 'Business value and action plan, AI-generated' });
  return out;
}

/* ----------------------------------------------------------------- Delivery */

/**
 * Delivery (ADR-132 L13, the mock-up of 15.11.2026): Before go-live (an amber count while something blocks the
 * handover) · Package · Proof · Audit pack · Import · Timeline. The demo has no import and no timeline: nothing leaves
 * a demo and nothing is recorded in one (L12).
 */
export function deliveryAnchors(content: {
  /** What blocks the handover — the amber count; 0 draws none. */
  blocking: number;
  /** Parts of the package that exist (of six); null in the demo, which makes none. */
  parts: number | null;
  /** The audit pack's state when it needs attention ("check failed", "blocked"); null otherwise. */
  packNote?: string | null;
  /** Dated events in the timeline; null hides Import and Timeline (the demo). */
  events: number | null;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.delivery;
  const out: PageAnchor[] = [
    {
      key: 'open',
      target: ids.open,
      label: 'Before go-live',
      count: content.blocking > 0 ? n(content.blocking) : null,
      tone: content.blocking > 0 ? 'open' : undefined,
      title: 'What blocks the handover, what travels open, what stays yours',
    },
    { key: 'package', target: ids.package, label: 'Package', count: content.parts === null ? null : content.parts > 0 ? n(content.parts) : 'none', title: 'The six parts of the package — not signed' },
    { key: 'proof', target: ids.proof, label: 'Proof', title: 'What is proven, and what is not' },
    { key: 'pack', target: ids.pack, label: 'Audit pack', count: content.packNote ?? null, tone: content.packNote ? 'open' : undefined, title: 'The one file the server signs' },
  ];
  if (content.events !== null) {
    out.push({ key: 'import', target: ids.import, label: 'Import', title: 'Import into SAP with abapGit' });
    out.push({ key: 'timeline', target: ids.timeline, label: 'Timeline', count: content.events > 0 ? n(content.events) : null, title: 'Who did what, when' });
  }
  return out;
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
