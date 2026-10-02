import type { ProvenanceValue } from './provenance';

/**
 * The words of the whitepaper (`/whitepaper`, its paper edition
 * `/whitepaper-print` and the PDF rendered from it) — roadmap 3.0, owner
 * request 01.10.2026: the document a person is *sent* has to say what the
 * landing page says, in the 3.0 look, with every 3.0 feature in it.
 *
 * Two kinds of text live here:
 *
 *   - **`FROM_LANDING`** — sentences the landing page (`app/page.tsx`) already
 *     says. They are not reworded for the whitepaper; they are the same
 *     sentence. The landing keeps its own copy (its guards want its arrays
 *     inline), so `tests/whitepaper-guard.spec.ts` reads `app/page.tsx` and
 *     fails when one of these strings is no longer in it — the place to change
 *     a sentence is the landing, then here.
 *   - **Whitepaper-only text** — the longer explanations a landing page has no
 *     room for. Every product statement in it is one the code backs; the file
 *     or module it rests on is named next to it.
 *
 * No figure is typed here. Counts, versions, dates, levels, bands and the
 * reference run are read where the component renders them.
 */

/** The approved USP, short form (owner decision 01.10.2026) — the landing's H1 and social card. */
export const USP_SHORT =
  'From custom ABAP nobody understands to a reviewed, tested rebuild — on one chain of evidence you can check.';

/**
 * The approved USP, long form (owner decision 01.10.2026).
 *
 * One qualifier added to the approved text, after the anchor: "or the reason it has none". The engine allows an element without an anchor
 * (`lib/abap/process-skeleton.ts`, `anchor: NodeAnchor | null`), and
 * `tests/line-anchor-claims-guard.spec.ts` refuses the unqualified sentence on
 * every surface — the landing says it the same way.
 */
export const USP_LONG =
  'For the person who has to decide what happens to a custom ABAP program, Clean-Core.io is the free workspace that reads the code before any model does, draws the business process as BPMN with a line anchor on every element, or the reason it has none, shows SAP’s clean core level for every SAP object it touches — and then carries the same evidence through the whole way: a target design, a transformed code draft and test scenarios, run in an isolated runner, all traceable to the lines they came from and sealed as signed runs. Other tools explain code, or rewrite it. Clean-Core.io does both on one chain of evidence — and says what it could not determine.';

/**
 * The numbered sections, in reading order: the anchor, the eyebrow over the
 * title, and the title itself (an `h2` through `SectionHeader`). The contents
 * on the cover read the same list, so an entry there is always the heading it
 * jumps to.
 */
export const WHITEPAPER_SECTIONS = [
  { id: 'summary', eyebrow: 'For decision makers', title: 'What is Clean-Core.io?' },
  { id: 'process', eyebrow: 'From code to process', title: 'How is the process reconstructed from ABAP?' },
  { id: 'views', eyebrow: 'Three views', title: 'One case, three views' },
  { id: 'clean-core', eyebrow: 'SAP S/4HANA clean core', title: 'Where each SAP object stands' },
  { id: 'tools', eyebrow: 'The seven stages', title: 'The tools in your workspace' },
  { id: 'honest', eyebrow: 'Honest by design', title: 'How do I know what is proven and what is not?' },
  { id: 'verify', eyebrow: 'One reproducible run', title: 'Verify it yourself' },
  { id: 'toolchain', eyebrow: 'Next to your SAP tools', title: "Does it replace SAP's own tools?" },
  { id: 'trust', eyebrow: 'Your code and your trust', title: 'Your data stays yours' },
  { id: 'start', eyebrow: 'Start · free', title: 'How do I start, and what does it cost?' },
  { id: 'faq', eyebrow: 'FAQ', title: 'Questions people ask first' },
] as const;

export type WhitepaperSectionId = (typeof WHITEPAPER_SECTIONS)[number]['id'];

/** "02 · The process, read out of the code" — the eyebrow over a section, and its line in the contents. */
export function sectionNumber(id: WhitepaperSectionId): string {
  const i = WHITEPAPER_SECTIONS.findIndex((s) => s.id === id);
  return String(i + 1).padStart(2, '0');
}

/* ------------------------------------------------------------------------ */
/* Sentences the landing page says — held equal by tests/whitepaper-guard.   */
/* ------------------------------------------------------------------------ */

export interface ChainStep {
  key: string;
  t: string;
  /** `{line}` is replaced with the plant-1000 rule's line, read from the demo source. */
  d: string;
  pv: ProvenanceValue;
  mark: string;
}

export const FROM_LANDING = {
  /** The hero's limits line, and the chain band's closing line. */
  limits:
    'The code is a draft for review. Tests run in an isolated runner against mocks, not in your S/4HANA system. A signature proves where a run came from and that it is unchanged — not that it is right.',
  whatLead: 'Other tools explain code, or rewrite it. Clean-Core.io does both — on one chain of evidence.',
  contrast: [
    { title: 'Tools that explain code', text: 'Explain what a program does — in words, a summary or a diagram.' },
    { title: 'Tools that rewrite code', text: 'Produce new code from the old program.' },
  ],
  contrastUs: 'Explains, rebuilds, tests — one chain of evidence.',
  contrastUsMore:
    'Reads your code before any model does, so every finding points to a line. Says what it could not determine, and never passes an assumption off as a fact.',
  chainSub:
    'Five steps on the same evidence. Each one says where it stands, and each points back to the line of code it came from.',
  chain: [
    { key: 'process', t: 'Process', d: 'The business process as BPMN, read from the code. Every element points to its line, or says why it has none — the plant 1000 rule of the demo to L{line}.', pv: 'reconstructed', mark: 'line anchor' },
    { key: 'design', t: 'Design', d: 'A target design for the route the evidence points to, built on the run the server signed — a proposal until you record the target you accept.', pv: 'proposed', mark: 'run reference' },
    { key: 'code', t: 'Code draft', d: 'The transformed code, generated from the source, the analysis and the design; its plan names every finding at its line. A draft you review, not a finished product.', pv: 'proposed', mark: 'line anchor' },
    { key: 'tests', t: 'Tests', d: 'Test scenarios for the generated code, run in an isolated runner against mocks. The server records what ran, on which code.', pv: 'demonstrated-mock', mark: 'test receipt' },
    { key: 'handover', t: 'Handover', d: 'An audit pack the server signs over the run, with HMAC and Ed25519, that anyone can verify offline.', pv: 'proven', mark: 'signature' },
  ] as ChainStep[],
  chainHonest:
    'The code is a draft for review, not a finished product. The tests run in an isolated runner against mocks: they check the generated code against test scenarios, not that it runs in your S/4HANA system. A signature proves where a run came from and that it is unchanged — not that it is right.',

  processLead:
    'Clean-Core.io draws the process as BPMN from what the ABAP code does, puts a line anchor on every element, or the reason it has none, and names what the code cannot show instead of drawing it.',
  processFeatures: [
    { t: 'Every element points to its lines', d: 'Start and end events, tasks, decisions and sub-processes each carry a line anchor. Decisions keep their condition from the code; proposed lanes are marked as proposals, never as your organisation.' },
    { t: 'Business rules come out of the code', d: 'Literals in conditions — tolerances, plants, vendor lists, date limits — become rule candidates with their anchor. You keep, change or drop each one.' },
    { t: 'Unreached code is named, not drawn', d: 'Forms no entry point calls stay off the map and are listed underneath with their lines. Identical forms are grouped, technical helpers fold into their caller.' },
    { t: 'Leaves as a BPMN 2.0 XML file', d: 'Export the process as standard BPMN 2.0 XML; collapsed sub-processes stay real sub-processes. Import into SAP Signavio has not been verified yet. There is no connection to a Signavio workspace — only files.' },
  ],

  viewsLead:
    'Business, IT and Management look at the same facts. Each view answers its own question — Do I still need this? What exactly, where to? What do I risk, what do I decide? — and none of them changes a result.',
  views: [
    { key: 'business', name: 'Business', q: 'Do I still need this, and what changes for me?', a: 'Opens with the process, its business rules — the hard-coded ones too — standard fit, and what could not be determined.' },
    { key: 'it', name: 'IT', q: 'What exactly, where to, and is it right?', a: 'Opens with the findings at their line, the successor SAP names, and the chain from requirement to anchor, finding and target draft.' },
    { key: 'management', name: 'Management', q: 'What do I risk, what do I decide?', a: 'Opens with what is backed by evidence, what stands in the way of a decision, the four buckets and the open decision — costs only as a simulation.' },
  ],
  /** The demo rule in three views — the landing's stage card. */
  viewExample: {
    business: { q: 'Do I still need this?', a: 'Requisitions for plant 1000 are approved without the limit check' },
    it: { q: 'What exactly, where to?', a: 'Sets gv_skip_limit, and DECIDE_APPROVAL then leaves out CHECK_LIMIT' },
    management: { q: 'What do I risk, what do I decide?', a: 'Not decided yet — keep, change or drop is yours' },
  },
  viewsNote:
    'A view orders what you see. It is never stored with a project, a run, a signature or an audit pack, and it changes no result. You confirm as the signed-in account — a self-declaration, not an organisational mandate.',

  cleanCoreLead:
    'Clean core keeps SAP S/4HANA standard. Clean core extensibility means extensions use only released, upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on SAP Business AI Platform (formerly SAP BTP).',
  cleanCoreMeans:
    'Keep the SAP core standard: extensions use only released, upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on BAIP.',
  /** One real SAP object per level, graded at render time; shown only while the catalog still puts it there. */
  levelExamples: [
    { name: 'I_SALESDOCUMENT', note: 'Released CDS view.' },
    { name: 'BAPI_PO_CREATE1', note: 'Classic BAPI SAP still recommends for classic ABAP.' },
    { name: 'REUSE_ALV_GRID_DISPLAY', note: 'An SAP object neither repository file lists — internal by default.' },
    { name: 'VBAK', note: 'Sales document table, not to be released.' },
  ],
  bucketRules: {
    retire:
      'The rule it serves is confirmed “Drop”, or a usage import shows no executions over at least 13 months — then it is a candidate, an open check, not a verdict.',
    'no-catalogued-path':
      'Needed, below the target platform’s bar, and SAP’s Cloudification Repository names no released API and no successor for it.',
    rebuild:
      'Needed, below the bar, and a successor or an extension path is named — and every modification or own write to an SAP table.',
    keep: 'Needed and permitted on the target platform: Public Edition level A only, Private Edition level A or B.',
  } as Record<string, string>,
  evidenceStations: [
    { key: 'source', t: 'Your ABAP source', d: 'Every statement keeps its program, include and line — that is what a line anchor points to. Includes that were not uploaded are named as not determined.', pv: 'reconstructed' as ProvenanceValue },
    { key: 'engine', t: 'Deterministic engine', d: 'Parses the code and finds the constructs, rules and SAP objects without a language model. The same file gives the same result.', pv: 'reconstructed' as ProvenanceValue },
    { key: 'imports', t: 'Your imports, optional', d: 'ATC results and usage data you upload. They are marked as imported, never as proven.', pv: 'imported' as ProvenanceValue },
    { key: 'model', t: 'A language model', d: 'Business names and drafts come last and are marked as a model proposal until someone confirms them.', pv: 'proposed' as ProvenanceValue },
  ],

  verifySteps: [
    { t: '1 · Import the draft', d: 'Import the generated abapGit package into Eclipse ADT.' },
    { t: '2 · Compile and test', d: 'Compile the code and run the ABAP Unit tests in your own sandbox.' },
  ],

  toolchain: [
    { tool: 'ABAP Test Cockpit (ATC)', purpose: 'The authoritative check for clean core violations — keep using it.', relation: 'Reads the same SAP Cloudification Repository ({objects}, classified) and shows its reading as level A–D. Import ATC results to compare them with the engine.' },
    { tool: 'ABAP Development Tools (ADT)', purpose: 'Where ABAP is developed, compiled and unit-tested; ABAP Unit and the CDS Test Double Framework are on board.', relation: 'Generated drafts arrive as an abapGit package that you import, compile and test there.' },
    { tool: 'Joule for Developers and the Custom Code Migration Agent', purpose: 'SAP’s AI for ABAP developers, inside your system: it explains code and fixes what ATC finds, under SAP’s licence.', relation: 'They tell developers what to fix. Clean-Core.io shows the business what the code does and carries the same evidence through a design, a code draft and tests to a decision; what stays goes to them. ATC stays the authority.' },
    { tool: 'SAP Signavio', purpose: 'Process modelling, under its own licence.', relation: 'The process leaves as a BPMN 2.0 XML file. Import into SAP Signavio has not been verified yet; there is no connection to a Signavio workspace.' },
    { tool: 'SAP Cloud ALM', purpose: 'Project and application lifecycle, under SAP’s licence.', relation: 'No adapter. The handover package is a set of files you take along.' },
  ],

  startSteps: [
    { t: 'Create a free account', d: 'Sign up with Google or with e-mail and password. No payment, no card.' },
    { t: 'Open the demo, an example or your code', d: 'The engine reads the source first. The process, its rules and what could not be determined appear with line anchors.' },
    { t: 'Confirm and decide', d: 'Confirm the rules, decide per object and hand over. Every completed analysis is sealed as a signed, unchangeable run.' },
  ],
  /** `{examples}` is the number of starter examples, read from `lib/starter-examples.ts`. */
  startLead:
    'Nothing — Clean-Core.io is free. Each of the {examples} examples runs once at no cost, your own code uses one of five free analysis runs, and after that you continue with your own Gemini API key.',
  closing: 'Read the code before you decide.',
} as const;

/* ------------------------------------------------------------------------ */
/* Whitepaper-only text                                                      */
/* ------------------------------------------------------------------------ */

/** The situation the reader is in, and what they get — the "In one page" cards. */
export const SUMMARY_CARDS = [
  {
    k: 'The situation',
    t: 'A custom program nobody can explain any more',
    d: 'The documentation was never written or is long gone, the person who built it has left, and the code is the only document that still says what the program does. Before an S/4HANA move or a clean core programme, someone has to decide what happens to it: keep it, rebuild it, move to SAP standard, or retire it.',
  },
  {
    k: 'What you get',
    t: 'The process, the rules and SAP’s view of every object',
    d: 'The process the program runs, drawn as BPMN in plain language. The business rules hard-coded in it, each with its line. SAP’s clean core level for every SAP object it touches. Then a target design, a code draft and tests on the same evidence — and a signed record of the analysis they rest on.',
  },
  {
    k: 'What stays with you',
    t: 'The decision',
    d: 'Clean-Core.io prepares the decision; it does not take it. You confirm the rules, choose the target and decide per object. What a model suggested is marked as a proposal until someone confirms it, and what the code does not show is listed as not determined.',
  },
];

/** The rest of the process section: what 3.0 added around the map. Backed by `components/process-map/*`, `lib/messages/process-editor.ts`, `components/workspace/BusinessRulesEditor.tsx`. */
export const PROCESS_MORE = [
  {
    t: 'Plain language first',
    d: 'Steps carry business names and decisions read as questions, worded from the code without a model. The names the code itself uses are one switch away — “Technical names” — for the developer.',
  },
  {
    t: 'Large processes stay readable',
    d: 'Levels instead of zoom: the map opens as an overview of phases. Open a phase in place, follow the path at the top back up, or read the same level as a list of steps — with the mouse or the keyboard.',
  },
  {
    t: 'Edit it in a BPMN editor',
    d: 'Every save is a new revision. The reconstruction from the code stays revision 1 and is never overwritten, and any revision can be compared with that as-is process: added, changed, removed.',
  },
  {
    t: 'Bring a model back in',
    d: 'A BPMN 2.0 XML file can be imported into the editor. It becomes a proposal for the next revision: elements it recognises keep their line anchor, elements added outside are marked as having none.',
  },
  {
    t: 'What the code touches is drawn too',
    d: 'Tables a step reads or writes appear as data stores beside it, and calls to another system as a collapsed pool — so a reader sees where the data comes from and where it goes.',
  },
  {
    t: 'Decide per rule',
    d: 'For every business rule the code holds: keep it, change it deliberately, drop it, or mark it to clarify. Each decision is recorded with the account that confirmed it.',
  },
];

/** The workspace around the seven tools. Backed by `components/workspace/*`, `lib/workflow-steps.ts`. */
export const TOOLS_LEAD =
  'Every project opens as one workspace: the process, its rules and the open decision on top, the three views, and seven tools behind them. Each tool produces something you can read and check before the next — and a person signs the result, not the tool.';

export const WORKSPACE_FACTS = [
  {
    t: 'Familiar to SAP users',
    d: 'The workspace and its tools follow SAP Fiori design patterns — a list of your projects, an object page per project, one clear next step. It is an independent design: not a Fiori app, and not affiliated with or endorsed by SAP.',
  },
  {
    t: 'Share by invitation',
    d: 'Only the account that created a project, and anyone that account invites, can open it. An invitation is bound to one confirmed e-mail address and gives read access including the source code until it is withdrawn, which can happen at any time. Its link expires if nobody accepts it. There are no public links.',
  },
  {
    t: 'A print sheet per project',
    d: 'One printable sheet: the process as numbered steps, the business rules with the decision on record, every SAP object the code names with its clean core level A–D, and everything that was not determined. The level prints as orientation — it is not part of the signed run.',
  },
];

/** The signing paragraph of the honest section. Backed by `lib/audit-signing-keypair.ts`, `app/api/export/verify/route.ts`, `scripts/verify-pack.mjs`. */
export const SIGNING = [
  {
    t: 'Signed runs',
    d: 'Every completed analysis is sealed as a signed, unchangeable run. Every later tool builds on that run, and says when the source has changed since.',
  },
  {
    t: 'An audit pack anyone can check',
    d: 'The server signs the audit pack over the run with HMAC and Ed25519. The Ed25519 signature checks against a published public key — on the Verify Pack page, or offline with the open-source verifier, without an account and without trusting us.',
  },
  {
    t: 'What a signature does not say',
    d: 'It proves where a run came from and that it is unchanged — not that the result is right. The clean core level A–D is never part of the signed pack, and a demo run is never signed.',
  },
];

/** What the product deliberately does not do — kept from the 2.x whitepaper where it still holds. */
export const DOES_NOT_DO = [
  'Decide for you. The rules, the target and the decision per object stay with the people who own them.',
  'Perform or guarantee an automated migration, or deliver production-ready code without review.',
  'Replace SAP’s own tools: ABAP Test Cockpit stays the authority, ADT stays where code is built and tested.',
  'Transform SAP GUI dynpro screens, core modifications, native SQL, dynamic call routing or kernel internals — these are flagged and handed back, never guessed at.',
  'Promise a time saving or a business case. Costs appear only as a simulation on figures you enter.',
  'Connect to SAP Signavio, SAP Cloud ALM or your S/4HANA system to change anything. What leaves is files.',
  'Claim any affiliation with or endorsement by SAP SE.',
];
