/**
 * What the Documentation tool is doing, from the moment it opens — roadmap
 * 3.0.13 (owner, dev acceptance 14.10.2026: "opening Documentation can sit for
 * a while with nothing visible happening").
 *
 * Five stages, always in this order, as Transformation shows its own
 * (`lib/transformation-chain.ts`): reading the signed run, reading the process
 * from the code, writing the process description (no model), writing the SOP
 * and the RACI (model), storing it. Each is derived from what the page holds —
 * never a timer — and the card ends in one of four ways: written, up to date,
 * stopped with its reason (and *Try again*), or nothing more to write and why.
 *
 * The times are stamped where the states change (`useStageClock` in the
 * component), so this stays pure: no React, no clock.
 */

import { DOCUMENTATION_MESSAGES as M, docEndFailed, docEndNothing } from './messages/documentation';

export const DOC_STAGE_ORDER = ['run', 'process', 'description', 'business', 'storing'] as const;
export type DocStageKey = (typeof DOC_STAGE_ORDER)[number];
export type DocStageState = 'pending' | 'active' | 'done' | 'failed' | 'skipped';

export interface DocPartView {
  index: number;
  steps: number;
  state: 'waiting' | 'writing' | 'written' | 'failed';
  startedAt: number | null;
  endedAt: number | null;
}

export interface DocProgressInput {
  /** The project and its run are being loaded. */
  loading: boolean;
  loadError: string | null;
  /** The source on the project is the one the active run signed. */
  signedSource: boolean;
  /** "668 lines of Z_MM_PO_APPROVAL.abap, signed by the active run" — the run stage's fact. */
  runFact: string | null;
  map: { status: 'idle' | 'loading' | 'ready' | 'failed'; reason: string | null; fact: string | null };
  description: {
    writing: boolean;
    error: string | null;
    /** A current engine document is on record. */
    onRecord: boolean;
    /** A blueprint from before 3.0.5 is on record and no engine document. */
    legacy: boolean;
    /** An invited reader: nothing is written on their visit. */
    reader: boolean;
    /** Why it is not written now (a stale basis, `generationBlockers`). */
    blocked: string | null;
  };
  business: {
    phase: 'idle' | 'model' | 'storing';
    error: string | null;
    /** Where the error happened: the model call or the store. */
    failedAt: 'model' | 'storing' | null;
    onRecord: boolean;
    /** Why the layer is not written on this visit — model off, a reader, another tab, a blocker. Null: it will be. */
    absence: string | null;
    /** The model availability is still being asked for. */
    availabilityLoading: boolean;
    /** "Expected: about 1–3 minutes (estimate)." — before and during the call. */
    expected: string | null;
    /** "One model call for 49 steps." or the parts line. */
    plan: string | null;
    parts: DocPartView[] | null;
  };
  /** What was written on this visit — the end says "written", not "up to date". */
  wrote: { description: boolean; business: boolean };
}

export interface DocStageView {
  key: DocStageKey;
  label: string;
  note: string;
  state: DocStageState;
  /** One sentence under the label: the reason of a stop or a skip, or what is happening right now. */
  detail: string | null;
  facts: string[];
}

export type DocProgressEnd =
  | { kind: 'running' }
  | { kind: 'written'; text: string }
  | { kind: 'up-to-date'; text: string }
  | { kind: 'failed'; stage: DocStageKey; reason: string; text: string }
  | { kind: 'nothing'; reason: string; text: string };

const LABEL: Record<DocStageKey, { label: string; note: string }> = {
  run: { label: M['doc.stage.run'], note: M['doc.stage.runNote'] },
  process: { label: M['doc.stage.process'], note: M['doc.stage.processNote'] },
  description: { label: M['doc.stage.description'], note: M['doc.stage.descriptionNote'] },
  business: { label: M['doc.stage.business'], note: M['doc.stage.businessNote'] },
  storing: { label: M['doc.stage.storing'], note: M['doc.stage.storingNote'] },
};

export function docStageLabel(key: DocStageKey): string {
  return LABEL[key].label;
}

type Partial5 = Record<DocStageKey, { state: DocStageState; detail: string | null; facts: string[] }>;

/** The five stages and the end, from what the page holds. */
export function documentationProgress(input: DocProgressInput): { stages: DocStageView[]; end: DocProgressEnd } {
  const s: Partial5 = {
    run: { state: 'pending', detail: null, facts: [] },
    process: { state: 'pending', detail: null, facts: [] },
    description: { state: 'pending', detail: null, facts: [] },
    business: { state: 'pending', detail: null, facts: [] },
    storing: { state: 'pending', detail: null, facts: [] },
  };
  const view = () => DOC_STAGE_ORDER.map((key) => ({ key, ...LABEL[key], ...s[key] }));
  const failed = (stage: DocStageKey, reason: string) => {
    s[stage] = { ...s[stage], state: 'failed', detail: reason };
    return { stages: view(), end: { kind: 'failed' as const, stage, reason, text: docEndFailed(LABEL[stage].label, reason) } };
  };
  const nothing = (from: DocStageKey, reason: string) => {
    const start = DOC_STAGE_ORDER.indexOf(from);
    DOC_STAGE_ORDER.forEach((key, i) => {
      if (i >= start) s[key] = { ...s[key], state: 'skipped', detail: i === start ? reason : null };
    });
    return { stages: view(), end: { kind: 'nothing' as const, reason, text: docEndNothing(reason) } };
  };
  const running = () => ({ stages: view(), end: { kind: 'running' as const } });

  /* 1 — the signed run */
  if (input.loadError) return failed('run', input.loadError);
  if (input.loading) {
    s.run.state = 'active';
    return running();
  }
  if (!input.signedSource) return nothing('run', M['doc.noSignedSource']);
  s.run = { state: 'done', detail: null, facts: input.runFact ? [input.runFact] : [] };

  /* 2 — the process, read from the code */
  if (input.map.status === 'failed') return failed('process', input.map.reason ?? 'The process could not be read back from this source.');
  if (input.map.status !== 'ready') {
    s.process.state = 'active';
    return running();
  }
  s.process = { state: 'done', detail: null, facts: input.map.fact ? [input.map.fact] : [] };

  /* 3 — the process description, no model */
  const d = input.description;
  if (d.error) return failed('description', d.error);
  if (d.writing) {
    s.description.state = 'active';
    return running();
  }
  if (!d.onRecord) {
    if (d.legacy) return nothing('description', M['doc.legacyOnRecord']);
    if (d.reader) return nothing('description', M['doc.ownerWrites']);
    if (d.blocked) return nothing('description', d.blocked);
    // The owner's page starts it in the same moment; until then it is what happens next.
    s.description.state = 'active';
    return running();
  }
  s.description = { state: 'done', detail: null, facts: [input.wrote.description ? M['doc.stage.writtenNow'] : M['doc.stage.onRecord']] };

  /* 4 and 5 — the SOP and the RACI, then the store */
  const b = input.business;
  const planFacts = [b.plan, b.expected].filter((x): x is string => !!x);
  if (b.error) {
    if (b.failedAt === 'storing') {
      s.business = { state: 'done', detail: null, facts: planFacts };
      return failed('storing', b.error);
    }
    s.business.facts = planFacts;
    return failed('business', b.error);
  }
  if (b.phase === 'model') {
    s.business = { state: 'active', detail: null, facts: planFacts };
    return running();
  }
  if (b.phase === 'storing') {
    s.business = { state: 'done', detail: null, facts: planFacts };
    s.storing.state = 'active';
    return running();
  }
  if (b.onRecord) {
    s.business = { state: 'done', detail: null, facts: input.wrote.business ? planFacts : [M['doc.stage.onRecord']] };
    s.storing = { state: 'done', detail: null, facts: [] };
    return input.wrote.description || input.wrote.business
      ? { stages: view(), end: { kind: 'written', text: M['doc.endWritten'] } }
      : { stages: view(), end: { kind: 'up-to-date', text: M['doc.endUpToDate'] } };
  }
  if (b.absence) return nothing('business', b.absence);
  // Nothing in the way and nothing on record: the call is about to start.
  s.business = {
    state: 'active',
    detail: b.availabilityLoading ? M['doc.stage.checkingModel'] : M['doc.stage.startingModel'],
    facts: planFacts,
  };
  return running();
}
