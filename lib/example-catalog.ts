/**
 * Which examples a first-time reader sees, in which order — owner feedback of
 * 01.10.2026 on "Try it with an example": fourteen cards at once, two card
 * styles, filters before the reader knows anything, and two snippets carrying
 * the same generic sentence.
 *
 * Three tiers, and nothing removed:
 *   1. **Start here** — one example, the demo project's own source
 *      (`STAGE_EXAMPLE_FILE`, mockup 2.8 s14), with one sentence why.
 *   2. **Next, by what you want to see** — three shipped examples, each under
 *      the learning goal it was chosen for.
 *   3. **More examples** — everything else, shipped examples and the short
 *      snippets alike, behind one control, with search.
 *
 * A snippet is described by what is in it, read deterministically from its own
 * code (`describeSnippet`), never by a category sentence two snippets share.
 *
 * Pure apart from the engine readers it calls, so specs run it in Node.
 */

import { STARTER_EXAMPLES, type StarterExample } from './starter-examples';
import { STAGE_EXAMPLE_FILE } from './three-views-stage';
import { extractDataCoupling } from './abap/code-assessment';
import { countSourceLines } from '@/lib/source-lines';

/** A short code snippet shipped with the dashboard. Starts as a named project. */
export interface ExampleSnippet {
  id: string;
  name: string;
  code: string;
}

export const START_HERE_FILE = STAGE_EXAMPLE_FILE;

export const START_HERE_WHY =
  'Why this one first: it is the case the demo project and the three views are built on — the clearest first look.';

/** The three next examples, each with the one thing it is the best example of. */
export const NEXT_EXAMPLES: readonly { file: string; goal: string }[] = Object.freeze([
  { file: 'ZLEGACY_ORDER_FULFILLMENT_AUDIT_1000LOC.abap', goal: 'A big process stays readable' },
  { file: 'Z_INVOICE_EXTRACTOR.txt', goal: 'Code with no ABAP Cloud equivalent' },
  { file: 'Z_SALES_ORDER_CREATOR.txt', goal: 'Classic BAPIs and their released successors' },
]);

function byFile(file: string): StarterExample {
  const found = STARTER_EXAMPLES.find((e) => e.file === file);
  if (!found) throw new Error(`No starter example ${file}`);
  return found;
}

export interface ExampleTiers {
  startHere: StarterExample;
  next: { example: StarterExample; goal: string }[];
  /** Every shipped example not shown above, in the shared list's order. */
  more: StarterExample[];
}

export function exampleTiers(): ExampleTiers {
  const startHere = byFile(START_HERE_FILE);
  const next = NEXT_EXAMPLES.map(({ file, goal }) => ({ example: byFile(file), goal }));
  const featured = new Set([START_HERE_FILE, ...NEXT_EXAMPLES.map((n) => n.file)]);
  return { startHere, next, more: STARTER_EXAMPLES.filter((e) => !featured.has(e.file)) };
}

export interface SnippetDescription {
  /** What the object is: "Report", "Function module", "Class". */
  kind: string;
  /** The snippet's own header comment, when it has one; otherwise `null`. */
  title: string | null;
  /** What it touches, read from the code: tables read and written, functions called. */
  shows: string[];
  lines: number;
}

const KIND_RULES: { rx: RegExp; kind: string }[] = [
  { rx: /^\s*FUNCTION-POOL\s/im, kind: 'Function group' },
  { rx: /^\s*FUNCTION\s+[\w/]+\s*\./im, kind: 'Function module' },
  { rx: /^\s*CLASS\s+[\w/]+\s+DEFINITION\b/im, kind: 'Class' },
  { rx: /^\s*(?:REPORT|PROGRAM)\s/im, kind: 'Report' },
];

/** The first full-line comment that says something — not a ruler, not a signature line. */
function headerComment(code: string): string | null {
  for (const raw of code.split(/\r?\n/).slice(0, 12)) {
    const m = /^\*(?!")\s*(.*)$/.exec(raw);
    if (!m) continue;
    const text = m[1].replace(/[-*=&]+\s*$/, '').trim();
    if (/[A-Za-z]{3,}/.test(text) && !/^[-=*&]+$/.test(text)) return text;
  }
  return null;
}

function list(names: string[]): string {
  return names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/** What a snippet is and does, from its own code — the engine's readers, no model. */
export function describeSnippet(code: string): SnippetDescription {
  const kind = KIND_RULES.find((r) => r.rx.test(code))?.kind ?? 'ABAP source';
  const reads: string[] = [];
  const writes: string[] = [];
  for (const entry of extractDataCoupling(code)) {
    if ((entry as { possibleTargetOf?: unknown }).possibleTargetOf) continue;
    if (entry.accessType === 'Read' || entry.accessType === 'Read/Write') reads.push(entry.tableName);
    if (entry.accessType === 'Write' || entry.accessType === 'Read/Write') writes.push(entry.tableName);
  }
  const calls = [...new Set([...code.matchAll(/CALL\s+FUNCTION\s+'([\w/]+)'/gi)].map((m) => m[1].toUpperCase()))];
  const methods = [...new Set([...code.matchAll(/^\s*METHOD\s+([\w/~]+)\s*\./gim)].map((m) => m[1].toLowerCase()))];
  const classes = [...new Set([...code.matchAll(/\b([\w/]+)=>/g)].map((m) => m[1].toUpperCase()))];
  const shows: string[] = [];
  if (methods.length) shows.push(`${methods.length === 1 ? 'method' : 'methods'} ${list(methods)}`);
  if (classes.length) shows.push(`uses ${list(classes)}`);
  if (reads.length) shows.push(`reads ${list(reads.sort())}`);
  if (writes.length) shows.push(`writes ${list(writes.sort())}`);
  if (calls.length) shows.push(`calls ${list(calls)}`);
  return { kind, title: headerComment(code), shows, lines: countSourceLines(code) };
}
