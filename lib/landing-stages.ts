import type { ProvenanceValue } from './provenance';
import { PHASES, type PhaseKey } from './workflow-steps';
import { BTP_FIRST } from './sap-naming';

/**
 * The seven stages as the landing page's timeline shows them — roadmap 3.0.6
 * (Sonny, 24.09.2026: a timeline with a detail panel, a real picture per stage
 * and a provenance chip).
 *
 * Order, count and names are `PHASES`; nothing here repeats them. What lives
 * here is the short version of each stage — two sentences, cut down from
 * `lib/how-to-content.ts` and held to the same rule: say less rather than say it
 * more nicely — and **who does the work**:
 *
 *   - `worker` — the deterministic engine, or a model whose draft a person
 *     decides on. Economics is a calculation on figures you enter, not a
 *     language model, so it is the engine's.
 *   - `provenance` — the values of `lib/provenance.ts` that the stage's output
 *     carries in the product. No label of its own: the chip reads the word from
 *     that list. The first value is what the stage is about; a second one names
 *     the other half where a stage has two (Design: the model proposes, the
 *     account confirms).
 *
 * Keyed by `PhaseKey`, so a stage added to `PHASES` without an entry here does
 * not compile. Client-safe: pure data.
 */

export type StageWorker = 'engine' | 'model';

/** How the timeline says who does the work. Two sentences' worth of vocabulary, not a badge. */
export const STAGE_WORKER_LABEL: Readonly<Record<StageWorker, string>> = {
  engine: 'Done by the deterministic engine',
  model: 'Drafted by a model — a person decides',
};

export interface LandingStageText {
  /** Two short sentences. */
  lines: readonly [string, string];
  worker: StageWorker;
  provenance: readonly ProvenanceValue[];
  /** What the stage's picture shows (`lib/landing-shots.ts`), for the `alt` text. */
  shows: string;
}

export const LANDING_STAGE_TEXT: Readonly<Record<PhaseKey, LandingStageText>> = {
  analyze: {
    lines: [
      'A deterministic engine reads the ABAP before any model does: every finding at its line, a map of where in the program they sit, and the Clean Core Score on a scale that says what the number means and what moved it.',
      'The result is recorded as a signed run, the extensibility route follows from fixed rules, and every later stage builds on it.',
    ],
    worker: 'engine',
    provenance: ['proven'],
    shows: 'the findings at a glance, the Clean Core Score on its scale with what it means, and the extensibility route the fixed rules recommend',
  },
  design: {
    lines: [
      `The target architecture as a canvas, drawn from the run: what stays inside SAP S/4HANA behind the clean core boundary, which released API replaces which lines, what has no released successor, and on the side-by-side track what runs on ${BTP_FIRST}.`,
      'A model writes the design document beside it when the stage opens; you record which target you accept — a self-declaration, not a mandate.',
    ],
    worker: 'model',
    provenance: ['reconstructed', 'proposed', 'confirmed'],
    shows: 'the target architecture canvas with the released successors and their lines, and the decision panel with the recommended route and the alternatives',
  },
  transformation: {
    lines: [
      'A model generates the target code from the source, the analysis and the design: ABAP Cloud artefacts on the RAP track, a Node.js project on the CAP track. Beside it, the engine’s plan shows where every finding goes.',
      'Nothing compiles or tests it in this stage; it is a draft you review.',
    ],
    worker: 'model',
    provenance: ['proposed'],
    shows: 'the plan the engine writes on its own — every kind of finding flowing to its target, a released successor where the catalog names one — and where the demo stops because it makes no model call',
  },
  documentation: {
    lines: [
      'When the stage opens, the analysed source is written up as a process description a successor can read — purpose and scope, trigger and inputs, the process with its map, decision points and business rules, exceptions, outputs and open questions — every step with its line, the technical trace as an appendix.',
      'It exports to Confluence, Markdown and Word; a business layer with SOPs and a RACI matrix is a model draft, written only when you ask for it.',
    ],
    worker: 'engine',
    provenance: ['reconstructed', 'proposed'],
    shows: 'what the process does for the business — its hard-coded rules and early ends with their lines — above the process map read from the code beside its first chapter',
  },
  testing: {
    lines: [
      'A model writes test scenarios for the generated code; on the CAP track they run against mocks in an isolated test runner, never on your system. The engine lists what a tester has to check by hand, with the lines.',
      'On the RAP track the scenarios are an ABAP Unit class that runs only in your own system: you upload its result file or confirm the result yourself, marked as imported or self-declared, never as proven. A pass against mocks never means the code works in SAP.',
    ],
    worker: 'model',
    provenance: ['proposed', 'demonstrated-mock', 'imported', 'confirmed'],
    shows: 'that nothing has run in the demo, where each kind of test runs — against mocks here on the CAP route, ABAP Unit only in your own SAP system — and the areas a tester checks by hand with their lines',
  },
  tco: {
    lines: [
      'A demonstration model compares doing nothing, keeping the code and moving to SAP standard on cost figures you enter and assumed coefficients, and lists every input still open.',
      'It is not a business case, and it shows no forecast until your own figures are in.',
    ],
    worker: 'engine',
    provenance: ['simulation'],
    shows: 'the four steps to a scenario all done: the codebase measured by the engine run and the day rates entered by hand',
  },
  delivery: {
    lines: [
      'Delivery shows the chain from requirement to decision, receipt and artefact, what a handover still needs, and the audit pack the server signs over the signed run — blocked while anything was built for a previous source.',
      'A pack can be checked on the Verify Pack page; whether to deploy stays an architect’s decision.',
    ],
    worker: 'engine',
    provenance: ['proven'],
    shows: 'a signed run with its audit pack available, the evidence chain from requirement to handover, and the next step the rules name',
  },
};

export interface LandingStage extends LandingStageText {
  n: number;
  key: PhaseKey;
  title: string;
}

/** The stages in the product's order, with the words for each. */
export function landingStages(): LandingStage[] {
  return PHASES.map((p) => ({ n: p.n, key: p.key, title: p.label, ...LANDING_STAGE_TEXT[p.key] }));
}
