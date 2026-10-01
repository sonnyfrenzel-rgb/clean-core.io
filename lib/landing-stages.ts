import type { ProvenanceValue } from './provenance';
import { PHASES, type PhaseKey } from './workflow-steps';

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
  /** What the picture from the demo project shows, for the `alt` text. */
  shows: string;
}

export const LANDING_STAGE_TEXT: Readonly<Record<PhaseKey, LandingStageText>> = {
  analyze: {
    lines: [
      'A deterministic engine reads the ABAP before any model does: every finding with its line, the Clean Core Score and a recommended extensibility route.',
      'The result is recorded as a signed run, and every later stage builds on it.',
    ],
    worker: 'engine',
    provenance: ['proven'],
    shows: 'the Clean Core Score, the source, what the engine did not judge, and the first findings with their lines',
  },
  design: {
    lines: [
      'A model drafts the target architecture for the route on the project: RAP inside SAP S/4HANA or CAP on SAP BTP.',
      'You review the draft and record which target you accept — a self-declaration, not a mandate.',
    ],
    worker: 'model',
    provenance: ['proposed', 'confirmed'],
    shows: 'the route proposed from the evidence and the decision checkpoints behind it',
  },
  transformation: {
    lines: [
      'A model generates the target code from the source, the analysis and the design: ABAP Cloud artefacts on the RAP track, a Node.js project on the CAP track.',
      'Nothing compiles or tests it in this stage; it is a draft you review.',
    ],
    worker: 'model',
    provenance: ['proposed'],
    shows: 'the plan the engine writes on its own — one line per finding, with its route and the released successor where the catalog names one',
  },
  documentation: {
    lines: [
      'The process documentation is read out of the analysed source, every statement with its lines; what the code does not say is listed as not determined.',
      'A business layer with SOPs and a RACI matrix is a model draft, written only when you ask for it.',
    ],
    worker: 'engine',
    provenance: ['reconstructed', 'proposed'],
    shows: 'the tables the program reads or writes, SAP standard or custom, each with a risk',
  },
  testing: {
    lines: [
      'A model writes a test suite for the generated code; on the CAP track the suite can be run against mocks in an isolated test runner.',
      'On the RAP track the ABAP Unit run is only simulated, and a pass never means the code works in SAP.',
    ],
    worker: 'model',
    provenance: ['proposed', 'demonstrated-mock'],
    shows: 'that nothing has run in the demo, and the constructs a tester would have to check by hand, with their lines',
  },
  tco: {
    lines: [
      'A demonstration model prices the upgrade effort with cost figures you enter, on assumed coefficients.',
      'It is not a business case, and it shows no forecast until your own figures are in.',
    ],
    worker: 'engine',
    provenance: ['simulation'],
    shows: 'assumptions entered by hand and the maintenance-effort scenario computed from them',
  },
  delivery: {
    lines: [
      'Delivery offers the delivery bundle and the audit pack the server signs over the signed run, both blocked while anything was built for a previous source.',
      'A pack can be checked on the Verify Pack page; whether to deploy stays an architect’s decision.',
    ],
    worker: 'engine',
    provenance: ['proven'],
    shows: 'that no pack leaves the demo, and what a real handover would still need',
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
