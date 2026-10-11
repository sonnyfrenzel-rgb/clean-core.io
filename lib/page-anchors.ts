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
}

/**
 * The section ids each tool's bar may name. A guard reads these and finds each
 * one as an `id="…"` in the files that render the tool.
 */
export const PAGE_ANCHOR_IDS = {
  analyze: {
    score: 'analyze-score',
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
    write: 'testing-write',
    run: 'testing-verified',
    sapResult: 'testing-sap-result',
    hand: 'testing-hand',
    scenarios: 'testing-scenarios',
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
 * Analyze: the score, Look here first, Where in the program, Findings by kind,
 * then the two folds below the findings. The side column (route, not
 * determined) is beside the findings and needs no jump.
 */
export function analyzeAnchors(content: {
  /** The signed Clean Core Score, or null where none was computed. */
  score: number | null;
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
  const out: PageAnchor[] = [
    { key: 'score', target: ids.score, label: 'Clean Core Score', count: content.score === null ? null : n(content.score), title: 'How far is this code from clean core?' },
  ];
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
  /** Scenarios written — "Scenarios" is drawn only once there are any. */
  scenarios: number;
  /** Hand checks listed under step 3; null where no source was read. */
  handChecks: number | null;
  /** The ABAP Cloud route's "Record the result from your SAP system" is drawn. */
  sapResult: boolean;
}): PageAnchor[] {
  const ids = PAGE_ANCHOR_IDS.testing;
  const out: PageAnchor[] = [
    { key: 'write', target: ids.write, label: 'Write', title: 'Step 1 — write the scenarios' },
    { key: 'run', target: ids.run, label: 'Run', title: 'Step 2 — run them' },
  ];
  if (content.sapResult) out.push({ key: 'sap-result', target: ids.sapResult, label: 'Your SAP result', title: 'The result from your own SAP system' });
  out.push({
    key: 'hand',
    target: ids.hand,
    label: 'Check by hand',
    count: content.handChecks === null ? null : content.handChecks > 0 ? n(content.handChecks) : 'none',
    title: 'Step 3 — what no generated test covers',
  });
  if (content.scenarios > 0) out.push({ key: 'scenarios', target: ids.scenarios, label: 'Scenarios', count: n(content.scenarios), title: 'Every scenario, one row each' });
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
