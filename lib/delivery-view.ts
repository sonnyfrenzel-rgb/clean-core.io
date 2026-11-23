/**
 * The Delivery tool as one page for every reader (ADR-132, `docs/roadmap/delivery-next-mockup.html`, decisions L1–L10,
 * L12, L13): can the program be handed over, what is on record, what the package holds, whether the tests ran, whether
 * the audit pack is sealed, what blocks the handover, what travels open, and — statement by statement — what is
 * proven and what is not.
 *
 * **Presentation only.** Every verdict is read from a module that already owns it: the nine links and the still-needed
 * list of `lib/handover.ts`, the phase contract of `lib/workflow-steps.ts`, the test readings of
 * `lib/sap-test-results.ts` and `lib/testing-closure.ts`. Nothing here is signed, nothing decides what is signed, and
 * nothing changes how the audit pack is built or checked (`lib/audit-pack*.ts`). The program decision and the test
 * result are said to be *on the project, not in the pack* — writing them into `07-user-attested.md` is L11, a
 * pack-format change of its own.
 *
 * "Handed over" is not a state of this page (L4): a download is not a handover. The page says *Sealed on …*;
 * handover, acceptance, transport and go-live are the reader's, in their own system.
 *
 * Pure: no React, no Firestore.
 */

import type { RailStep } from './workflow-steps';
import { testEvidence, isContextBlocker } from './workflow-steps';
import {
  AUDIT_PACK_FILES,
  HANDOVER_LINKS,
  signedOffTarget,
  storedDecisionOf,
  decisionIsCurrent,
  isoOf,
  type HandoverLink,
  type HandoverProject,
  type StillNeeded,
} from './handover';
import { outsideCountsLine, outsideReading } from './sap-test-results';
import { testingClosureReading } from './testing-closure';
import { CONDITION_STATUS_LABEL } from './decision-card';
import { PAGE_ANCHOR_IDS } from './page-anchors';

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const list = (xs: readonly string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const cap = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);

/* ------------------------------------------------------------------ inputs */

/** What the page knows besides the project: the parts it can show, and the state of the handover. */
export interface DeliveryFacts {
  /** The program's name as the header reads it. */
  program: string;
  /** `handoverBlockers(project)` — artefacts made for a previous source or before the latest decisions. */
  blockers: readonly string[];
  /** When the audit pack was last sealed, or `null`. */
  exportedAt: string | null;
  /** `handoverStillNeeded(…)`. */
  stillNeeded: readonly StillNeeded[];
  /** The nine links (`buildHandoverChain`). */
  chain: readonly HandoverLink[];
  phases: RailStep[];
  /** The six parts of the package, each present or not. */
  parts: PackageParts;
}

export interface PackageParts {
  /** Generated code, or the key-user step list on a key-user decision. */
  code: boolean;
  tests: boolean;
  documentation: boolean;
  /** The source still matches the signed run, so the BPMN can be written. */
  bpmn: boolean;
  /** A requirements specification is on record. */
  spec: boolean;
  /** The stakeholder slides can be built (a current analysis). */
  slides: boolean;
}

export function partsCount(parts: PackageParts): number {
  return [parts.code, parts.tests, parts.documentation, parts.bpmn, parts.spec, parts.slides].filter(Boolean).length;
}

/* ------------------------------------------------------------------ answer */

export type HandoverVerdict = 'yes' | 'not-yet' | 'stop';

export interface HandoverAnswer {
  verdict: HandoverVerdict;
  /** One or two sentences. */
  answer: string;
  /** The condition it rests on, in one line. */
  condition: string;
}

/** What each still-needed line means, said as what is missing (the answer's "but …"). */
const MISSING_WORDS: Readonly<Record<string, string>> = Object.freeze({
  source: 'no source is staged',
  run: 'the signed run does not describe the current source',
  design: 'the target is not confirmed in Design',
  transformation: 'there is no current code',
  documentation: 'the documentation is not written from the code',
  tests: 'the tests have not passed on record',
  economics: 'no cost scenario is priced in Economics',
  decision: 'the decision is not confirmed',
  'audit-pack': 'the audit pack is not sealed',
});

/** "code, tests and documentation", as far as they exist. */
function madeWords(parts: PackageParts): string[] {
  return [
    parts.code ? 'code' : null,
    parts.tests ? 'tests' : null,
    parts.documentation ? 'documentation' : null,
  ].filter((x): x is string => x !== null);
}

/**
 * *Can <program> be handed over?* — Yes, Not yet or Stop (L2). Stop is a blocker: something on record was made for
 * another source or before the latest decisions, so it must not leave. Yes is the empty still-needed list — every
 * link on record, the decision confirmed, the tests verified, the pack sealed. Everything else is Not yet, naming what
 * is missing.
 */
export function handoverAnswer(project: HandoverProject, facts: DeliveryFacts): HandoverAnswer {
  const hasRun = !!str(project.activeRunId) && !project._runLoadFailed;
  const signedLine = hasRun
    ? 'The analysis behind it is signed by the server. Code, tests and documentation are not signed: the package’s manifest fingerprints every file and names the signed run.'
    : 'Nothing is signed yet: every signed statement derives from an analysis run.';
  const n = facts.blockers.length;
  if (n > 0) {
    const context = facts.blockers.every(isContextBlocker);
    return {
      verdict: 'stop',
      answer: context
        ? `Stop — do not hand over what is on record. ${plural(n, 'artefact')} ${n === 1 ? 'was' : 'were'} made before a rule decision, the decision record or an accepted requirement changed.`
        : `Stop — do not hand over what is on record. ${plural(n, 'artefact')} ${n === 1 ? 'was' : 'were'} made for a previous source.`,
      condition: `Nothing leaves this page until ${n === 1 ? 'it is' : 'they are'} made again. ${hasRun ? 'The signed analysis itself is unchanged.' : ''}`.trim(),
    };
  }
  const made = madeWords(facts.parts);
  if (made.length === 0) {
    return {
      verdict: 'not-yet',
      answer: hasRun
        ? 'Not yet — there is nothing to hand over. Only the analysis exists, and it is signed; there is no code, no test and no documentation yet.'
        : 'Not yet — there is nothing to hand over. No signed analysis, no code, no test and no documentation are on record.',
      condition: 'This page fills as the tools before it are done, in their order: Economics, Design, Transformation, Documentation, Testing.',
    };
  }
  if (facts.stillNeeded.length === 0) {
    return {
      verdict: 'yes',
      answer: `Yes. ${facts.program} can be handed over: ${list(made)} are on record, the tests are verified, the decision is confirmed, and the audit pack is sealed.`,
      condition: `${signedLine} Activation, transport and go-live happen in your system.`,
    };
  }
  const missing = facts.stillNeeded.map((s) => MISSING_WORDS[s.key] ?? s.text.toLowerCase());
  return {
    verdict: 'not-yet',
    answer: `Not yet. The package holds ${list(made)} as a review version, but ${list([...new Set(missing)])}.`,
    condition: signedLine,
  };
}

/* ------------------------------------------------------------------ facets */

export interface DeliveryFacet {
  id: 'on-record' | 'package' | 'tests' | 'audit-pack';
  label: string;
  value: string;
  unit?: string;
  note: string;
  /** A family chip kind beside the label, where the facet's figure has a provenance worth naming. */
  chip?: 'signed' | 'engine' | 'yours' | 'ai' | 'simulation' | 'not-determined';
  chipNote?: string;
  /** The section the facet jumps to. */
  target: string;
}

/** The four facets of the answer (L2): on record, the package, tests, audit pack. No "Handed over" (L4). */
export function deliveryFacets(project: HandoverProject, facts: DeliveryFacts, ids: DeliverySectionIds = DELIVERY_SECTION_IDS): DeliveryFacet[] {
  const chain = facts.chain;
  const onRecord = chain.filter((l) => l.state === 'on-record').length;
  const notOn = chain.filter((l) => l.state !== 'on-record');
  const record: DeliveryFacet = {
    id: 'on-record',
    label: 'On record',
    value: String(onRecord),
    unit: `of ${HANDOVER_LINKS.length} links`,
    note:
      notOn.length === 0
        ? 'Source, analysis, cost, design, code, documentation, tests and decision.'
        : `Open: ${notOn.map((l) => `${l.label.toLowerCase()}${l.state === 'stale' ? ' (out of date)' : ''}`).join(', ')}.`,
    target: ids.proof,
  };

  const count = partsCount(facts.parts);
  const pkg: DeliveryFacet = {
    id: 'package',
    label: 'The package',
    value: String(count),
    unit: 'of 6 parts',
    note:
      count === 0
        ? 'Nothing is made yet.'
        : 'Not signed — every file is fingerprinted in the manifest, which names the signed run.',
    target: ids.package,
  };

  const testing = facts.phases.find((p) => p.key === 'testing');
  const tests = chain.find((l) => l.key === 'tests');
  const ev = testEvidence(project);
  let testsFacet: DeliveryFacet;
  if (ev.total === 0) {
    testsFacet = {
      id: 'tests',
      label: 'Tests',
      value: 'Not yet',
      note: facts.parts.code ? 'No test suite is written yet. Testing writes it.' : 'Written in Testing once the code exists.',
      target: ids.package,
    };
  } else if (tests?.state === 'stale') {
    testsFacet = { id: 'tests', label: 'Tests', value: 'Out of date', note: 'Written for a previous package or source. Testing writes them again.', target: ids.package };
  } else if (testing?.closedUnverified) {
    testsFacet = { id: 'tests', label: 'Tests', value: 'Not verified', note: 'Testing was closed without a passing run — your statement, named in the package.', chip: 'yours', target: ids.package };
  } else if (testing?.verifiedOutside) {
    const outside = outsideReading(project as Parameters<typeof outsideReading>[0]);
    const s = outside.state === 'current' ? outside.summary : null;
    testsFacet = {
      id: 'tests',
      label: 'Tests',
      value: 'Passed',
      unit: 'in your system',
      note:
        (s ? `${cap(outsideCountsLine(s))}. ` : '') +
        (testing.verifiedOutside === 'imported'
          ? 'An imported ABAP Unit result file, run there, not here.'
          : 'Your statement that it ran there, not a run here.'),
      chip: testing.verifiedOutside === 'imported' ? 'engine' : 'yours',
      chipNote: testing.verifiedOutside === 'imported' ? 'imported' : undefined,
      target: ids.package,
    };
  } else if (tests?.provenance === 'imported' || tests?.provenance === 'confirmed') {
    testsFacet = { id: 'tests', label: 'Tests', value: 'Failing or incomplete', note: `${tests.value ?? 'A result from your SAP system'} — not every case passed.`, target: ids.package };
  } else if (testing?.proven && testing.mock) {
    testsFacet = {
      id: 'tests',
      label: 'Tests',
      value: ev.attestedFailures > 0 ? 'Failing' : 'Ran against mocks',
      note: 'In the sandbox here, against mocks — not your SAP system.',
      chip: 'simulation',
      target: ids.package,
    };
  } else if (testing?.proven) {
    testsFacet = { id: 'tests', label: 'Tests', value: 'Passed', note: 'A recorded run here.', target: ids.package };
  } else {
    testsFacet = {
      id: 'tests',
      label: 'Tests',
      value: 'Written, not run',
      note: `${plural(ev.total, 'case')} on record; no recorded run stands behind any verdict.`,
      target: ids.package,
    };
  }

  const hasRun = !!str(project.activeRunId) && !project._runLoadFailed;
  const sealed = isoOf(facts.exportedAt);
  const pack: DeliveryFacet =
    facts.blockers.length > 0
      ? { id: 'audit-pack', label: 'Audit pack', value: 'Blocked', note: 'Refused over artefacts made for another source.', target: ids.pack }
      : !hasRun
        ? { id: 'audit-pack', label: 'Audit pack', value: 'Not available', note: 'Sealed only against a signed run.', target: ids.pack }
        : !project.auditMetadata?.inputFingerprint
          ? { id: 'audit-pack', label: 'Audit pack', value: 'Partial', note: 'No input fingerprint — run the analysis again.', target: ids.pack }
          : sealed
            ? {
                id: 'audit-pack',
                label: 'Audit pack',
                value: 'Sealed',
                note: `On ${sealed.slice(0, 10)} · ${AUDIT_PACK_FILES.length} files, signed by the server.`,
                chip: 'signed',
                target: ids.pack,
              }
            : {
                id: 'audit-pack',
                label: 'Audit pack',
                value: 'Not sealed',
                note: `Not sealed yet · the first download seals its ${AUDIT_PACK_FILES.length} files.`,
                target: ids.pack,
              };

  return [record, pkg, testsFacet, pack];
}

/* --------------------------------------------------------- before go-live */

export interface TravelsOpen {
  key: string;
  title: string;
  detail: string;
}

/**
 * What travels open and named (L5): it does not block the handover; the package says it. Read from what is on
 * record — the code is a draft nobody compiled here, testing closed without a passing run, conditions of the decision
 * still open.
 */
export function travelsOpen(project: HandoverProject, facts: DeliveryFacts): TravelsOpen[] {
  const out: TravelsOpen[] = [];
  const code = facts.chain.find((l) => l.key === 'transformation');
  if (facts.parts.code && code?.state === 'on-record') {
    out.push({
      key: 'code-draft',
      title: 'The code is a draft, not activated',
      detail: 'Nothing here compiles or activates it in an SAP system. STATUS.md in the package says what is implemented, a stub, proposed or missing.',
    });
  }
  const closure = testingClosureReading(project as Parameters<typeof testingClosureReading>[0]);
  if (closure.state === 'current') {
    out.push({
      key: 'tests-closed',
      title: 'Testing closed without a passing run',
      detail: 'Not verified — your statement, with its reason, named in the package.',
    });
  }
  const decision = storedDecisionOf(project);
  const open = (decision?.conditions ?? []).filter((c) => c.status !== 'met');
  if (open.length > 0) {
    out.push({
      key: 'conditions',
      title: `${plural(open.length, 'condition')} of the decision ${open.length === 1 ? 'is' : 'are'} not met`,
      detail: open.map((c) => `${c.text} (${CONDITION_STATUS_LABEL[c.status].toLowerCase()})`).join('; '),
    });
  }
  return out;
}

/* ------------------------------------------------------------- proof table */

/** The four words of the proof table (L3), and "not yet" where nothing is on record. */
export type ProofStatus = 'signed' | 'sealed' | 'not-signed' | 'never' | 'not-yet';

export interface ProofRow {
  key: string;
  group: 'server' | 'yours' | 'not-signed';
  statement: string;
  /** What it rests on, in plain words. */
  restsOn: string;
  /** The pack file that carries it, where one does. */
  file: string | null;
  status: ProofStatus;
}

export const PROOF_GROUP_LABELS: Readonly<Record<ProofRow['group'], string>> = Object.freeze({
  server: 'Signed by the server',
  yours: 'Your word',
  'not-signed': 'Not signed',
});

/**
 * *What is proven, and what is not* — statement by statement (L3). One table replaces the chain boxes, "The pack's
 * own chain" and "What a signature covers". A row is *Signed* only while a signed run with its fingerprint is on
 * record; the target is *Sealed — your word* only once it is signed off; the decision and the test result are on the
 * project, not in the pack (L11), and never read as confirmed when nobody confirmed them (UX-138).
 */
export function proofRows(project: HandoverProject, facts: DeliveryFacts): ProofRow[] {
  const hasRun = !!str(project.activeRunId) && !project._runLoadFailed;
  const fp = project.auditMetadata?.inputFingerprint;
  const signed: ProofStatus = hasRun && fp ? 'signed' : 'not-yet';
  const mc = project.auditMetadata?.modelCard;
  const findings = facts.chain.find((l) => l.key === 'analysis');
  const target = signedOffTarget(project);
  const decision = storedDecisionOf(project);
  const confirmed = !!decision && decision.status === 'confirmed' && decisionIsCurrent(project, decision);
  const tests = facts.chain.find((l) => l.key === 'tests');
  const testing = facts.phases.find((p) => p.key === 'testing');
  const testResult = testing?.verifiedOutside || testing?.proven || testing?.closedUnverified;
  const anyPart = facts.parts.code || facts.parts.tests || facts.parts.documentation;
  return [
    {
      key: 'findings',
      group: 'server',
      statement: 'The findings of the analysis',
      restsOn: findings?.value ?? 'The findings of the signed run',
      file: '03-findings.csv',
      status: signed,
    },
    {
      key: 'source',
      group: 'server',
      statement: 'The source it read',
      restsOn: fp
        ? `SHA-256 fingerprint of ${fp.fileName ?? 'the source'}${typeof fp.lineCount === 'number' ? `, ${fp.lineCount} lines` : ''}, and every other input`
        : 'No input fingerprint is on record — run the analysis again',
      file: '01-input-fingerprint.json · 08-input-manifest.json',
      status: signed,
    },
    {
      key: 'recommendation',
      group: 'server',
      statement: 'The engine’s recommendation',
      restsOn: 'A recommendation, not a decision',
      file: '02-decision-record.json · 06-architecture-decision-record.md',
      status: signed,
    },
    {
      key: 'model',
      group: 'server',
      statement: 'Whether a model took part',
      restsOn: mc?.model
        ? `${mc.model} wrote the narrative; the server’s receipt of the call`
        : mc?.modelParticipation === 'none'
          ? 'No model took part — deterministic evidence only'
          : 'The model card of the run',
      file: '04-model-card.md',
      status: signed,
    },
    {
      key: 'limits',
      group: 'server',
      statement: 'What the engine cannot see',
      restsOn: 'Includes not uploaded, dynamic calls, constructs not assessed',
      file: '05-known-limitations.md',
      status: signed,
    },
    {
      key: 'target',
      group: 'yours',
      statement: 'The target and its sign-off',
      restsOn: target
        ? `${target} — signed off${str(project.approvedBy) ? ` by ${project.approvedBy}` : ''}`
        : 'Not signed off — the pack would record that no sign-off was given',
      file: '07-user-attested.md',
      status: target ? 'sealed' : 'not-yet',
    },
    {
      key: 'decision',
      group: 'yours',
      statement: 'The program decision',
      restsOn: confirmed
        ? `Confirmed${decision?.confirmation?.account ? ` by ${decision.confirmation.account}` : ''}, revision ${decision?.revision}. On the project, not in the pack`
        : decision
          ? 'Proposed, not confirmed. On the project, not in the pack'
          : 'Not confirmed. Nothing is recorded',
      file: null,
      status: confirmed ? 'not-signed' : 'not-yet',
    },
    {
      key: 'test-result',
      group: 'yours',
      statement: 'The test result',
      restsOn: testResult
        ? `${tests?.value ?? 'A result on record'}. On the project, not in the pack`
        : tests?.state === 'open'
          ? 'No tests yet'
          : 'Not run. Nothing is recorded',
      file: null,
      status: testResult ? 'not-signed' : 'not-yet',
    },
    {
      key: 'package',
      group: 'not-signed',
      statement: 'The package',
      restsOn: 'Code, tests, documentation, process, specification, slides. Its manifest names the signed run and the source fingerprint — checkable, never “from the signed run”',
      file: 'manifest.json of the package',
      status: anyPart ? 'not-signed' : 'not-yet',
    },
    {
      key: 'ai-text',
      group: 'not-signed',
      statement: 'AI-written text',
      restsOn: 'Function bodies, the narrative and business text — marked AI-generated in every file that holds them',
      file: null,
      status: 'not-signed',
    },
    {
      key: 'level',
      group: 'not-signed',
      statement: 'The clean core level',
      restsOn: 'The Level A–D grade is shown as “aims at”, never part of the signed pack',
      file: null,
      status: 'never',
    },
    {
      key: 'costs-views',
      group: 'not-signed',
      statement: 'Cost figures and the views',
      restsOn: 'Economics’ amounts and assumptions; the Business, IT and Management views',
      file: null,
      status: 'never',
    },
  ];
}

/** What is never in the signed pack (L10) — the side column's list. */
export const NEVER_IN_PACK: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['The clean core level (A–D)', 'shown as “aims at”, never signed'],
  ['Text a model wrote', 'function bodies, narrative, business text'],
  ['Generated files', 'code, tests, documentation, slides'],
  ['Cost figures', 'Economics’ amounts and assumptions'],
  ['Business, IT, Management', 'views only, never stored'],
] as const);

/* --------------------------------------------------------------- sections */

/** The page's sections, in page order — the "On this page" bar names them (L13); one list in `lib/page-anchors.ts`. */
export const DELIVERY_SECTION_IDS = PAGE_ANCHOR_IDS.delivery;
export type DeliverySectionIds = typeof DELIVERY_SECTION_IDS;

/* ------------------------------------------------------- the chain in words */

/** One link of the chain in plain words (UX review Q6): no chip, a sentence. */
export function linkInWords(link: HandoverLink): string {
  if (link.state === 'open') return `${link.label}: open${link.missing ? ` — ${link.missing.charAt(0).toLowerCase()}${link.missing.slice(1)}` : ''}`;
  if (link.state === 'stale') return `${link.label}: made for a previous source${link.value ? ` — ${link.value}` : ''}`;
  return `${link.label}: on record${link.value ? ` — ${link.value}` : ''}${link.by ? ` (${link.by})` : ''}`;
}

/** "Rebuild — confirmed by …" or why it is not — for the side column's status list. */
export function decisionWords(project: HandoverProject): string {
  const decision = storedDecisionOf(project);
  if (decision && decision.status === 'confirmed' && decisionIsCurrent(project, decision)) {
    return `Confirmed — your statement${decision.confirmation?.account ? ` (${decision.confirmation.account})` : ''}`;
  }
  return decision ? 'Proposed, not confirmed' : 'Not confirmed';
}

export { cap as capitalise };
