import { FUNCTION_TERMS_EN, TABLE_TERMS_EN, TRANSACTION_TERMS_EN } from '@/lib/abap/plain-glossary';
import { isCustomerObject } from '@/lib/abap/abcd-classification';
import type { DocAnchor } from '@/lib/process-documentation';
import type { PdQuestion, PdQuestionTheme } from '@/lib/process-document';

/**
 * Business words for the process description (owner 04.10.2026: "linguistically
 * complicated … to the point and more concise").
 *
 * The engine names what it read by the program's names — `EBAN`,
 * `BAPI_PO_CREATE1`, `ZMM_PO_APPR`. A business reader needs "the purchase
 * requisition", "creates the purchase order", "a custom table". These helpers
 * turn the first into the second and hand back the names they took out, so the
 * caller can show them in a muted source column: nothing is lost, it is moved
 * aside. They only use the product's glossary (`lib/abap/plain-glossary.ts`);
 * a name the glossary does not know is counted ("2 custom tables"), never
 * guessed.
 *
 * Pure: no clock, no network, the same input gives the same words.
 */

const lcFirst = (w: string) => (/^[A-Z]{2,}/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1));
export const capFirst = (w: string) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "the purchase requisition" for a table the glossary knows; null for one it does not. */
export function tableWord(name: string): string | null {
  const term = TABLE_TERMS_EN[name.toLowerCase()];
  return term ? `the ${lcFirst(term.singular)}` : null;
}

/**
 * Tables in business words: the ones the glossary knows by name (at most
 * `max`), the rest counted. "the purchase requisition, the supplier and 8 more
 * tables"; "2 custom tables".
 */
export function tablesPhrase(names: readonly string[], max = 2): string {
  const unique = [...new Set(names.map((n) => n.toUpperCase()))];
  const known = unique.filter((n) => tableWord(n)).map((n) => tableWord(n)!);
  const unknown = unique.filter((n) => !tableWord(n));
  const shown = [...new Set(known)].slice(0, max);
  const rest = known.length - shown.length + unknown.length;
  if (!shown.length) {
    const custom = unknown.every(isCustomerObject);
    return rest === 1 ? (custom ? 'a custom table' : 'an SAP table') : `${rest} ${custom ? 'custom' : ''} tables`.replace('  ', ' ');
  }
  return rest > 0 ? joinAnd([...shown, plural(rest, 'more table', 'more tables')]) : joinAnd(shown);
}

/** "Convert currency" → "converts currency": a glossary term is an imperative; the description speaks in the third person. */
export function thirdPerson(phrase: string): string {
  const [verb, ...rest] = phrase.trim().split(/\s+/);
  const v = verb.toLowerCase();
  const s = /(s|sh|ch|x|z)$/.test(v) ? `${v}es` : /[^aeiou]y$/.test(v) ? `${v.slice(0, -1)}ies` : `${v}s`;
  return [s, ...rest.map((w) => lcFirst(w))].join(' ');
}

/** What a called function or transaction does, in the glossary's words; null when it does not know it. */
export function callWord(name: string): string | null {
  const n = name.toUpperCase();
  return FUNCTION_TERMS_EN[n] ?? TRANSACTION_TERMS_EN[n] ?? null;
}

/**
 * One plain line for a step of the main path, counted from what it touches:
 * "Reads the purchase requisition; converts currency; can end early."
 */
export function plainStepLine(
  reads: ReadonlyArray<{ name: string }>,
  writes: ReadonlyArray<{ name: string }>,
  calls: ReadonlyArray<{ name: string }>,
  early: number,
): string {
  const line = (max: number) => {
    const parts: string[] = [];
    if (reads.length) parts.push(`reads ${tablesPhrase(reads.map((r) => r.name), max)}`);
    if (writes.length) parts.push(`changes ${tablesPhrase(writes.map((w) => w.name), max)}`);
    const known = [...new Set(calls.map((c) => callWord(c.name)).filter((w): w is string => !!w).map(thirdPerson))];
    const unknown = calls.filter((c) => !callWord(c.name)).length;
    parts.push(...known.slice(0, max));
    const more = known.length - Math.min(known.length, max) + unknown;
    if (more > 0) parts.push(`calls ${plural(more, known.length ? 'more SAP function' : 'SAP function', known.length ? 'more SAP functions' : 'SAP functions')}`);
    if (early > 0) parts.push('can end early');
    return parts.length ? `${capFirst(parts.join('; '))}.` : '';
  };
  // One line, ≤ 20 words: a step that touches much names fewer things and counts the rest.
  const long = line(2);
  return long.split(/\s+/).length <= 20 ? long : line(1);
}

/**
 * A sentence with the program's names taken out: a name in parentheses goes,
 * a table the glossary knows becomes its business word, a custom one "a custom
 * table", a transaction "a transaction". Returns the plain text and the names.
 */
export function plainOf(text: string, objects: readonly string[] = []): { text: string; names: string[] } {
  const names: string[] = [];
  let out = text.replace(/\s*\(([A-Z][A-Z0-9_/]{2,})\)/g, (_, name: string) => {
    names.push(name);
    return '';
  });
  out = out.replace(/\btransaction ([A-Z][A-Z0-9_]{2,})\b/g, (_, code: string) => {
    names.push(code);
    return 'a transaction';
  });
  for (const o of objects) {
    const re = new RegExp(`\\b${o.replace(/[^\w/]/g, '')}\\b`, 'g');
    if (!re.test(out)) continue;
    names.push(o);
    out = out.replace(re, tableWord(o) ?? (isCustomerObject(o) ? 'a custom table' : 'an SAP object'));
  }
  return { text: out.replace(/\s{2,}/g, ' ').trim(), names: [...new Set(names)] };
}

/* ------------------------------------------------------------ open questions */

/** Where a question comes from — the engine's own gap, a functional or a non-functional question, or the coverage sweep. */
export type QuestionOrigin =
  | { kind: 'gap'; subject: string }
  | { kind: 'fr'; topic: string }
  | { kind: 'nfr'; category: string }
  | { kind: 'coverage'; what: 'include' | 'dynamic' };

/** A question as the readers wrote it, before it is grouped and worded for the reader. */
export interface RawQuestion {
  id: string;
  owner: PdQuestion['owner'];
  question: string;
  why: string;
  anchors: DocAnchor[];
  origin: QuestionOrigin;
}

function themeOf(origin: QuestionOrigin): PdQuestionTheme {
  switch (origin.kind) {
    case 'gap':
      return origin.subject === 'Duration' ? 'operations' : 'ownership';
    case 'coverage':
      return 'source';
    case 'fr':
      if (origin.topic === 'authorization') return 'audit';
      if (origin.topic === 'dynamic-call') return 'source';
      if (origin.topic === 'retention') return 'takeover';
      if (origin.topic === 'volume') return 'operations';
      return 'rules';
    case 'nfr':
      if (origin.category === 'migration' || origin.category === 'retention') return 'takeover';
      if (origin.category === 'audit' || origin.category === 'authorization') return 'audit';
      if (origin.category === 'cutover') return 'cutover';
      return 'operations';
  }
}

/** What an open question holds up: a design needs the rules and the source; a cutover needs the data and the date. */
function blocksOf(origin: QuestionOrigin): PdQuestion['blocks'] {
  if (origin.kind === 'coverage') return 'design';
  if (origin.kind === 'fr' && ['currency', 'unreached-rule', 'dynamic-call'].includes(origin.topic)) return 'design';
  if (origin.kind === 'nfr' && (origin.category === 'migration' || origin.category === 'cutover')) return 'cutover';
  return null;
}

/** "its custom table" / "its 2 custom tables" / "the purchase requisition and its custom table". */
function ownTablesPhrase(names: readonly string[]): string {
  const unique = [...new Set(names)];
  if (unique.every(isCustomerObject)) return unique.length === 1 ? 'its custom table' : `its ${unique.length} custom tables`;
  return tablesPhrase(unique, 3);
}

interface Worded {
  /** Same key, one question: near-identical questions about different tables are asked once. */
  key: string;
  names: string[];
  render: (names: string[]) => string;
}

const TECH = /\b[A-Z][A-Z0-9]*_[A-Z0-9_/]+\b|\b[a-z][a-z0-9]*_[a-z0-9_-]+\b/;
const stripLines = (q: string) => q.replace(/\s+at L\d+(?:[-–]\d+)?/g, '').replace(/\s+at lines? \d+(?:[-–]\d+)?/g, '');

/** One plain line for a question the readers wrote — the templates are this product's own, so they are known. */
function word(raw: RawQuestion): Worded {
  const q = raw.question.trim();
  let m: RegExpExecArray | null;
  const fixed = (text: string, names: string[] = []): Worded => ({ key: `fixed:${text}`, names, render: () => text });

  if ((m = /^Is (BR-\d+) \((.+)\) still a requirement\?$/.exec(q))) {
    return fixed(`Is rule ${m[1]} still needed, although the program never reaches it?`, TECH.test(m[2]) || /\bCASE\b|'/.test(m[2]) ? [m[2]] : []);
  }
  if ((m = /^(?:What is )?(the .+?) in (BR-\d+) \('?([^')]+)'?\)\?$/i.exec(q))) {
    return fixed(`What is ${lcFirst(m[1])} ${m[3]} in rule ${m[2]}?`);
  }
  if ((m = /^Are any of the (\d+) routines? the program never calls still needed \((.+)\)\?$/.exec(q))) {
    return fixed(`Are any of the ${m[1]} routines the program never calls still needed?`, [m[2]]);
  }
  if ((m = /^Which function module does (.+) call at L\d+\?$/.exec(q))) {
    return fixed(`Which function does ${m[1]} call? Its name is set at run time.`);
  }
  if ((m = /^Who owns authorization object (\S+), and which roles may pass the check\?$/.exec(q))) {
    return fixed('Who owns the authorization this program checks, and which roles pass it?', [m[1]]);
  }
  if ((m = /^Which business roles shall grant (\S+?)(?: with ACTVT ([^,?]+))?(?:, and for which (.+) values)?\?$/.exec(q))) {
    return fixed('Which business roles may pass the authorization check, and with which limits?', [m[1], m[2] ? `ACTVT ${m[2]}` : '', m[3] ?? ''].filter(Boolean));
  }
  if ((m = /^What shall happen when a user fails the (\S+) check at L\d+\?$/.exec(q))) {
    return fixed('What shall happen when a user fails the authorization check?', [m[1]]);
  }
  if ((m = /^Must the record in (\S+) also say who ran the program\?$/.exec(q))) {
    return fixed('Must the record it keeps also say who ran the program?', [m[1]]);
  }
  if ((m = /^Must the changes this program makes to (\S+) be traceable — who changed what, and when\?$/.exec(q))) {
    return fixed(`Must its changes to ${tableWord(m[1]) ?? 'a custom table'} be traceable — who changed what, and when?`, [m[1]]);
  }
  if ((m = /^(.+?) \(([^)]*[A-Z_]{3,}[^)]*)\)\?$/.exec(q)) && /through this program/.test(q)) {
    return fixed(`${m[1]}?`, [m[2]]);
  }
  if ((m = /^What shall happen when (\S+) reports an error\?$/.exec(q))) {
    const w = callWord(m[1]);
    return fixed(`What shall happen when ${w ? `“${w}”` : 'the SAP function'} reports an error?`, [m[1]]);
  }
  if ((m = /^Shall a failed call of (.+?) be retried — how often, and how far apart\?$/.exec(q))) {
    return fixed('Shall a failed SAP call be retried — how often, and how far apart?', [m[1]]);
  }
  if ((m = /^Who maintains (.+) after the switch, and is the current content still correct\?$/.exec(q))) {
    const names = m[1].split(/,\s*|\s+and\s+/).filter(Boolean);
    return fixed(`Who maintains ${names.every(isCustomerObject) ? (names.length === 1 ? 'the custom table it reads' : `the ${names.length} custom tables it reads`) : tablesPhrase(names, 3)} after the switch, and is their content still correct?`, names);
  }
  if ((m = /^Which existing rows of (\S+) must be taken over — all, or only from a certain date\?$/.exec(q))) {
    return { key: 'takeover', names: [m[1]], render: (n) => `Which existing rows of ${ownTablesPhrase(n)} must be taken over — all, or only from a date?` };
  }
  if ((m = /^How long must rows of (\S+) be kept, and what happens to them after that\?$/.exec(q))) {
    return { key: 'retention', names: [m[1]], render: (n) => `How long must rows of ${ownTablesPhrase(n)} be kept, and what happens to them then?` };
  }
  if ((m = /^How long must the entries written to (\S+) be kept, and who may read them\?$/.exec(q))) {
    return { key: 'fr-retention', names: [m[1]], render: (n) => `How long must entries of ${ownTablesPhrase(n)} be kept, and who may read them?` };
  }
  // The long questions of the non-functional reading, said shorter; the engine's wording stays in `original`.
  const SHORTER: Record<string, string> = {
    'When does the new solution take over, and is there a period in which both run — for how long, and which one makes the changes?':
      'When does the new solution take over, and how long do both run side by side?',
    'How many records does one run handle, how often does it run, and by when must it finish?':
      'How many records per run, how often, and by when must a run finish?',
    'When must the process be available, and what is an acceptable response time for one case?':
      'Which availability and response time must the process meet?',
    'Are the workflow items still open at the switch finished in the old process, or moved to the new one?':
      'Are workflow items open at the switch finished in the old process, or moved?',
    'Which changes must be saved together, and what does a restart after a failure do?':
      'Which changes must be saved together, and how does a restart after a failure work?',
  };
  if (SHORTER[q]) return fixed(SHORTER[q]);
  if ((m = /^What does the include (\S+) do\? Its source was not uploaded with the program\.$/.exec(q))) {
    return {
      key: 'include',
      names: [m[1]],
      render: (n) => (n.length === 1 ? 'What does the include do whose source was not uploaded?' : `What do the ${n.length} includes do whose source was not uploaded?`),
    };
  }
  // Any other: the line references go (the anchors carry them), a parenthesis of names moves aside.
  const names: string[] = [];
  const text = stripLines(q).replace(/\s*\(([^)]*\b[A-Z][A-Z0-9]*_[A-Z0-9_]+\b[^)]*)\)/g, (_, inner: string) => {
    names.push(inner);
    return '';
  });
  return fixed(text, names);
}

/**
 * The open questions as a reader works through them: worded plainly, two
 * near-identical questions asked once, grouped by theme, what blocks the
 * design or the cutover first in its theme, numbered Q1, Q2 …. The source
 * ids stay in `refs` for the trace.
 */
export function readerQuestions(raw: readonly RawQuestion[], themeOrder: readonly PdQuestionTheme[]): PdQuestion[] {
  const merged = new Map<string, { worded: Worded; items: RawQuestion[]; names: string[] }>();
  const order: string[] = [];
  for (const r of raw) {
    const w = word(r);
    const key = `${themeOf(r.origin)}|${w.key}`;
    const held = merged.get(key);
    if (held) {
      held.items.push(r);
      held.names.push(...w.names);
      continue;
    }
    merged.set(key, { worded: w, items: [r], names: [...w.names] });
    order.push(key);
  }
  const out = order.map((key, i) => {
    const { worded, items, names } = merged.get(key)!;
    const first = items[0];
    const uniqueNames = [...new Set(names.filter(Boolean))];
    const anchors = new Map<string, DocAnchor>();
    for (const a of items.flatMap((x) => x.anchors)) anchors.set(`${a.lineStart}-${a.lineEnd}`, { lineStart: a.lineStart, lineEnd: a.lineEnd });
    return {
      at: i,
      q: {
        id: first.id,
        number: 0,
        refs: items.map((x) => x.id),
        theme: themeOf(first.origin),
        blocks: items.map((x) => blocksOf(x.origin)).find((b) => b !== null) ?? null,
        owner: first.owner,
        question: worded.render(uniqueNames),
        detail: uniqueNames.length ? uniqueNames.join(', ') : null,
        original: items.map((x) => x.question),
        why: [...new Set(items.map((x) => x.why))].join(' '),
        anchors: [...anchors.values()].sort((a, b) => a.lineStart - b.lineStart || a.lineEnd - b.lineEnd),
      } satisfies PdQuestion,
    };
  });
  const rank = (t: PdQuestionTheme) => themeOrder.indexOf(t);
  out.sort((a, b) => rank(a.q.theme) - rank(b.q.theme) || Number(b.q.blocks !== null) - Number(a.q.blocks !== null) || a.at - b.at);
  return out.map((o, i) => ({ ...o.q, number: i + 1 }));
}
