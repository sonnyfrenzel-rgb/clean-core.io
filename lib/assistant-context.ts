/**
 * "Ask this case" — context, never storage (roadmap 3.5.4, item 6), and anchors that go somewhere (item 5).
 *
 * **The reader's place is a hint.** The tool and the view the reader asks from go into the prompt as one line that
 * says it is a hint for what to put first and not evidence (`caseGroundingPrompt`). It is read from the address at
 * the moment of asking and kept nowhere: a view stays a view (ADR-018), never a field on a run, a decision or a
 * message.
 *
 * **The project's records become anchored facts.** The program decision (Keep, Rebuild, Move to SAP standard,
 * Retire), the route the engine recommends and the clean core level A–D of the objects the findings name are read
 * from what the product already serves — the decision record (`GET /api/projects/<id>/decision`), the project's
 * `extensibilityRoute`, the findings (`GET /api/projects/<id>/findings`) — and handed to the answer as facts with an
 * anchor: `[DECISION]`, `[ROUTE]`, and the finding's own line for a level. A sentence about them has to cite that
 * anchor like any other (`guardCaseAnswer`).
 *
 * **An anchor opens its place.** A line anchor opens the source line in the IT view when the reader is in it, and
 * otherwise selects the map element that holds the line in Business (`#L42`, `lib/analyze-entry.ts`); `[DECISION]`
 * opens Re-design's decision step, `[ROUTE]` the route in IT.
 *
 * Pure: no React, no Firestore, no `fetch`.
 */

import { PHASES } from './workflow-steps';
import { VIEW_LABELS, isWorkspaceView } from './workspace-model';
import { REDESIGN_LABEL, REDESIGN_SEGMENT, redesignHref, REDESIGN_DECIDE_ID } from './redesign';
import { DECISION_OPTION_LABELS, optionOfArchitecture } from './decision-options';
import { decisionHeadline, optionCodeOf } from './decision-manager';
import { cleanCoreLevel } from './clean-core-level';
import { routeLabel } from './sap-naming';
import { ANALYZE_IT_IDS } from './analyze-it';
import type { CaseFact } from './case-answer';
import type { ItFindingRow } from './it-findings';
import type { ProjectDecision, DecisionStatus } from './project-decision';

/* ---------------------------------------------------------- the reader's place */

export interface ReaderPlace {
  /** The tool's label (`Economics`, `Re-design`), or null outside a tool. */
  tool: string | null;
  /** The view's label in Analyze (`Business`, `IT`, `Management`), or null where there is none. */
  view: string | null;
}

/**
 * Where the reader is asking from, read from the address. Only names the product has: a segment that is not a tool
 * gives no tool, a `view` that is not a view gives no view — nothing the address carries reaches the prompt raw.
 */
export function readerPlace(pathname: string | null | undefined, search: string | null | undefined): ReaderPlace {
  const segment = /^\/project\/[^/?#]+\/([^/?#]+)/.exec(pathname ?? '')?.[1] ?? null;
  const phase = PHASES.find((p) => p.key === segment);
  const tool = phase ? phase.label : segment === REDESIGN_SEGMENT ? REDESIGN_LABEL : null;
  let view: string | null = null;
  if (phase?.key === 'analyze') {
    const asked = new URLSearchParams(search ?? '').get('view');
    view = VIEW_LABELS[isWorkspaceView(asked) ? asked : 'business'];
  }
  return { tool, view };
}

/** The one line of the prompt that says where the reader is, or null when the address names no tool. */
export function readerPlaceHint(place: ReaderPlace): string | null {
  if (!place.tool) return null;
  return place.view ? `${place.tool}, ${place.view} view` : `the ${place.tool} tool`;
}

/* ---------------------------------------------------------- the record facts */

/** The decision record as `GET /api/projects/<id>/decision` answers it — the parts read here. */
export interface DecisionRecordRead {
  draft?: Pick<ProjectDecision, 'bindings'> | null;
  stored?: (Pick<ProjectDecision, 'bindings'> & { status: DecisionStatus }) | null;
}

/** The program decision as a fact anchored to its record, or null when no option is on record. */
export function decisionFact(read: DecisionRecordRead | null | undefined): CaseFact | null {
  const record = read?.stored ?? null;
  if (!record || (record.status !== 'confirmed' && record.status !== 'draft')) return null;
  const optionRevision = record.bindings.find((b) => b.key === 'option')?.revision ?? null;
  const option = optionOfArchitecture(optionCodeOf(optionRevision));
  if (!option) return null;
  const headline = decisionHeadline(optionRevision);
  const label = DECISION_OPTION_LABELS[option];
  return {
    id: 'record:decision',
    kind: 'record',
    title: `The program decision on record is ${label}${headline !== label ? ` (${headline})` : ''}`,
    detail:
      record.status === 'confirmed'
        ? 'Confirmed by the signed-in owner as a self-declaration, not an organisational approval.'
        : 'Chosen and not yet confirmed: a draft.',
    anchor: 'DECISION',
    // A confirmed decision is the owner's self-declaration (`DESIGN.md` §4: Confirmed); a draft decides nothing yet.
    provenance: record.status === 'confirmed' ? 'confirmed' : 'not-determined',
  };
}

/** The route the engine recommends, as a fact anchored to the record. */
export function routeFact(route: string | null | undefined): CaseFact | null {
  if (typeof route !== 'string' || !route.trim()) return null;
  return {
    id: 'record:route',
    kind: 'record',
    title: `The route the engine recommends is ${routeLabel(route)}`,
    detail: 'Read from the signed analysis of this source.',
    anchor: 'ROUTE',
  };
}

/** The clean core level of each object a finding names, anchored to the finding's line; one per object. */
export function levelFacts(rows: readonly ItFindingRow[] | null | undefined): CaseFact[] {
  const out: CaseFact[] = [];
  const seen = new Set<string>();
  for (const row of rows ?? []) {
    if (!row.level || !row.objectName || seen.has(row.objectName)) continue;
    seen.add(row.objectName);
    const end = row.lineEnd && row.lineEnd > row.lineStart ? row.lineEnd : null;
    out.push({
      id: `level:${row.objectName}`,
      kind: 'level',
      title: `${row.objectName} is at clean core level ${row.level}`,
      detail: `${cleanCoreLevel(row.level).label}; from SAP's classification files, imported, not proof`,
      anchor: end ? `L${row.lineStart}-${end}` : `L${row.lineStart}`,
      technical: row.objectName,
    });
  }
  return out;
}

/** Every record fact there is for this project, in the order decision, route, levels. */
export function recordFacts(input: {
  decision?: DecisionRecordRead | null;
  route?: string | null;
  findings?: readonly ItFindingRow[] | null;
}): CaseFact[] {
  return [decisionFact(input.decision), routeFact(input.route), ...levelFacts(input.findings)].filter(
    (f): f is CaseFact => f !== null,
  );
}

/* ---------------------------------------------------------- where an anchor goes */

/**
 * What following an anchor does:
 *
 *   - `hash` — the reader is already on the page that shows it: set the address's fragment, and the page opens it
 *     (Business selects the map element that holds the line, IT opens the source at it);
 *   - `navigate` — go to the page that shows it.
 *
 * `null` for an anchor that names no place (neither lines nor a record).
 */
export type AnchorTarget = { kind: 'hash'; hash: string } | { kind: 'navigate'; href: string };

export function anchorTarget(
  anchor: string,
  projectId: string,
  pathname: string | null | undefined,
  search: string | null | undefined,
): AnchorTarget | null {
  const id = encodeURIComponent(projectId);
  const analyze = `/project/${id}/analyze`;
  const onAnalyze = (pathname ?? '').replace(/\/$/, '') === analyze || (pathname ?? '').replace(/\/$/, '') === `/project/${projectId}/analyze`;
  const view = new URLSearchParams(search ?? '').get('view');

  if (anchor === 'DECISION') return { kind: 'navigate', href: redesignHref(projectId, REDESIGN_DECIDE_ID) };
  if (anchor === 'ROUTE') {
    return onAnalyze && view === 'it'
      ? { kind: 'hash', hash: ANALYZE_IT_IDS.route }
      : { kind: 'navigate', href: `${analyze}?view=it#${ANALYZE_IT_IDS.route}` };
  }
  const lines = /^L(\d+)(?:-(\d+))?$/.exec(anchor);
  if (!lines) return null;
  const hash = lines[2] ? `L${lines[1]}-${lines[2]}` : `L${lines[1]}`;
  // The reader's own view where it shows code; Business (the map) everywhere else — Management shows no code.
  if (onAnalyze && view === 'it') return { kind: 'hash', hash };
  if (onAnalyze && (view === null || view === 'business')) return { kind: 'hash', hash };
  return { kind: 'navigate', href: `${analyze}#${hash}` };
}

/* ---------------------------------------------------------- an answer, read for display */

/** One piece of an answer as the panel shows it: plain text, an anchor that opens its place, or a glossary term. */
export type AnswerToken =
  | { kind: 'text'; text: string }
  | { kind: 'anchor'; anchor: string; text: string }
  | { kind: 'term'; key: string; text: string };

/** `[L7]`, `L7`, `[L380-412]`, `L380–L412`, `[DECISION]`, `[ROUTE]`. */
const ANCHOR_IN_TEXT = /\[(L\d+(?:\s*[-–]\s*L?\d+)?|DECISION|ROUTE)\]|\bL\d+(?:\s*[-–]\s*L?\d+)?\b/g;

function normaliseAnchor(raw: string): string {
  const m = /^L(\d+)(?:\s*[-–]\s*L?(\d+))?$/.exec(raw);
  if (!m) return raw;
  return m[2] && m[2] !== m[1] ? `L${m[1]}-${m[2]}` : `L${m[1]}`;
}

/** The offered anchor a written one stands for: as offered, or by its first line (how a range is usually shortened). */
function offeredFor(written: string, offered: readonly string[]): string | null {
  if (offered.includes(written)) return written;
  const first = written.split('-')[0];
  return offered.find((a) => a === first || a.split('-')[0] === first) ?? null;
}

/**
 * An answer, split into lines of tokens for display (roadmap 3.5.4 item 5, `DESIGN.md` §6.1):
 *
 *   - an anchor the answer rests on (`offered`) becomes an `anchor` token — something that opens its place; an anchor
 *     the answer does not rest on stays text, so nothing links to a place the answer did not cite;
 *   - a glossary term becomes a `term` token, once per answer, the longest name first (`findGlossaryMentions`).
 *
 * Paragraphs are separated by an empty line in the returned list (an empty array).
 */
export function answerTokens(
  text: string,
  offered: readonly string[],
  findTerms: (text: string) => Array<{ key: string; start: number; end: number }>,
): AnswerToken[][] {
  const seenTerms = new Set<string>();
  const termsIn = (chunk: string): AnswerToken[] => {
    const out: AnswerToken[] = [];
    let at = 0;
    for (const m of findTerms(chunk)) {
      if (seenTerms.has(m.key)) continue;
      seenTerms.add(m.key);
      if (m.start > at) out.push({ kind: 'text', text: chunk.slice(at, m.start) });
      out.push({ kind: 'term', key: m.key, text: chunk.slice(m.start, m.end) });
      at = m.end;
    }
    if (at < chunk.length) out.push({ kind: 'text', text: chunk.slice(at) });
    return out;
  };

  return text.split('\n').map((line) => {
    const out: AnswerToken[] = [];
    let at = 0;
    for (const m of line.matchAll(ANCHOR_IN_TEXT)) {
      const written = normaliseAnchor(m[1] ?? m[0]);
      const anchor = offeredFor(written, offered);
      if (!anchor) continue;
      const start = m.index ?? 0;
      if (start > at) out.push(...termsIn(line.slice(at, start)));
      out.push({ kind: 'anchor', anchor, text: written });
      at = start + m[0].length;
    }
    if (at < line.length) out.push(...termsIn(line.slice(at)));
    return out;
  });
}
