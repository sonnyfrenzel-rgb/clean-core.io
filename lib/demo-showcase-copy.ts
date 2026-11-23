/**
 * The words of the public demo showcase at `/demo` (roadmap 3.5.0 item 8;
 * mockup `docs/roadmap/demo-showcase-mockup.html` v3, variant A).
 *
 * Ten steps and the end, each in one sentence for all readers and one line per
 * reader (Business, IT, Management, the order of ADR-044), with the strength it
 * shows and the technical details on demand. Every figure in a sentence is
 * taken from the engine's reading ({@link ShowcaseCopyFacts}, computed by
 * `lib/demo-showcase.ts`), never typed in; the few statements that cannot be a
 * figure — which rule the card shows, where a change is marked on the map —
 * are listed below and checked against the engine by `showcaseDrift`.
 *
 * Pure and free of imports from the server: the client component reads it.
 */
import { BTP_FIRST } from './sap-naming';

/** A step's address: `/demo#step=4`, with a reader's emphasis `/demo#step=4&lens=it`; the end is `/demo#step=end`. */
export const SHOWCASE_PATH = '/demo';
export const SHOWCASE_STEP_COUNT = 10;
export function showcaseStepHref(step: number | 'end', lens?: ShowcaseLens): string {
  const lensPart = lens && lens !== 'all' ? `&lens=${lens}` : '';
  return `${SHOWCASE_PATH}#step=${step}${lensPart}`;
}

/** Where the showcase sends a reader after sign-in or sign-up (`lib/return-path.ts` allows both exactly). */
export const SHOWCASE_CONTINUE_TARGET = '/dashboard?from=demo';
export const SHOWCASE_OWN_CODE_TARGET = '/admin/new-project/upload';

export type ShowcaseLens = 'all' | 'business' | 'it' | 'management';
export const SHOWCASE_LENSES: ReadonlyArray<readonly [ShowcaseLens, string]> = [
  ['all', 'All together'],
  ['business', 'Business'],
  ['it', 'IT'],
  ['management', 'Management'],
];

export type ShowcaseScreen = 'business' | 'it' | 'management' | 'delivery';

/** The part of the screen a step explains — a `data-showcase-part` value. */
export type ShowcasePart = 'code' | 'map' | 'rules' | 'ends' | 'levels' | 'route' | 'decision' | 'tools' | 'pack';

export interface ShowcaseStep {
  screen: ShowcaseScreen;
  part: ShowcasePart;
  /** The level the map opens on, and the element it selects. */
  plane?: string;
  select?: string;
  /** The program lines the code card shows before a step is chosen. */
  code?: [number, number];
  title: string;
  all: string;
  emphasis: Record<Exclude<ShowcaseLens, 'all'>, string>;
  lens: Record<Exclude<ShowcaseLens, 'all'>, string>;
  why: { title: string; text: string } | null;
  /** Technical details; a span in backticks is code. */
  details: string[];
}

/** What the sentences quote — a subset of `ShowcaseFacts`, so this module needs nothing from the server. */
export interface ShowcaseCopyFacts {
  objectName: string;
  subject: string;
  engineVersion: string;
  catalogVersion: string;
  sourceSha256: string;
  totalLines: number;
  linesOfCode: number;
  topSteps: number;
  elements: number;
  levels: number;
  anchored: number;
  rules: number;
  findings: number;
  distinctFindings: number;
  severity: { critical: number; high: number; medium: number; low: number; info: number };
  critical: { object: string; line: number } | null;
  score: number;
  scoreLines: Array<{ label: string; count: number; points: number }>;
  unassessedKinds: number;
  unassessedPoints: number;
  route: string;
  target: string;
  confidence: number;
  keyUser: { total: number; keyUser: number; code: number; candidates: string[] };
  commits: number;
  batchInputLine: number | null;
  uploadLine: number | null;
  writesDirect: Array<{ object: string; line: number }>;
  levelD: number;
  levelC: number;
  readsOnly: string[];
}

export interface ShowcaseCopyCounts {
  /** Ways a case ends, and how many of them are stops. */
  ends: number;
  stops: number;
  /** The stop group with the most stops, and its size. */
  topStop: { label: string; count: number } | null;
  changes: number;
}

/** The rules the card shows, in the guide's words; `ruleId` and `literal` are what `showcaseDrift` checks. */
export const SHOWCASE_RULES = [
  { ruleId: 'BR-010', line: 325, literal: "'50000.00'", value: '≤ 50,000.00', text: 'An emergency up to this amount goes to the department head.' },
  { ruleId: 'BR-006', line: 95, literal: "'1000'", value: 'Plant 1000', text: 'The central warehouse skips the limit check.' },
  { ruleId: 'BR-009', line: 315, literal: '> 5', value: '> 5 %', text: 'A price this far above the info record puts the requisition on hold.' },
  { ruleId: 'BR-005', line: 72, literal: "'EMERG*'", value: 'EMG / EMERG*', text: 'How the program recognises an emergency.' },
] as const;

/** Calls that change records without a table write of their own, with the line `showcaseDrift` checks. */
export const SHOWCASE_CHANGE_CALLS = [
  { object: 'BAPI_PO_CREATE1', line: 475, how: 'posts the purchase order through BAPI_PO_CREATE1' },
  { object: 'ME21N', line: 515, how: 'enters it through batch input in ME21N' },
] as const;

/** Where on the map a change is marked: the step that performs the routine with the write. */
export const SHOWCASE_CHANGE_MARKS: Record<string, string> = {
  EBAN: 'nd-43-0',
  ZMM_PO_APPR: 'nd-223-0',
  BAPI_PO_CREATE1: 'nd-314-0',
  ME21N: 'nd-317-0',
  ZMM_PO_ATTACH: 'nd-101-0',
};

/** The element steps 3 and 4 select: the decision "Which case applies?" inside "Decide approval". */
const DECISION = 'nd-209-0';
const DECIDE_PLANE = 'nd-45-0';
export const SHOWCASE_STEP_SELECTIONS: Record<string, string> = { '3': DECISION, '4': DECISION, plane: DECIDE_PLANE };

const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
/** A count in words up to twelve, as a sentence starts it; digits above. */
export function countWord(n: number, capital = false): string {
  const w = n >= 0 && n < words.length ? words[n] : String(n);
  return capital ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

export function showcaseSteps(f: ShowcaseCopyFacts, c: ShowcaseCopyCounts): ShowcaseStep[] {
  const direct = f.writesDirect[0];
  const deduction = f.scoreLines.map((l) => `${l.points} (${l.label.toLowerCase()}, ${l.count})`).join(' − ');
  const severity = `${f.severity.critical} critical, ${f.severity.high} high, ${f.severity.medium} medium, ${f.severity.low} low, ${f.severity.info} info`;
  return [
    {
      screen: 'business',
      part: 'code',
      code: [1, 11],
      title: `A program decides how ${f.subject.toLowerCase().replace(/ approval$/, 's')} get approved. Nobody can say how.`,
      all: 'Its rules live only in SAP code. Here is what Clean-Core.io reads from it, without AI.',
      emphasis: {
        business: 'Purchasing relies on it, and its rules exist only as code. Here is what Clean-Core.io reads from it, without any AI.',
        it: `One report, ${f.totalLines} lines, nothing beside it but a header comment. The file goes in unchanged; a deterministic engine reads it first.`,
        management: 'Nobody can say what it decides, so nobody can say what changing it costs. Here is what Clean-Core.io reads from it, without any AI.',
      },
      lens: {
        business: 'A process you rely on, written only in code.',
        it: `One file, ${f.totalLines} lines, uploaded unchanged.`,
        management: 'Unknown code is a risk in every upgrade.',
      },
      why: null,
      details: [
        `Program \`${f.objectName}\`, “${f.subject}”: the shipped starter example, fictitious code. ${f.totalLines} lines, ${f.linesOfCode} without blank and comment lines.`,
        `Read by the engine of ${f.engineVersion} when this page was built; source fingerprint \`sha256 ${f.sourceSha256.slice(0, 8)}…\`.`,
      ],
    },
    {
      screen: 'business',
      part: 'map',
      title: 'Out comes the process, as real BPMN.',
      all: `${countWord(f.topSteps, true)} steps, with checks, stops and records, drawn from the code.`,
      emphasis: {
        business: 'Your process in the order it runs: check, read, decide, notify. The boxes with a + hold more steps.',
        it: `Standard BPMN 2.0, laid out by the engine; ${f.elements} elements on ${f.levels} levels.`,
        management: 'For the first time the program has a picture everyone can check.',
      },
      lens: {
        business: 'Your process, in the order it runs.',
        it: 'Every element points to its line in the code.',
        management: 'A picture everyone can check, not one expert’s memory.',
      },
      why: { title: 'The process as BPMN, read from the code', text: 'Every element has its line; export it as BPMN 2.0 for SAP Signavio.' },
      details: [
        `The annotation on the map is part of the file: reconstructed from the ABAP source without a language model; ${f.anchored} of ${f.elements} elements carry a line anchor.`,
        'Exchange with SAP Signavio is by BPMN 2.0 XML file, export and import; there is no Signavio API connection.',
        'Drawn by bpmn-js, the renderer the product’s map uses, from the demo’s own BPMN file.',
      ],
    },
    {
      screen: 'business',
      part: 'code',
      plane: DECIDE_PLANE,
      select: DECISION,
      title: 'Open a step, and see the code behind it.',
      all: 'Inside “Decide approval”: tap a step, and its code opens beside it.',
      emphasis: {
        business: 'Emergencies up to 50,000 go to the department head, everything else to a manager. Tap a step to see it.',
        it: 'The decision “Which case applies?” is line 325. Every element opens its anchor.',
        management: 'No black box: every statement on the map can be traced to the code.',
      },
      lens: {
        business: 'Who approves what, in plain steps.',
        it: 'Each element opens its lines; no model in the reading.',
        management: 'Every statement can be traced.',
      },
      why: {
        title: 'The engine first, AI only where marked',
        text: 'No AI in this reading. Model text is marked “AI-generated”; the model is Gemini, or your own key: Gemini, and Claude from 23 December 2026.',
      },
      details: [
        'Provenance on every statement: `Reconstructed` (engine), `AI-generated` (model), `Imported` (SAP’s files), `Not determined` (said, not guessed).',
        'Model steps (design, code draft, documentation, tests) run through the server; the browser never talks to a model provider.',
        'An own Claude key comes with an additional agreement: a model step’s data then goes to Anthropic.',
      ],
    },
    {
      screen: 'business',
      part: 'rules',
      plane: DECIDE_PLANE,
      select: DECISION,
      title: 'And the rules nobody wrote down.',
      all: `${countWord(f.rules, true)} limits and fixed values the program decides with.`,
      emphasis: {
        business: `${countWord(f.rules, true)} rules your purchasing follows, written only in code. Plant 1000 skips the limit check: did anyone decide that?`,
        it: `${countWord(f.rules, true)} hard-coded values and conditions, each with its line, as candidates for configuration.`,
        management: `${countWord(f.rules, true)} decisions that sit in code, not in a policy. Each one can now be owned.`,
      },
      lens: {
        business: 'Rules you can confirm, change or drop.',
        it: 'Hard-coded values that belong in configuration.',
        management: 'Policy in code is policy nobody owns.',
      },
      why: { title: 'Hidden rules, made visible and decidable', text: 'Each rule has its line; you keep, change, drop or clarify it.' },
      details: [
        `${f.rules} rules read by the engine's rule set, each with its lines: ${SHOWCASE_RULES.map((r) => `line ${r.line}`).join(', ')} among them.`,
        'The rule texts are the engine’s; the plain wording on the card is the guide’s reading of them.',
      ],
    },
    {
      screen: 'business',
      part: 'ends',
      title: 'How a case can end, and what it changes.',
      all: `${c.ends} ways to end, ${c.stops} of them stops. It changes ${c.changes} kinds of records and only reads ${f.readsOnly.length}.`,
      emphasis: {
        business: c.topStop
          ? `“${c.topStop.label}” stops more cases than any other step: ${c.topStop.count} of the ${c.stops} ways. Tap a row to see where.`
          : 'Tap a row to see where a case stops.',
        it: `${c.ends} end events: ${c.ends - c.stops} normal, ${c.stops} stops by message or RETURN. Writes reached: ${c.changes}; tables only read: ${f.readsOnly.length}.`,
        management: `${countWord(c.stops, true)} ways to stop a case are ${countWord(c.stops)} places a user can be stuck.`,
      },
      lens: {
        business: 'Where a requisition gets stuck, and why.',
        it: 'What it writes, and what it only reads.',
        management: 'The reach of this program in your data.',
      },
      why: { title: 'Every count has its lines', text: 'Tap a row: the map marks what it counts.' },
      details: [
        'A sub-process’s own end is no end of the case; a stop is an error end or a routine left early.',
        'Changes are writes a run reaches; reads come from the data coupling and are not proven reachable.',
      ],
    },
    {
      screen: 'it',
      part: 'levels',
      title: 'IT sees what blocks a clean core, object by object.',
      all: 'Each SAP object gets its level from SAP’s own classification. The hardest point: one direct change to SAP’s own data.',
      emphasis: {
        business: 'One step changes SAP’s own data directly; that is what has to change.',
        it: direct
          ? `${direct.object} is written directly: level D, line ${direct.line}. ${countWord(f.levelC, true)} other uses sit at level C.`
          : `${countWord(f.levelC, true)} uses sit at level C.`,
        management: 'The risk sits in one place, not spread across the program.',
      },
      lens: {
        business: 'One step changes SAP data directly.',
        it: `${countWord(f.levelD, true)} use at level D, ${f.levelC} at level C.`,
        management: 'The risk is concentrated in one place.',
      },
      why: { title: 'Clean core levels A–D from SAP’s own classification', text: 'SAP’s rating, not ours, with the object and its line.' },
      details: [
        `Catalog: ${f.catalogVersion}. The level is \`Imported\` and never part of a signed audit pack.`,
        `Score ${f.score} = 100 − ${deduction}${f.unassessedKinds ? ` − ${f.unassessedPoints} (${f.unassessedKinds} kinds of code not assessed)` : ''}.`,
        `${f.distinctFindings} findings at ${f.findings} places in the code: ${severity}.`,
      ],
    },
    {
      screen: 'it',
      part: 'route',
      title: 'And the way forward: stay in SAP, rebuilt on released interfaces.',
      all: `Rebuild inside SAP S/4HANA; ${countWord(f.keyUser.keyUser)} small parts could be key-user configuration.`,
      emphasis: {
        business: 'It can stay where your people use it, inside SAP.',
        it: `${f.route} as a ${f.target}; the batch input and the file upload force no side-by-side split.`,
        management: 'No new platform is needed for this program.',
      },
      lens: {
        business: 'It stays in SAP; one step changes how it works.',
        it: `${f.target}, in-app; no side-by-side split forced.`,
        management: 'No new platform needed for this program.',
      },
      why: {
        title: 'A route, with its reasons',
        // The platform's name from lib/sap-naming.ts until the product-wide rename (owner, 13.11.2026).
        text: `In-app on ABAP Cloud, side-by-side on ${BTP_FIRST}, or key user, weighed against the code.`,
      },
      details: [
        `Route ${f.route}, target ${f.target}, confidence ${f.confidence}.`,
        `Key user: ${f.keyUser.keyUser} of ${f.keyUser.total} parts are candidates (${f.keyUser.candidates.join(', ')}); ${f.keyUser.code} stay code.`,
        `COMMIT WORK (${f.commits}×) gives way to the RAP save sequence${f.batchInputLine ? `; the batch input from line ${f.batchInputLine} is replaced by a released API` : ''}.`,
      ],
    },
    {
      screen: 'management',
      part: 'decision',
      title: 'Management gets a decision basis, not a code review.',
      all: 'What it is for, what it touches, what is open. The decision is yours.',
      emphasis: {
        business: 'Your rules and your process stay the basis of the decision.',
        it: 'The findings behind each statement are one click away, in the IT view.',
        management: 'What it is for, what it touches, what is open, and the route if you rebuild. Cost comes from your own day rates.',
      },
      lens: {
        business: 'Your rules and process stay the basis.',
        it: 'The findings behind each statement are one click away.',
        management: 'A basis you can sign, and defend later.',
      },
      why: { title: 'Business, IT and Management on one project', text: 'Three views of one analysis. The switch changes the questions, not the facts.' },
      details: [
        'A view is never stored on a run, a signature or an audit pack.',
        'Economics computes no amount until both day rates and the investment are entered; this demo has none entered.',
      ],
    },
    {
      screen: 'delivery',
      part: 'tools',
      title: 'From analysis to handover, in seven tools.',
      all: 'Design, code, documentation, tests and economics build on this reading.',
      emphasis: {
        business: 'Process documentation in your own standard, from the same reading.',
        it: 'A code draft and tests against the same line anchors.',
        management: 'Effort and cost worked out with your own day rates.',
      },
      lens: {
        business: 'Documentation in your own standard.',
        it: 'Code draft and tests against the same anchors.',
        management: 'Effort and cost with your own day rates.',
      },
      why: { title: 'One chain, from analysis to delivery', text: 'Each tool says what it is: read from the code, proposed, or proven.' },
      details: ['The state of each tool on this screen is the demo project’s own, word for word.'],
    },
    {
      screen: 'delivery',
      part: 'pack',
      title: 'Every real analysis is sealed, and anyone can check it.',
      all: 'A real run is signed and cannot change. Anyone can verify it, even offline.',
      emphasis: {
        business: 'The basis of your decision cannot quietly change.',
        it: 'Run hash, HMAC signature, and an audit pack signed again with Ed25519; check it yourself, offline.',
        management: 'Audit-ready evidence, not a slide.',
      },
      lens: {
        business: 'The basis of your decision cannot quietly change.',
        it: 'Check the signature yourself, offline.',
        management: 'Audit-ready evidence, not a slide.',
      },
      why: { title: 'Signed, verifiable runs and audit pack', text: 'Verify in the browser or offline, without asking us. The demo itself is not signed.' },
      details: [
        'A run is hashed (SHA-256) and signed with HMAC-SHA256; the audit pack’s manifest is signed with HMAC and Ed25519. The Clean Core Score is covered; the level A–D is not.',
        'Browser: `/verify-pack`, the archive is never uploaded. Offline: `node scripts/verify-pack.mjs <pack.zip>` against `/.well-known/clean-core-io-signing.json`.',
      ],
    },
  ];
}

export const SHOWCASE_END = {
  title: {
    all: 'Analyze your own Z program with a free account',
    business: 'Understand your own Z program',
    it: 'Analyze your custom code',
    management: 'Get a decision basis for your custom code',
  } as Record<ShowcaseLens, string>,
  lead: {
    all: 'The same reading, for a program from your own system, before you decide anything.',
    business: 'See your own program as a process, with the rules it follows, before anyone decides anything.',
    it: 'Upload one program. The engine reads it first; every step and finding carries its line.',
    management: 'One program, one picture, one sealed basis for keep, rebuild or retire.',
  } as Record<ShowcaseLens, string>,
  primary: 'Create a free account',
  ownCode: 'See it with your own code: 3 steps',
  ownSteps: [
    ['Create a free account', 'With Google or with e-mail and password. No payment, no card.'],
    ['Upload one program', 'A file or pasted code. You are told what is read, stored and counted before it starts.'],
    ['Read its process', 'The map, the rules and the route of your own program, each tied to its code.'],
  ] as const,
  account: [
    'All seven tools and the three views: Business, IT and Management',
    'This example, and every other, free the first time you run it',
    'Five free analysis runs for your own code, once, not per month',
    'Your own key, no quota: Gemini, and Claude from 23 December 2026',
  ],
  accountNote: 'Free for the SAP community. No paid tier. An own Claude key comes with an additional agreement: a model step’s data then goes to Anthropic.',
  privacy: [
    'Stored in the EU (Google Cloud, europe-west1)',
    'The analysis calls no model. A model step runs only for you, the owner: when you start it, or when you switched on automatic steps',
    'Shared only by invitation: read access bound to one confirmed e-mail address, with expiry and revocation',
    'Your own key is stored encrypted and used only on the server',
  ],
};

/**
 * The showcase step that shows a tool of the product (mockup v3, "Decisions"):
 * Analyze the map, Design the route, Delivery the sealed pack; the tools the
 * showcase only names (Transformation, Documentation, Testing, Economics) the
 * step of the seven tools. Where the public pages link a tool to the demo.
 */
export const SHOWCASE_STEP_OF_TOOL: Readonly<Record<string, number>> = {
  analyze: 2,
  design: 7,
  transformation: 9,
  documentation: 9,
  testing: 9,
  tco: 9,
  delivery: 10,
};

/** `/demo#step=N` for a tool's key; the start for a key it does not know. */
export function showcaseHrefForTool(key: string): string {
  return showcaseStepHref(SHOWCASE_STEP_OF_TOOL[key] ?? 1);
}
