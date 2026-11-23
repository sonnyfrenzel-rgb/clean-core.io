import demoRelease from '@/lib/demo-release.json';
import { landingProcess, type LandingNode } from '@/lib/landing-process';
import { getObjectDimensions } from '@/lib/abap/catalog-service';

/**
 * What the landing page (roadmap row 3.5.0, item 7) reads from the engine, so
 * nothing on it is typed that the engine could say.
 *
 * The hero (owner decision O1 = B, 13.11.2026) shows the main flow of the
 * shipped demo program being built: every step first carries the name the code
 * gives it, then the business name the engine writes. Both come out of the same
 * call the BPMN export makes (`landingProcess`, technical and plain names), so
 * the swap can never claim more than the release's engine says. A step whose
 * engine name already equals its business name does not swap.
 *
 * Server only: reads the example file.
 */

export interface HeroStep {
  id: string;
  kind: 'start' | 'step' | 'decision' | 'end';
  /** The name the code gives the element — a routine, an event or a condition. */
  technical: string;
  /** The business name the engine writes for it (`lib/abap/plain-language.ts`, no model). */
  plain: string;
  line: number;
  /** Hidden on a phone, where a "more steps" line stands for it. */
  wideOnly: boolean;
}

export interface HeroBuild {
  program: string;
  /** Every step of the main flow, events and decisions not counted. */
  totalSteps: number;
  /** The steps the hero shows. */
  shownSteps: number;
  /** How many steps a phone leaves out between the first and the decision step. */
  hiddenOnPhone: number;
  elements: HeroStep[];
}

const isStep = (n: LandingNode) => n.tag === 'task' || n.tag === 'subProcess' || n.tag === 'callActivity';

/**
 * A step that only reads or writes data carries no decision of its own; the
 * hero shows the steps that check, decide and act. A rule over the engine's
 * own routine names, not a list of hand-picked labels.
 */
const onlyMovesData = (technical: string) => /^(READ|WRITE|UPLOAD)_/.test(technical);

export function heroBuild(fileName: string, program: string): HeroBuild {
  const technical = landingProcess(fileName, program, 'technical').planes[0];
  const plain = landingProcess(fileName, program, 'plain').planes[0];
  const plainName = new Map(plain.nodes.map((n) => [n.id, n.name]));
  const byLine = (a: LandingNode, b: LandingNode) => (a.anchor?.lineStart ?? 0) - (b.anchor?.lineStart ?? 0) || a.box.x - b.box.x;
  const nodes = technical.nodes.filter((n) => n.anchor && n.tag !== 'boundaryEvent').sort(byLine);

  const steps = nodes.filter(isStep);
  const shown = steps.filter((n) => !onlyMovesData(n.name));
  // The decision the hero names: the last one that follows a shown step
  // directly, before the steps that act on the outcome.
  const lastShown = shown[shown.length - 1];
  const keyDecision = [...nodes].reverse().find(
    (n) => n.tag === 'exclusiveGateway' && shown.some((s, i) => i > 0 && i < shown.length - 1 && n.anchor!.lineStart === s.anchor!.lineStart + 1),
  );
  const start = nodes.find((n) => n.tag === 'startEvent');
  const end = [...nodes].reverse().find((n) => n.tag === 'endEvent');

  const el = (n: LandingNode, kind: HeroStep['kind'], wideOnly = false): HeroStep => ({
    id: n.id,
    kind,
    technical: n.name,
    plain: plainName.get(n.id) ?? n.name,
    line: n.anchor!.lineStart,
    wideOnly,
  });

  const decisionStep = keyDecision ? shown.findIndex((s) => s.anchor!.lineStart + 1 === keyDecision.anchor!.lineStart) : -1;
  const elements: HeroStep[] = [];
  if (start) elements.push(el(start, 'start'));
  shown.forEach((s, i) => {
    elements.push(el(s, 'step', i > 0 && decisionStep > 0 && i < decisionStep));
    if (i === decisionStep && keyDecision) elements.push(el(keyDecision, 'decision'));
  });
  if (end && end !== lastShown) elements.push(el(end, 'end'));

  const firstLine = shown[0]?.anchor?.lineStart ?? 0;
  const decisionLine = decisionStep > 0 ? shown[decisionStep].anchor!.lineStart : firstLine;
  return {
    program,
    totalSteps: steps.length,
    shownSteps: shown.length,
    hiddenOnPhone: steps.filter((s) => s.anchor!.lineStart > firstLine && s.anchor!.lineStart < decisionLine).length,
    elements,
  };
}

/**
 * The figures of the demo program as the release regenerated them
 * (`lib/demo-release.json`, held by `tests/demo-release-guard.spec.ts`).
 */
export const DEMO_FIGURES = demoRelease.figures;

/**
 * The business sentence for each rule the hero names (`pickHeroRules`, held by
 * `tests/landing-hero-rules.spec.ts`), keyed by the condition as the code
 * writes it. The page shows the condition and its line beside the sentence;
 * a rule the engine picks that has no sentence here falls back to the
 * engine's plain phrase.
 */
export const RULE_SENTENCES: Record<string, { text: string; effect: string }> = {
  'lv_dev_pct > 5': { text: 'A price more than 5 % above the agreed price holds the requisition for a buyer.', effect: 'changes the outcome' },
  "gs_eban-werks = '1000'": { text: 'Requisitions for plant 1000 skip the limit check.', effect: 'hard-coded in the program' },
  "gv_emergency = abap_true AND gv_amount <= '50000.00'": { text: 'Emergencies up to 50,000.00 are approved by the department head.', effect: 'decides who approves' },
};

/**
 * The SAP objects of the demo on the A–D ladder, each with the line that uses
 * it. Levels are read from the catalog at render time; the own write to an SAP
 * table is level D by the level concept's own words (writes to SAP tables).
 */
export function demoLadder(): Array<{ level: 'A' | 'B' | 'C' | 'D'; objects: Array<{ label: string; code: string; line: number; source: 'catalog' | 'code' }> }> {
  const graded = [
    { label: '', code: 'BAPI_PO_CREATE1', line: 475 },
    { label: 'Batch input into', code: 'ME21N', line: 515 },
  ].map((o) => ({ ...o, level: getObjectDimensions(o.code).graded.grade, source: 'catalog' as const }));
  const own = { label: 'Direct write to SAP table', code: 'EBAN', line: 240, level: 'D', source: 'code' as const };
  return (['A', 'B', 'C', 'D'] as const).map((level) => ({
    level,
    objects: [...graded, own].filter((o) => o.level === level).map(({ label, code, line, source }) => ({ label, code, line, source })),
  }));
}
