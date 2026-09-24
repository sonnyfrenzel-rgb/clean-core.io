import { DEMO_ROUTE } from './demo-marks';
import { LIVE_TEST_EXECUTION } from './locked-paths';
import { PHASES, type PhaseKey } from './workflow-steps';

/**
 * What `/how-to` says about each phase — and nothing it says about a phase
 * lives anywhere else.
 *
 * Roadmap 0.2, UX-102. The page kept two copies of a phase list of its own: one
 * in `app/(app)/how-to/page.tsx` for the `HowTo` JSON-LD that search engines
 * read, one in `components/HowToClient.tsx` for the walkthrough. Both had six
 * phases where the product has seven (Economics was missing), put Testing before
 * Documentation, and described a product that turns ABAP into "Node.js CAP
 * TypeScript services" — on a product whose in-app track generates RAP
 * artefacts, the same untruth UX-037 took off the Transformation stage. Neither
 * copy could be corrected into agreement with the other, because nothing tied
 * either of them to `PHASES`.
 *
 * So the order, the count and the titles come from `PHASES` in
 * `lib/workflow-steps.ts`, and only the words come from here, keyed by
 * `PhaseKey`. A phase added there without text here does not compile, and
 * `tests/how-to-phases-guard.spec.ts` reads the rendered page to make sure the
 * page actually uses this.
 *
 * The rule for the words is the one 0.2 applies everywhere: say less rather
 * than say it more nicely. Every sentence below was checked against what the
 * stage page under `app/(app)/project/[projectId]/` does today. Where the
 * product has two tracks, a sentence either holds for both or names the one it
 * is about — "RAP track" and "CAP track", the names the Transformation stage
 * logs. What the old walkthrough said and nothing bears out (a scroll-synced
 * line-by-line mapping, an ISO 9001-compliant export, "SAP Verified Strategy",
 * destinations and XSUAA the product never configures) was removed, not
 * reworded.
 *
 * Client-safe: the walkthrough is a client component and imports this.
 */

export interface HowToQuestion {
  question: string;
  answer: string;
}

export interface PhaseHowTo {
  /** What the phase does, in a sentence or two. The JSON-LD step text and the line in the phase index. */
  summary: string;
  /** The rest of what the slide says. */
  details: readonly string[];
  /** Questions a reader has at this phase, answered only as far as the product bears the answer out. */
  questions: readonly HowToQuestion[];
}

/** The page's own description: meta, Open Graph, JSON-LD and the lead under the title. */
export const HOW_TO_DESCRIPTION =
  'How custom ABAP moves through the phases of Clean-Core.io, from the analysis of the source to the handover of what is on record, on the in-app RAP track or the side-by-side CAP track on SAP BTP.';

export const HOW_TO_PHASE_CONTENT: Readonly<Record<PhaseKey, PhaseHowTo>> = {
  analyze: {
    summary:
      'Stage an ABAP source (your own file or a starter example), choose the target deployment and run the analysis. A deterministic engine reads the code before any model does, and the result is recorded as a signed run.',
    details: [
      'The engine reports each finding with its line in the source, computes the Clean Core Score and recommends an extensibility route: in-app ABAP Cloud (RAP) or side-by-side on SAP BTP (CAP).',
      'You can switch the route, and the later phases follow the route on the project.',
      'If a model is available, it adds a narrative report; without one, the run is signed over the evidence alone.',
      'Every later phase opens only once a signed run exists.',
    ],
    questions: [
      {
        question: 'Which files can I upload?',
        answer:
          'Files ending in .abap or .txt, up to 1 MB. The text has to look like ABAP, and it is scanned for script or shell injection payloads and plaintext secrets before the analysis starts.',
      },
      {
        question: 'Does the analysis need a model?',
        answer:
          'No. The findings, the extensibility route and the Clean Core Score are computed without a model, and a run without a model is signed like any other.',
      },
      {
        question: 'What does the signed run record?',
        answer:
          'Which account analysed which source, when, with which engine and catalog version, and what the engine found. It records the analysis; it does not approve the recommendation.',
      },
    ],
  },
  design: {
    summary: 'A model drafts the target architecture for the route on the project, and you record which target you accept.',
    details: [
      'On the RAP track the draft is a RAP design inside SAP S/4HANA; on the CAP track it is a SAP CAP design on SAP BTP.',
      'It covers the project structure, service endpoints, data consistency, security requirements and a phased roadmap.',
      'The draft is model output. Review it before you accept it.',
      'Accepting records the target, your account and the time on the server: a self-declaration, not a mandate.',
    ],
    questions: [
      {
        question: 'Which targets can I choose?',
        answer:
          'You can confirm the recommended target, or pick another of the five (developer extensibility with RAP, side-by-side with CAP, SAP Integration Suite, SAP Event Mesh or retirement) and give your reason in writing.',
      },
      {
        question: 'What happens when the source changes?',
        answer:
          'A design or an acceptance given for a previous source is marked stale, and code is not generated from it until the design is regenerated and the target confirmed again.',
      },
      {
        question: 'Can I take the design with me?',
        answer: 'Yes, as an HTML document.',
      },
    ],
  },
  transformation: {
    summary:
      'A model generates the target code from the source, the analysis and the design: ABAP Cloud artefacts on the RAP track, a Node.js (TypeScript) project on the CAP track.',
    details: [
      'The legacy source and the generated files are shown side by side, with their scrolling kept in step.',
      'Generation needs the analysis and a design, and it does not start from a design or an acceptance given for a previous source.',
      'The generated code is not compiled or tested in this phase.',
    ],
    questions: [
      {
        question: 'Which track does it generate for?',
        answer:
          'The route on the project. On the RAP track the model is asked for ABAP Cloud artefacts in abapGit file layout; on the CAP track it is asked for a Node.js (TypeScript) project.',
      },
      {
        question: 'Is the generated code ready to deploy?',
        answer:
          'No. It is model output that nothing has compiled or tested at this point, and whether to deploy remains an architect’s decision.',
      },
      {
        question: 'What if the model returns nothing usable?',
        answer: 'Nothing is saved, and the previous version stays as it was.',
      },
    ],
  },
  documentation: {
    summary:
      'The process documentation is read out of the whole analysed source — the process element by element, what each part does, the update task and the lanes the code proves, every statement with its lines — and, when you ask for it, a model writes a business layer with SOPs, a RACI matrix and control checkpoints.',
    details: [
      'The process can be exported as BPMN 2.0 XML and the documentation as Confluence HTML.',
      'An owner, the roles, performance indicators or durations are not in the source, so the documentation lists them as not determined instead of filling them in.',
      'The business layer can be generated once the documentation exists. It is model output, not a reading of the code.',
    ],
    questions: [
      {
        question: 'Who is the business layer written for?',
        answer:
          'Process owners, compliance and internal audit. The model is instructed to assign business roles in the RACI matrix, not IT roles.',
      },
      {
        question: 'What is in the BPMN file?',
        answer: 'The generated flow as BPMN 2.0 XML: its events, tasks, gateways and sequence flows, with a diagram layout.',
      },
    ],
  },
  testing: {
    summary:
      'A model writes a test suite for the generated code. On the CAP track the suite can be run against mocks in a restricted Node.js test runner; on the RAP track the ABAP Unit run is only simulated.',
    details: [
      'Verdicts are shown on screen and are not stored with the project.',
      'The coverage figure is the test generator’s own estimate, not a measurement.',
      LIVE_TEST_EXECUTION.userNotice,
      'The suite can be exported to Excel.',
    ],
    questions: [
      {
        question: 'Is the test runner a sandbox?',
        answer:
          'On the CAP track the tests run in a Node.js child process with guards around it: defence in depth, not an isolation boundary.',
      },
      {
        question: 'Can the tests use my own tenant?',
        answer:
          'Running generated tests against a connected tenant is locked. Generated test code is untrusted, and with tenant credentials in the runner a test could send them anywhere its guards miss.',
      },
      {
        question: 'Does a pass mean the code works in SAP?',
        answer:
          'No. A pass means a generated test passed against mocks, and a simulated ABAP Unit result means nothing was executed.',
      },
    ],
  },
  tco: {
    summary:
      'A demonstration model prices the upgrade effort with cost figures you enter, on assumed coefficients. It is not a business case.',
    details: [
      'It starts from the Clean Core Score of the signed run and models nothing without one.',
      'It has no default cost figures: until you enter your own, it names what is missing and shows no forecast.',
      'Nothing you enter is stored, so a reload starts over.',
      'This phase is never marked complete.',
    ],
    questions: [
      {
        question: 'Why is Economics never marked complete?',
        answer: 'It runs on assumed effort coefficients, not on costs anybody observed.',
      },
      {
        question: 'Does the analysis put a price on my code?',
        answer:
          'No. Money figures appear only in this phase, computed from the rates and the investment you enter on assumed coefficients.',
      },
    ],
  },
  delivery: {
    summary:
      'Delivery lists what is on record for handover and offers the delivery bundle and the signed audit pack for download, both blocked while anything was built for a previous source.',
    details: [
      'The delivery bundle is a ZIP with the generated files, the test suite and the documentation.',
      'The audit pack is signed by the server over the signed run; what the user attested sits in a file the signature does not cover.',
      'A pack can be checked on the Verify Pack page.',
      'A slide deck for stakeholders summarises the findings and the architecture, without a savings figure.',
    ],
    questions: [
      {
        question: 'When is Delivery marked ready?',
        answer:
          'When generated code, documentation and a test run in which every case passed are on record. Whether to deploy remains an architect’s decision.',
      },
      {
        question: 'What is in the audit pack?',
        answer:
          'An executive summary, the input fingerprint and input manifest, the decision record, the findings, a model card and the known limitations, with a signed manifest.',
      },
    ],
  },
};

export interface HowToStep extends PhaseHowTo {
  /** 1-based position, from `PHASES`. */
  n: number;
  key: PhaseKey;
  /** The phase's label in the product, from `PHASES`. */
  title: string;
  /** The same phase in the demo project, which needs no account. */
  demoHref: string;
}

/** The phases in the product's order, with the words for each. */
export function howToSteps(): HowToStep[] {
  return PHASES.map((phase) => ({
    n: phase.n,
    key: phase.key,
    title: phase.label,
    demoHref: `${DEMO_ROUTE}/${phase.key}`,
    ...HOW_TO_PHASE_CONTENT[phase.key],
  }));
}
