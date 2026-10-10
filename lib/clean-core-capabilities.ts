/**
 * What Clean-Core.io actually does, stated concretely enough to be judged.
 *
 * Each capability carries what it produces, what it saves, what it costs in effort
 * and quota, and where it stops. That last field is the important one: the
 * governing principle of the project is "proven, not claimed" — and a capability list without limits is a claim.
 */

import { BTP_FIRST } from './sap-naming';
import { TRUST_CLAIMS } from './trust-claims';

/**
 * The trust card's training sentence, word for word: Google's training terms
 * depend on the key that makes the request, and the privacy policy promises
 * no training only for the community key (codex code-public-01).
 */
export const TRAINING_CLAIM = TRUST_CLAIMS.find((c) => c.id === 'training')!.text;

export interface Capability {
  stage: string;
  title: string;
  /** What the reader gets, in concrete artefacts. */
  output: string;
  benefit: string;
  effort: string;
  /** What it does NOT do. Stated as plainly as the benefit. */
  limit: string;
}

/**
 * The 3.0 chain, one card per step (roadmap 3.0.8): the process and the levels
 * in Analyze, the decision in the Management view, then the tools that carry
 * the same evidence on. `stage` is the place in the workspace where the step
 * happens — a tool of the tool bar, or the view. No duration is stated: none is
 * measured. What a step costs follows the metering: the analysis runs are
 * counted once per signed run (`app/api/gemini/route.ts`); Design's cost is
 * `DESIGN_ON_OPEN_COST` (`lib/model-stages.ts`).
 */
export const CAPABILITIES: Capability[] = [
  {
    stage: 'Analyze',
    title: 'The process, read from the code, and Level A–D',
    output:
      'The business process the program runs, drawn as BPMN with a line anchor on every element or the reason it has none; the business rules hard-coded in it, each with its line; the Level A–D of every SAP object the code uses; the findings at their lines and the Clean Core Score — sealed as a signed, immutable run.',
    benefit:
      'Replaces "we think this program is risky" with statements somebody can check against the lines they came from. A deterministic engine reads the source before any language model does, so the evidence does not depend on a model.',
    effort:
      'One of the five analysis runs of an account — except the starter examples, which are free the first time each one runs; starting the same example again is an ordinary analysis, and a run is only counted once it completes. After the five, you continue with your own Gemini API key.',
    limit:
      'Level A–D is Clean-Core.io’s reading of SAP’s published data — an orientation, not an ATC result, and not part of the signed audit pack. What the engine could not determine is listed as not determined. Confirm with SAP ADT and ATC for your target release.',
  },
  {
    stage: 'Management view',
    title: 'The decision: keep, rebuild, move to SAP standard or retire',
    output:
      'One question about the program, with what the answer rests on — the need, the options, the costs as a simulation, the architecture — and what still blocks it.',
    benefit:
      'The decision is taken on the evidence of the run, and what it rests on stays visible to whoever reads the project later.',
    effort: 'The signed-in account records the decision, in the Management view.',
    limit:
      'Clean-Core.io prepares the decision; it does not take it. A recorded decision is a self-declaration, not a mandate, and it does not know your organisation’s platform strategy, licensing or team skills.',
  },
  {
    stage: 'Design',
    title: 'Requirements and a target design',
    output:
      `Functional requirements read from the code, each with its lines and acceptance criteria, questions for the business apart, and a target design for the route — ABAP Cloud (RAP) in SAP S/4HANA, or CAP on ${BTP_FIRST} — with released SAP APIs proposed in place of direct table access.`,
    benefit:
      'Turns "use released APIs" into named successors for the objects your code actually uses, and requirements that can be traced to the line they came from.',
    effort:
      'Opening Design writes the solution design with the model — two calls, not counted against your analysis runs. The functional requirements come from the code, without a model.',
    limit:
      'The design is a Model proposal until you record the target you accept. Where SAP names no released successor, it says so rather than inventing one.',
  },
  {
    stage: 'Transformation',
    title: 'A code draft',
    output:
      'A RAP or CAP implementation generated from the source, the analysis and the design, shown beside the original; its plan names every finding at its line.',
    benefit:
      'A first draft to review statement by statement instead of a black box.',
    effort: 'A model call on the community key or your own key; not counted against your analysis runs.',
    limit:
      'A draft for an architect to review, not a deployment artefact. It is generated by a third-party language model and provided as-is. Nothing here removes the need for an expert to read it.',
  },
  {
    stage: 'Testing',
    title: 'Test scenarios, and where they ran',
    output: 'Test scenarios for the generated code, each with what it was derived from, checked against the source: for CAP, run against mocks in an isolated test runner with per-case results; for ABAP Cloud, ABAP Unit classes that run only in your own system and are never run here; their result is recorded from that system, as an imported file or your own confirmation, never as proven. Tests against a connected tenant are locked.',
    benefit:
      'The draft arrives with tests attached, so the review has something to run rather than only something to read.',
    effort: 'A model call on the community key or your own key; not counted against your analysis runs.',
    limit:
      'Tests are generated from the code, so they encode its behaviour — including any bug it already had. They verify the transformation, not the original business requirement.',
  },
  {
    stage: 'Documentation',
    title: 'A process description',
    output:
      'A process description a successor can read — purpose and scope, trigger and inputs, the process, decision points and business rules, exceptions, effects, controls and open questions, with the technical trace as an appendix — exported as Confluence HTML, Markdown or Word. The process leaves as a BPMN 2.0 XML file; import into SAP Signavio has not been verified yet.',
    benefit:
      'The documentation that normally never gets written, built from the engine’s reading of the code rather than as a separate project.',
    effort: 'Built from the engine when the tool opens.',
    limit: 'Written from the code. It describes what the program does, not why the business wanted it.',
  },
  {
    stage: 'Economics',
    title: 'Costs, as a simulation',
    output: 'A comparison of the options on assumptions you enter, stored with their revision.',
    benefit: 'The cost side of the decision on your own figures, next to the evidence it belongs to.',
    effort: 'Four guided steps on your own figures.',
    limit: 'A simulation on your assumptions, never a quote. No cost figure is derived from the Clean Core Score.',
  },
  {
    stage: 'Delivery',
    title: 'Handover and audit pack',
    output:
      'The handover: the evidence chain, an abapGit-compatible package with sources and tests, who confirmed what, and an audit pack signed over the run with HMAC and Ed25519, recording what was analysed, by which engine and catalogue version, and what it concluded.',
    benefit:
      'The package goes into your own Eclipse ADT environment for compilation and verification, and anyone can check the audit pack offline — which is what lets a result hold up in a governance review.',
    effort: 'Included; the pack is signed by the server.',
    limit:
      'A signature proves where a result came from and that it has not changed since. It does not certify that the conclusion is correct — that is what your architect is for.',
  },
];

/** Deliberate boundaries. Stated up front, not buried in a disclaimer. */
export const HONEST_SCOPE: { claim: string; reality: string }[] = [
  {
    claim: 'Is this a code translator?',
    reality:
      'No. It is an evidence-first accelerator. The generated code matters less than the evidence and the reasoning that led to it.',
  },
  {
    claim: 'Does it replace architecture governance?',
    reality:
      'No. It does not replace enterprise-architecture approval, SAP release checks, privacy review, penetration testing, or production migration governance.',
  },
  {
    claim: 'Can I deploy the output to production?',
    reality:
      'Not directly. Every artefact is a draft for expert evaluation. Review, test and approve it with a qualified SAP architect first.',
  },
  {
    claim: 'What happens to my source code?',
    reality:
      `It is read by the deterministic engine first; the Google Gemini API processes it for the steps a language model writes. ${TRAINING_CLAIM} Your profile and your projects are stored in the EU (Firestore, europe-west1, Belgium); sign-in runs on Firebase Authentication, which is not tied to a region. Bring your own Gemini key and it is used exclusively through a server-side proxy, encrypted at rest with AES-256-GCM, never exposed to the browser.`,
  },
  {
    claim: 'What does it cost?',
    reality:
      'Nothing. Clean-Core.io is a free community project with no paid tier, and it accepts no payment. An account has five analysis runs, and each starter example is free the first time it runs; after that you continue with your own Gemini API key, which Google bills under your own agreement with Google.',
  },
];
