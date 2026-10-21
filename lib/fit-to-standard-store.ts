import {
  ACCOUNT_SETTABLE,
  countEntries,
  FIT_DISPOSITIONS,
  FIT_DISPOSITION_LABELS,
  type FitDesignCounts,
  type FitDisposition,
  type FitEntry,
  type FitToStandardDesign,
} from './fit-to-standard-design';
import type { FitGateClass } from './fit-to-standard-gate';
import type { ElementState } from './process-states';
import type { ObjectDropDecision } from './abap/public-cloud-fit';

/**
 * Stored fit-to-standard designs — roadmap 3.0.20, step F3
 * (`docs/design/fit-to-standard-concept.md` §4.1, §4.4).
 *
 * `projects/{id}/fit_to_standard/{revision}`, written only through the Admin
 * SDK (`app/api/projects/[projectId]/fit-to-standard/route.ts`) with
 * `DocumentReference.create()`, so a written revision is never written again.
 * `firestore.rules` has no match for the subcollection: no client reads or
 * writes it, and no rules change is needed. Revision 1 is the engine's
 * derivation and never changes; a confirmation is a new revision with the
 * account and the server's time — a self-declaration, never a proof.
 *
 * Beside the revisions the route keeps one summary on the project document,
 * `fitToStandard` (a key outside the client allowlist of `firestore.rules`, as
 * `keyUserAcceptance` is), so the phase contract, Management and Delivery read
 * what the design says without reading the subcollection.
 *
 * **Not signed, not evidence.** The design enters no run and no audit pack
 * (phase 1 of §5.4). A confirmation also writes one need revision
 * (`process_states`) so the to-be model of 3.6 follows from it.
 *
 * Pure: no Firestore, no clock (times are passed in).
 */

export const FIT_TO_STANDARD_COLLECTION = 'fit_to_standard';
export const FIT_REVISION_FORMAT_VERSION = 1;
export const MAX_FIT_NOTE = 1_000;
export const MAX_FIT_CHOICES = 500;

export interface FitAccount {
  uid: string;
  name: string;
}

export interface FitToStandardRevision {
  formatVersion: typeof FIT_REVISION_FORMAT_VERSION;
  revision: number;
  /** `engine`: the engine's derivation; `confirmation`: the account confirmed it, possibly with changes. */
  kind: 'engine' | 'confirmation';
  /** What it stands on — a new run or another source makes it stale. */
  runId: string | null;
  sourceSha256: string;
  edition: 'public' | 'private';
  engineVersion: string | null;
  gateClasses: FitGateClass[];
  againstGate: FitToStandardDesign['againstGate'];
  entries: FitEntry[];
  counts: FitDesignCounts;
  createdBy: FitAccount;
  /** Server clock, ISO 8601. */
  createdAt: string;
}

/** The summary on the project document — what the client reads. */
export interface FitToStandardSummary {
  revision: number;
  confirmed: boolean;
  runId: string | null;
  sourceSha256: string;
  edition: 'public' | 'private';
  gateClasses: FitGateClass[];
  /** True when the design was made against the gate (owner decision 3). */
  againstGate: boolean;
  counts: FitDesignCounts;
  /** The open gaps and the account's gaps, as the decision's conditions (owner decision 7). */
  conditions: FitCondition[];
  /** Who confirmed and when — null until a confirmation exists. */
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** Set when the confirmation also wrote a need revision. */
  needRevision: number | null;
  /** Objects only given-up steps use, as confirmed drops for the Retire bucket. Absent before a confirmation. */
  droppedObjects?: Record<string, ObjectDropDecision>;
}

export interface FitChoice {
  elementId: string;
  disposition: FitDisposition;
  note?: string | null;
}

export type FitChoiceCheck =
  | { ok: true; choices: FitChoice[] }
  | { ok: false; code: 'bad-request' | 'unknown-element' | 'not-settable' | 'note-too-long' | 'too-many' | 'note-required'; error: string };

/** A choice the account may make on this design — engine-only dispositions are refused, as is a step that never was a business step. */
export function checkFitChoices(value: unknown, entries: readonly FitEntry[]): FitChoiceCheck {
  if (value === undefined || value === null) return { ok: true, choices: [] };
  if (!Array.isArray(value)) return { ok: false, code: 'bad-request', error: 'Expected a list of choices.' };
  if (value.length > MAX_FIT_CHOICES) {
    return { ok: false, code: 'too-many', error: `One confirmation carries at most ${MAX_FIT_CHOICES} choices.` };
  }
  const byId = new Map(entries.map((e) => [e.elementId, e]));
  const out: FitChoice[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const c = raw as Partial<FitChoice> | null;
    if (!c || typeof c.elementId !== 'string' || typeof c.disposition !== 'string'
      || !(FIT_DISPOSITIONS as readonly string[]).includes(c.disposition)) {
      return { ok: false, code: 'bad-request', error: 'Every choice needs an element and one of the dispositions.' };
    }
    const entry = byId.get(c.elementId);
    if (!entry) {
      return { ok: false, code: 'unknown-element', error: `This design has no element ${c.elementId}. Reload it and confirm again.` };
    }
    if (!ACCOUNT_SETTABLE[c.disposition as FitDisposition] || entry.comparability !== 'business-comparable') {
      return {
        ok: false,
        code: 'not-settable',
        error: `${FIT_DISPOSITION_LABELS[c.disposition as FitDisposition].label} cannot be set on ${c.elementId}: only a business step takes a disposition, and "goes with the program" and "unknown" are the engine's reading.`,
      };
    }
    const note = typeof c.note === 'string' ? c.note.trim() : '';
    if (note.length > MAX_FIT_NOTE) {
      return { ok: false, code: 'note-too-long', error: `A note holds at most ${MAX_FIT_NOTE} characters.` };
    }
    if (c.disposition === 'gap-organisational' && note === '') {
      return { ok: false, code: 'note-required', error: `An organisational gap says what changes instead, for ${c.elementId}.` };
    }
    if (seen.has(c.elementId)) return { ok: false, code: 'bad-request', error: `${c.elementId} is chosen twice.` };
    seen.add(c.elementId);
    out.push({ elementId: c.elementId, disposition: c.disposition as FitDisposition, note: note === '' ? null : note });
  }
  return { ok: true, choices: out };
}

/**
 * The entries of a confirmation: the engine's entries with the account's
 * choices written over them. A confirmed `covered` step is the account's
 * acceptance after the workshop — E4, *Confirmed*, never *Proven*. An entry
 * the account did not touch keeps the engine's provenance and level: the
 * confirmation confirms the design as a whole, not a candidate nobody looked at.
 */
export function applyFitChoices(entries: readonly FitEntry[], choices: readonly FitChoice[]): FitEntry[] {
  const chosen = new Map(choices.map((c) => [c.elementId, c]));
  return entries.map((e) => {
    const c = chosen.get(e.elementId);
    if (!c) return e;
    const keepsRef = c.disposition === e.disposition || (c.disposition === 'covered' && e.standardRef !== null);
    return {
      ...e,
      disposition: c.disposition,
      provenance: 'confirmed',
      evidenceLevel: c.disposition === 'covered' ? 'E4' : e.evidenceLevel,
      standardRef: keepsRef ? e.standardRef : null,
      note: c.note ?? null,
      why: `Set by the account: ${FIT_DISPOSITION_LABELS[c.disposition].label.toLowerCase()}.${c.note ? ` ${c.note}` : ''}`,
    };
  });
}

/** One condition of a "Move to SAP standard" decision (owner decision 7). */
export interface FitCondition {
  elementId: string;
  /** `derived`: an open gap the engine reads — it cannot be attested away; `stated`: a gap the account resolved by key user or an organisational change. */
  basis: 'derived' | 'stated';
  disposition: 'gap-open' | 'gap-key-user' | 'gap-organisational';
  text: string;
  anchor: FitEntry['anchor'];
}

export function fitConditions(entries: readonly FitEntry[]): FitCondition[] {
  return entries
    .filter((e): e is FitEntry & { disposition: FitCondition['disposition'] } =>
      e.disposition === 'gap-open' || e.disposition === 'gap-key-user' || e.disposition === 'gap-organisational')
    .map((e) => {
      const name = e.plainLabel ?? e.label;
      const where = e.anchor ? ` (L${e.anchor.lineStart}${e.anchor.lineEnd > e.anchor.lineStart ? `–L${e.anchor.lineEnd}` : ''})` : '';
      const text = e.disposition === 'gap-open'
        ? `Open gap: "${name}"${where} — nothing covering it has been named.`
        : e.disposition === 'gap-key-user'
          ? `Key-user extension for "${name}"${where}${e.standardRef?.title ? ` (${e.standardRef.title})` : ''}.`
          : `Organisational change for "${name}"${where}${e.note ? `: ${e.note}` : ''}.`;
      return { elementId: e.elementId, basis: e.disposition === 'gap-open' ? 'derived' : 'stated', disposition: e.disposition, text, anchor: e.anchor };
    });
}

/** The need state a disposition maps to (§4.4), with its note — or null for a step that is not a need. */
export function needStateOf(entry: FitEntry): { state: ElementState; note: string } | null {
  switch (entry.disposition) {
    case 'given-up':
      return { state: 'drop', note: 'Given up in the confirmed fit-to-standard design: living with SAP standard.' };
    case 'covered':
      return { state: 'change', note: `Carried by SAP standard${entry.standardRef ? `: ${entry.standardRef.id}` : ''} (fit-to-standard design).` };
    case 'configuration':
      return { state: 'change', note: 'Becomes standard configuration (fit-to-standard design).' };
    case 'gap-key-user':
      return { state: 'change', note: `Covered by a key-user extension${entry.standardRef?.title ? ` (${entry.standardRef.title})` : ''} (fit-to-standard design).` };
    case 'gap-organisational':
      return { state: 'change', note: `Organisational change${entry.note ? `: ${entry.note}` : ''} (fit-to-standard design).` };
    case 'gap-open':
      return { state: 'clarify', note: 'Open gap in the fit-to-standard design: to clarify in the workshop.' };
    default:
      return null;
  }
}

/**
 * The need choices a confirmation writes: one per BPMN element of the
 * reconstructed process (revision 1) that was drawn from an entry's skeleton
 * node. An entry with no drawn element (an undrawn deviation) writes none.
 */
export function needChoicesOf(
  entries: readonly FitEntry[],
  elementsOfNode: ReadonlyMap<string, readonly string[]>,
): Array<{ subject: string; kind: 'element'; state: ElementState; note: string }> {
  const out: Array<{ subject: string; kind: 'element'; state: ElementState; note: string }> = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const need = needStateOf(e);
    if (!need) continue;
    for (const subject of elementsOfNode.get(e.elementId) ?? []) {
      if (seen.has(subject)) continue;
      seen.add(subject);
      out.push({ subject, kind: 'element', state: need.state, note: need.note });
    }
  }
  return out.sort((a, b) => (a.subject < b.subject ? -1 : a.subject > b.subject ? 1 : 0));
}

/**
 * The SAP and own objects that only given-up steps use — the confirmed drops the
 * four buckets read (`ObjectDropDecision`, rule 1 of `public-cloud-fit.ts`):
 * every reached line that names the object lies inside a given-up step (its
 * anchor, or the routine a call site performs). An object used anywhere else
 * stays where it was. Keyed by upper-cased object name.
 */
export function droppedObjectsOf(
  entries: readonly FitEntry[],
  nodes: ReadonlyArray<{ id: string; anchor: { lineStart: number; lineEnd: number; secondary?: { lineStart: number; lineEnd: number; reason: string } } | null }>,
  findings: ReadonlyArray<{ objectName?: string; lineStart: number; notReached?: boolean }>,
  made: { revision: number; confirmedAt: string; accountName: string },
): Record<string, ObjectDropDecision> {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const ranges: Array<{ lineStart: number; lineEnd: number; subject: string }> = [];
  for (const e of entries) {
    if (e.disposition !== 'given-up' || !e.anchor) continue;
    ranges.push({ ...e.anchor, subject: e.elementId });
    const sec = nodeById.get(e.elementId)?.anchor?.secondary;
    if (sec && sec.reason === 'routine-definition') ranges.push({ lineStart: sec.lineStart, lineEnd: sec.lineEnd, subject: e.elementId });
  }
  const uses = new Map<string, number[]>();
  for (const f of findings) {
    const name = (f.objectName ?? '').toUpperCase();
    if (!name || f.notReached) continue;
    uses.set(name, [...(uses.get(name) ?? []), f.lineStart]);
  }
  const out: Record<string, ObjectDropDecision> = {};
  for (const [name, lines] of [...uses].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const holders = lines.map((line) => ranges.find((r) => line >= r.lineStart && line <= r.lineEnd));
    if (holders.length === 0 || holders.some((h) => !h)) continue;
    out[name] = { subject: holders[0]!.subject, revision: made.revision, confirmedAt: made.confirmedAt, accountName: made.accountName };
  }
  return out;
}

/** The summary the project document carries, from a revision. */
export function summaryOf(rev: FitToStandardRevision, needRevision: number | null): FitToStandardSummary {
  const confirmed = rev.kind === 'confirmation';
  return {
    revision: rev.revision,
    confirmed,
    runId: rev.runId,
    sourceSha256: rev.sourceSha256,
    edition: rev.edition,
    gateClasses: rev.gateClasses,
    againstGate: rev.againstGate !== null,
    counts: countEntries(rev.entries),
    conditions: fitConditions(rev.entries),
    confirmedBy: confirmed ? rev.createdBy.name : null,
    confirmedAt: confirmed ? rev.createdAt : null,
    needRevision,
  };
}

/** Shape check of a stored summary — server-written, read defensively all the same. */
export function isFitToStandardSummary(value: unknown): value is FitToStandardSummary {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.revision === 'number'
    && typeof s.confirmed === 'boolean'
    && typeof s.sourceSha256 === 'string'
    && (s.runId === null || typeof s.runId === 'string')
    && (s.edition === 'public' || s.edition === 'private')
    && Array.isArray(s.conditions)
    && !!s.counts && typeof s.counts === 'object';
}

/** Does the summary stand on this project's current run and source? Anything else is stale. */
export function fitSummaryCurrent(
  summary: FitToStandardSummary | null | undefined,
  current: { runId: string | null; sourceSha256: string | null },
): boolean {
  if (!summary || !current.runId || !current.sourceSha256) return false;
  return summary.runId === current.runId && summary.sourceSha256 === current.sourceSha256;
}

/** The confirmed design on the current run, or null — the one reading phases, Management and Delivery use. */
export function confirmedFitDesign(project: {
  fitToStandard?: unknown;
  activeRunId?: unknown;
  inputFingerprint?: unknown;
  auditMetadata?: unknown;
}): FitToStandardSummary | null {
  const s = project.fitToStandard;
  if (!isFitToStandardSummary(s) || !s.confirmed) return null;
  const runId = typeof project.activeRunId === 'string' ? project.activeRunId : null;
  const top = (project.inputFingerprint as { sha256?: unknown } | undefined)?.sha256;
  const run = (project.auditMetadata as { inputFingerprint?: { sha256?: unknown } } | undefined)?.inputFingerprint?.sha256;
  const sha = typeof top === 'string' && top ? top : typeof run === 'string' && run ? run : null;
  return fitSummaryCurrent(s, { runId, sourceSha256: sha }) ? s : null;
}
