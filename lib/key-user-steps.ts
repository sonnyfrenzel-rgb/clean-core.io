/**
 * The key-user step list — what a key user does in the system instead of a
 * developer build (roadmap 3.0.19).
 *
 * When the decision is key user, the Transformation tool generates no code —
 * no scaffold, no model fill, no lease — and shows this list instead; Testing
 * turns the same steps into acceptance checks a key user runs in the system;
 * Economics prices configuration effort, not a build; the delivery package
 * carries the list as a document. A program whose parts split generates code
 * only for the code part (`codeParts`). Built by the engine from its key-user
 * reading (`lib/abap/key-user-candidates.ts`), deterministically and without a
 * model; nothing here names a BAdI, business context or view the reading does
 * not name.
 *
 * ## The exported types — for the screens that render it (part B)
 *
 * - `KeyUserStepList` — one per program: `scope` (`whole-program` · `partial`
 *   · `none`), `levelByConstruction` (`A` where the whole program is key user),
 *   the `steps` in the order a key user builds them, the `codeParts` that stay
 *   code (each with why and its lines — Transformation builds these and
 *   nothing else), the `effort` (counts only — Economics prices them with the
 *   account's own day rate for test/key-user work, ADR-035; no amount here),
 *   and the `note` every surface shows with it.
 * - `KeyUserStep` — one key-user tool applied to one object: the `app` to open
 *   (`Custom Fields`, `Custom Logic`, `Custom CDS Views`, `Custom Analytical
 *   Queries`, `Adapt UI`, `Custom Business Objects`), the `object` and its
 *   released view, the `context` (the business context, *not determined* with
 *   the check to make where the code cannot say), the `entries` to make
 *   (fields, rules, list fields, filters, screen changes), the `anchors` — the
 *   ABAP lines the step replaces (`role: 'replaced'`) or relies on (`uses`),
 *   1-based lines of the signed source —, the `limits` that decide whether the
 *   candidate holds, `dependsOn` (step ids built before it) and `checks`.
 * - `KeyUserAcceptanceCheck` — given / when / then, anchored to the lines whose
 *   behaviour it re-tests. Testing shows these as acceptance checks a key user
 *   runs; they are proposals derived from the code, not executed tests.
 * - `KeyUserCodePart` — a part that stays code (`verdict: 'code'`) or that the
 *   source does not show enough of to decide (`not-determined`), with the
 *   tool it would have been and why not.
 *
 * `keyUserStepsMarkdown()` writes the list as the document the delivery
 * package carries.
 *
 * Pure: no React, no Firestore, no engine import beyond types — client-safe.
 */

import type {
  KeyUserAnchor,
  KeyUserCandidate,
  KeyUserItem,
  KeyUserLimit,
  KeyUserReading,
  KeyUserScope,
  KeyUserTool,
} from './abap/key-user-candidates';

export type { KeyUserAnchor, KeyUserItem, KeyUserLimit, KeyUserScope, KeyUserTool };

/** One acceptance check a key user runs in the system once the step is built. */
export interface KeyUserAcceptanceCheck {
  /** `<step id>.<n>`, e.g. `S2.1`. */
  id: string;
  given: string;
  when: string;
  then: string;
  /** The lines of the original whose behaviour the check re-tests. */
  lines: number[];
}

export interface KeyUserStep {
  /** `S1`, `S2` … in build order. */
  id: string;
  /** The candidate of the engine's reading (`KU-…`). */
  candidateId: string;
  tool: KeyUserTool;
  app: string;
  /** One line: what is built, on what. */
  title: string;
  object: KeyUserCandidate['object'];
  /** The business context or app context; `determined: false` with the check where the code does not say. */
  context: { determined: boolean; text: string; check: string | null };
  entries: KeyUserItem[];
  anchors: KeyUserAnchor[];
  limits: KeyUserLimit[];
  /** Step ids that have to exist first. */
  dependsOn: string[];
  checks: KeyUserAcceptanceCheck[];
}

export interface KeyUserCodePart {
  /** The rejection of the engine's reading (`KU-R…`). */
  id: string;
  part: string;
  wouldBe: KeyUserTool;
  verdict: 'code' | 'not-determined';
  reason: string;
  anchors: KeyUserAnchor[];
}

export interface KeyUserStepList {
  scope: KeyUserScope;
  levelByConstruction: 'A' | null;
  /** The engine's sentence for the reading. */
  sentence: string;
  steps: KeyUserStep[];
  codeParts: KeyUserCodePart[];
  /** Counts for Economics: configuration, not a build. No amount — the account's day rate prices it. */
  effort: { steps: number; entries: number; checks: number; byTool: Partial<Record<KeyUserTool, number>> };
  note: string;
}

/** Shown with the list wherever it appears. */
export const KEY_USER_STEPS_NOTE =
  'A step list, not code: each step is a candidate the engine read from the code, and it holds only once its limits are checked in the target system. Nothing here is a promise that SAP offers the BAdI, business context or view for your edition and release.';

const ORDER: readonly KeyUserTool[] = [
  'custom-field',
  'custom-business-configuration',
  'custom-business-object',
  'custom-logic',
  'custom-cds-view',
  'custom-analytical-query',
  'adapt-ui',
];

const lines = (anchors: readonly KeyUserAnchor[]) => [...new Set(anchors.flatMap((a) => (a.lineStart === a.lineEnd ? [a.lineStart] : [a.lineStart, a.lineEnd])))].sort((x, y) => x - y);
const listWords = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function titleOf(c: KeyUserCandidate): string {
  const fields = c.items.filter((i) => i.kind === 'field').map((i) => i.name);
  switch (c.tool) {
    case 'custom-field':
      return `Create the custom field${fields.length > 1 ? 's' : ''} ${listWords(fields)} on ${c.object.name}`;
    case 'custom-business-configuration':
      return `Create a configuration object for the settings of ${c.object.name}`;
    case 'custom-business-object':
      return `Create a custom business object for the records of ${c.object.name}`;
    case 'custom-logic':
      return `Implement the rules of ${c.part.name} in custom logic${c.object.standardTable ? ` for ${c.object.standardTable}` : ''}`;
    case 'custom-cds-view':
      return `Build the list of ${c.part.name} as a custom CDS view on ${listWords(c.object.releasedViews)}`;
    case 'custom-analytical-query':
      return `Build the list of ${c.part.name} as a custom analytical query over ${listWords(c.object.releasedViews)}`;
    case 'adapt-ui':
      return `Adapt the UI as ${c.part.name} did: ${listWords(c.items.map((i) => i.detail.replace(/\.$/, '').toLowerCase()))}`;
  }
}

function contextOf(c: KeyUserCandidate): KeyUserStep['context'] {
  const limit = c.limits.find((l) => l.kind === 'context-not-determined' || l.kind === 'release-not-determined');
  if (c.tool === 'custom-business-configuration' || c.tool === 'custom-business-object') {
    return { determined: true, text: `A new object of the customer's, named after ${c.object.name}.`, check: null };
  }
  return { determined: false, text: limit?.text ?? 'Not determined from the code.', check: limit?.check ?? null };
}

/** given / when / then for one candidate — derived from its entries, never invented. */
function checksOf(stepId: string, c: KeyUserCandidate): KeyUserAcceptanceCheck[] {
  const out: Omit<KeyUserAcceptanceCheck, 'id'>[] = [];
  const all = lines(c.anchors);
  switch (c.tool) {
    case 'custom-field':
      for (const f of c.items.filter((i) => i.kind === 'field')) {
        out.push({ given: `the custom field ${f.name} is published for ${c.object.name}`, when: `a key user opens a ${c.object.name} record in the app and in a CDS view of its business context`, then: `${f.name} is shown, can be entered and is read where the original read it`, lines: f.lines });
      }
      break;
    case 'custom-business-configuration':
    case 'custom-business-object':
      out.push({ given: `the rows of ${c.object.name} are taken over into the new object`, when: 'the object is listed in its app', then: `it holds the same rows and values as ${c.object.name}${c.items.length ? ` (${listWords(c.items.map((i) => i.name))})` : ''}`, lines: all });
      break;
    case 'custom-logic': {
      const conditions = c.items.filter((i) => i.kind === 'condition');
      for (const item of c.items) {
        if (item.kind !== 'derivation' && item.kind !== 'check') continue;
        // The lines of the conditions it stands under, as far as the reading names them.
        const at = conditions.filter((k) => item.condition && item.condition.includes(k.detail.replace(/^(?:IF|ELSEIF)\s+/i, ''))).flatMap((k) => k.lines);
        out.push({
          given: item.condition ? `a record where ${item.condition}` : 'any record the original handled',
          when: 'the custom logic runs at the point the original was called',
          then: item.kind === 'derivation' ? `it sets ${item.detail}` : `it reports: ${item.detail}`,
          lines: [...new Set([...at, ...item.lines])].sort((x, y) => x - y),
        });
      }
      if (!out.length) out.push({ given: 'a record the original handled', when: 'the custom logic runs', then: 'the result equals the original\'s', lines: all });
      break;
    }
    case 'custom-cds-view':
    case 'custom-analytical-query': {
      const filters = c.items.filter((i) => i.kind === 'filter').map((i) => i.name);
      out.push({
        given: `the same selection as the original${filters.length ? ` (${listWords(filters)})` : ''}`,
        when: `the ${c.tool === 'custom-analytical-query' ? 'query' : 'view'} and the original run on the same data`,
        then: c.tool === 'custom-analytical-query' ? 'the totals per group equal the original list\'s' : 'the rows and fields equal the original list\'s',
        lines: all,
      });
      break;
    }
    case 'adapt-ui':
      for (const item of c.items) out.push({ given: 'the adapted app', when: 'a user opens it', then: `${item.name}: ${item.detail.replace(/\.$/, '').toLowerCase()}`, lines: item.lines });
      break;
  }
  return out.map((x, i) => ({ id: `${stepId}.${i + 1}`, ...x }));
}

/** The step list of a key-user reading, or null where the run has none (an engine before 3.0.19). */
export function buildKeyUserSteps(reading: KeyUserReading | null | undefined): KeyUserStepList | null {
  if (!reading) return null;
  const ordered = [...reading.candidates].sort((a, b) => ORDER.indexOf(a.tool) - ORDER.indexOf(b.tool) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  const idOf = new Map(ordered.map((c, i) => [c.id, `S${i + 1}`]));
  const steps: KeyUserStep[] = ordered.map((c) => {
    const id = idOf.get(c.id)!;
    // Built before it: the fields it reads, the own objects it reads.
    const usesFields = (c.tool !== 'custom-field')
      ? ordered.filter((o) => o.tool === 'custom-field' && o.items.some((f) => f.lines.some((l) => c.anchors.some((a) => l >= a.lineStart && l <= a.lineEnd)))).map((o) => idOf.get(o.id)!)
      : [];
    const usesObjects = ordered
      .filter((o) => (o.tool === 'custom-business-configuration' || o.tool === 'custom-business-object') && o.id !== c.id)
      .filter((o) => c.limits.some((l) => l.kind === 'data-source' && l.text.includes(o.object.name)) || c.items.some((i) => i.kind === 'data-source' && i.name === o.object.name))
      .map((o) => idOf.get(o.id)!);
    return {
      id,
      candidateId: c.id,
      tool: c.tool,
      app: c.app,
      title: titleOf(c),
      object: c.object,
      context: contextOf(c),
      entries: c.items,
      anchors: c.anchors,
      limits: c.limits,
      dependsOn: [...new Set([...usesFields, ...usesObjects])].filter((d) => d !== id).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })),
      checks: checksOf(id, c),
    };
  });
  const byTool: Partial<Record<KeyUserTool, number>> = {};
  for (const s of steps) byTool[s.tool] = (byTool[s.tool] ?? 0) + 1;
  return {
    scope: reading.scope,
    levelByConstruction: reading.levelByConstruction,
    sentence: reading.sentence,
    steps,
    codeParts: reading.rejected.map((r) => ({ id: r.id, part: r.part.name, wouldBe: r.wouldBe, verdict: r.verdict, reason: r.reason, anchors: r.anchors })),
    effort: {
      steps: steps.length,
      entries: steps.reduce((n, s) => n + s.entries.length, 0),
      checks: steps.reduce((n, s) => n + s.checks.length, 0),
      byTool,
    },
    note: KEY_USER_STEPS_NOTE,
  };
}

const lineList = (xs: readonly number[]) => (xs.length ? `line${xs.length > 1 ? 's' : ''} ${xs.join(', ')}` : 'no line');
const anchorText = (a: KeyUserAnchor) => (a.lineStart === a.lineEnd ? `L${a.lineStart}` : `L${a.lineStart}–${a.lineEnd}`);

/** The step list as the document the delivery package carries (Markdown). */
/**
 * Key user is SAP-released and Level A, and still a company may restrict or exclude it in its own clean core
 * programme (owner 21.10.2026). Said wherever the route is offered: the design comparison, the sign-off choice and
 * the package's step list. The reasons named are the ones SAP's own material makes visible — the logic apps carry an
 * in-app ABAP editor, key-user and developer extensibility objects cannot use each other by default, and a field
 * that has been transported cannot simply be deleted — plus the governance question that follows from them.
 */
export const KEY_USER_COMPANY_POLICY =
  'Key-user extensibility is a path SAP releases, and Level A — but your company may restrict it or rule it out in its own clean core programme. Common reasons: logic maintained by business key users sits outside the development toolchain (code review, ATC, automated tests, the developer transport pipeline); the logic apps still contain an ABAP editor; key-user and developer extensibility objects cannot use each other by default, so moving a key-user extension to developer extensibility later means rebuilding it; and a field that has been transported cannot simply be deleted. Check your company’s extensibility policy and who owns key-user changes before you choose this route.';

export function keyUserStepsMarkdown(list: KeyUserStepList, subject: string): string {
  const out: string[] = [`# Key-user step list — ${subject}`, '', list.sentence, '', `> ${list.note}`, ''];
  if (list.levelByConstruction) out.push(`Clean core level ${list.levelByConstruction} by construction: key-user extensions use released extension points only.`, '');
  out.push(`> **Your company's policy:** ${KEY_USER_COMPANY_POLICY}`, '');
  for (const s of list.steps) {
    out.push(`## ${s.id} · ${s.app} — ${s.title}`, '');
    out.push(`- Replaces or relies on: ${s.anchors.map((a) => `${anchorText(a)} (${a.what})`).join('; ')}`);
    out.push(`- Context: ${s.context.text}${s.context.check ? ` Check: ${s.context.check}` : ''}`);
    if (s.dependsOn.length) out.push(`- After: ${s.dependsOn.join(', ')}`);
    if (s.entries.length) {
      out.push('', '| Entry | What | Lines |', '|---|---|---|');
      for (const e of s.entries) out.push(`| ${e.kind} · ${e.name.replace(/\|/g, '\\|')} | ${e.detail.replace(/\|/g, '\\|')} | ${e.lines.join(', ')} |`);
    }
    const otherLimits = s.limits.filter((l) => l.text !== s.context.text);
    if (otherLimits.length) {
      out.push('', 'Limits:');
      for (const l of otherLimits) out.push(`- ${l.text}${l.check ? ` Check: ${l.check}` : ''}`);
    }
    if (s.checks.length) {
      out.push('', 'Acceptance checks:');
      for (const c of s.checks) out.push(`- ${c.id} Given ${c.given}, when ${c.when}, then ${c.then} (${lineList(c.lines)}).`);
    }
    out.push('');
  }
  if (list.codeParts.length) {
    out.push('## What stays code', '');
    for (const p of list.codeParts) out.push(`- ${p.id} ${p.part} (${p.verdict === 'code' ? 'stays code' : 'not determined'}): ${p.reason} ${p.anchors.map(anchorText).join(', ')}`);
    out.push('');
  }
  return out.join('\n');
}
