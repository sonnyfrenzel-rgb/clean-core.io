import { TRUST_CLAIMS } from '@/lib/trust-claims';
import { SCORE_BANDS } from '@/lib/clean-core-score';

/**
 * The start page's FAQ, once.
 *
 * Three readers take it from here and must not get three answers: the visible
 * accordion on `/`, the `FAQPage` JSON-LD next to it (roadmap 3.0.6: JSON-LD and
 * visible FAQ congruent), and `/llms-full.txt`, which hands the same questions
 * to answer engines as plain text.
 *
 * Written for a reader who lands on one answer and nothing else, which is how
 * a generative answer quotes it: every answer names its subject instead of
 * saying "it", spells out SAP terms at first use, and carries its own limit.
 * Claims about the product read their wording from the module that owns it
 * (`lib/trust-claims.ts`, `lib/clean-core-score.ts`) rather than retyping it.
 */
export interface LandingFaq {
  q: string;
  a: string;
  more?: { href: string; label: string };
  /** Set only for an entry that is not in English. */
  lang?: string;
}

const trust = (id: string) => TRUST_CLAIMS.find((c) => c.id === id)!.text;

/** The band labels as the score page shows them, read from `SCORE_BANDS`. */
const bandLabels = SCORE_BANDS.map((b) => `${b.label} (${b.from}–${b.to})`).join(', ');

export const LANDING_FAQ: LandingFaq[] = [
  {
    q: 'What is SAP clean core?',
    a: 'Clean core keeps the SAP S/4HANA standard unmodified: extensions use only released, upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on SAP Business AI Platform (BAIP, formerly SAP BTP). SAP’s clean core level concept grades what an extension uses from A (released APIs and extension points) to D (not recommended: modifications, implicit enhancements, writes to SAP tables).',
    more: { href: '/clean-core-explained', label: 'Clean core, explained without the jargon' },
  },
  {
    q: 'What does Clean-Core.io do with my ABAP?',
    a: 'A deterministic engine reads the program before any language model does. It reconstructs the business process with a line anchor on every element, or the reason it has none, lists the business rules hard-coded in the program, shows the clean core level of each SAP object the code uses, and names what it could not determine. The same evidence then carries a target design, a transformed code draft and test scenarios — on the CAP track run against mocks in an isolated runner, on the RAP track an ABAP Unit class for your own system — and every completed analysis is sealed as a signed run. The code is a draft you review, and the tests check it against test scenarios, not in your S/4HANA system.',
    more: { href: '/how-it-works', label: 'How it works, and its limits' },
  },
  {
    q: 'How does Clean-Core.io turn ABAP code into a BPMN process?',
    a: 'Clean-Core.io’s deterministic engine reads the ABAP program and reconstructs the business process it runs as a BPMN 2.0 diagram: every task, gateway and event points to the ABAP line it came from, or says why it has none. Business names that a language model suggests are marked as a model proposal. The process can be edited in the built-in BPMN editor; every save is a new revision, and the reconstruction itself is never overwritten.',
    more: { href: '/features/process-blueprints', label: 'Process blueprints' },
  },
  {
    q: 'Is my code used to train models?',
    a: trust('training'),
    more: { href: '/datenschutz#source-code', label: 'Privacy Policy §3' },
  },
  {
    q: 'What does it cost?',
    a: 'Nothing. Clean-Core.io is a free community project with no paid tier, and we accept no payment. An account has five analysis runs; each starter example is free the first time you run it. After that you continue with your own Gemini API key, which Google bills under your own agreement with Google.',
  },
  {
    q: 'Is the generated code ready to go live?',
    a: 'No. The transformed RAP or CAP code from Clean-Core.io is a draft for a person to review. On the CAP track its test scenarios run in an isolated runner against mocks, so they do not show that the code runs in a real SAP S/4HANA system; on the RAP track they are an ABAP Unit class that runs only in your own system, and nothing is run here. A signed run proves where a result came from and that it has not changed since — not that it is correct. What the engine could not determine is listed as not determined rather than guessed.',
    more: { href: '/how-it-works', label: 'How it works, and its limits' },
  },
  {
    q: 'Does it replace ABAP Test Cockpit?',
    a: 'No. ABAP Test Cockpit stays the check to rely on. The level Clean-Core.io shows is its reading of SAP’s published data — an orientation, never part of a signed audit pack. Confirm with ABAP Test Cockpit, and import your ATC results to compare them with the engine.',
  },
  {
    q: 'Does it replace Joule for Developers or SAP’s Custom Code Migration Agent?',
    a: 'No. SAP’s agents work inside your system and tell developers what to fix. Clean-Core.io shows the business what the code does, then carries the same evidence through a design, a code draft and tests to a decision — including whether the program is still needed at all. What stays goes to the developers and their tools, and ABAP Test Cockpit stays the authority.',
  },
  {
    q: 'Does it work with SAP Signavio?',
    a: 'Clean-Core.io exchanges standard BPMN 2.0 XML files: it exports the reconstructed process, and a BPMN 2.0 XML file can be imported back into its process editor as a new revision. Import into SAP Signavio has not been verified yet, so we do not claim it, and there is no connection to a Signavio workspace.',
  },
  {
    q: 'What are the Business, IT and Management views?',
    a: 'Three ways to read the same Clean-Core.io project. The Business view answers “Do I still need this, and what changes for me?”, the IT view “What exactly, where to, and is it right?”, and the Management view “What do I risk, what do I decide?”. A view only orders what is shown; it changes no result, and it is never stored on a run or a signature.',
  },
  {
    q: 'What is the Clean Core Score?',
    a: `The Clean Core Score is a 5–100 measure, published by Clean-Core.io, of how far the analysed custom ABAP is decoupled from the SAP standard core; higher is better. It falls into four bands: ${bandLabels}. SAP publishes no metric of that name, and it is not SAP’s Technical Debt Score, which runs the other way.`,
    more: { href: '/clean-core-score', label: 'What the Clean Core Score measures' },
  },
  {
    q: 'What is the SAP Cloudification Repository viewer?',
    a: 'The SAP object catalog on Clean-Core.io shows SAP’s published Cloudification Repository and object classification: for each SAP object its release state, clean core level and, where SAP names one, its successor — synced from SAP’s public repository. It needs no account.',
    more: { href: '/catalog', label: 'Open the SAP object catalog' },
  },
  {
    q: 'Who can see my projects?',
    a: 'Only the account that created a project, and anyone that account invites. An invitation is bound to one confirmed e-mail address and gives read access including the source code until it is withdrawn, which can happen at any time. Its link expires if nobody accepts it. There are no public links.',
  },
  {
    q: 'Where is my data stored?',
    a: `${trust('residency')} ${trust('tracking')} ${trust('erasure')}`,
    more: { href: '/trust', label: 'Trust and privacy' },
  },
  {
    q: 'Can I try the demo without an account?',
    a: 'No. The demo project lives in your workspace, so it needs a free account. Inside it nothing you do is saved, and nothing counts against your analysis runs.',
  },
  {
    q: 'How does clean core reduce S/4HANA upgrade risk?',
    a: 'Custom code that reads or modifies the SAP standard directly is what makes an upgrade expensive: a modification has to be adjusted in SPAU before the upgrade can proceed, native SQL bypasses the database abstraction, and every direct table read relies on a structure SAP never promised to keep. Clean core replaces those with released APIs. Clean-Core.io names them in your own ABAP, object by object against SAP’s published Cloudification Repository, and flags what a generator cannot reach instead of transforming it into something plausible and wrong.',
  },
  {
    q: 'Is Clean-Core.io an SAP product?',
    a: 'No. It is an independent community project, not affiliated with or endorsed by SAP SE. It follows SAP’s clean core level concept and reads SAP’s published Cloudification Repository.',
  },
];
