/**
 * Fuzz run of every engine 4 layer over a corpus and its mutations — outside CI (the external sample stays
 * outside the repository, ADR-125 (5); docs/design/engine4.md, "Fuzz corpus").
 *
 *   npx tsx scripts/engine4/fuzz.ts [--corpus <MANIFEST.json> --group <g>] [--rounds <n>]
 *
 * Per source and mutation: L0 (every character covered), L1, L2 (every statement owned by a block whose range
 * holds it, parents enclose children), `parseSource`, L4 references, the value reading of every dynamic name, the
 * ledger — none may throw, each must be deterministic (the same answer twice), and the slowest source is reported.
 * Exit 1 on any violation. Never reads the holdout; refuses Desktop/OneDrive paths (`manifestCorpus`).
 */
import { createHash } from 'crypto';
import { lex, uncoveredCharacters } from '../../lib/engine4/lexer';
import { statements } from '../../lib/engine4/statements';
import { blocks, type BlockTree } from '../../lib/engine4/blocks';
import { parseSource } from '../../lib/engine4/parsed-source';
import { references } from '../../lib/engine4/references';
import { valueAt, valueContext } from '../../lib/engine4/values';
import { ENGINE4_CONSUMERS, ledger } from '../../lib/engine4/ledger';
import { corpusFromArgs } from './shadow';

type Mutation = [string, (s: string, rnd: () => number) => string];

const at = (s: string, rnd: () => number) => Math.floor(rnd() * (s.length + 1));
export const MUTATIONS: Mutation[] = [
  ['as-is', (s) => s],
  ['truncate', (s, r) => s.slice(0, at(s, r))],
  ['delete-char', (s, r) => { const i = at(s, r); return s.slice(0, i) + s.slice(i + 1); }],
  ['delete-line', (s, r) => { const l = s.split('\n'); l.splice(Math.floor(r() * l.length), 1); return l.join('\n'); }],
  ['duplicate-line', (s, r) => { const l = s.split('\n'); const i = Math.floor(r() * l.length); l.splice(i, 0, l[i]); return l.join('\n'); }],
  ['insert-quote', (s, r) => { const i = at(s, r); return `${s.slice(0, i)}'${s.slice(i)}`; }],
  ['insert-pipe', (s, r) => { const i = at(s, r); return `${s.slice(0, i)}|${s.slice(i)}`; }],
  ['insert-brace', (s, r) => { const i = at(s, r); return `${s.slice(0, i)}{${s.slice(i)}`; }],
  ['insert-backtick', (s, r) => { const i = at(s, r); return `${s.slice(0, i)}\`${s.slice(i)}`; }],
  ['drop-periods', (s, r) => s.replace(/\./g, () => (r() < 0.05 ? '' : '.'))],
  ['cr-only', (s) => s.replace(/\r?\n/g, '\r')],
  ['bom-crlf', (s) => `﻿${s.replace(/\r?\n/g, '\r\n')}`],
  ['nbsp-tabs', (s, r) => s.replace(/ /g, () => (r() < 0.02 ? ' ' : r() < 0.02 ? '\t' : ' '))],
  ['upper', (s) => s.toUpperCase()],
  ['shuffle-lines', (s, r) => { const l = s.split('\n'); for (let i = l.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [l[i], l[j]] = [l[j], l[i]]; } return l.join('\n'); }],
  ['one-line', (s) => s.replace(/^\*.*$/gm, '').replace(/".*$/gm, '').replace(/\r?\n/g, ' ')],
  ['random-indent', (s, r) => s.split('\n').map((l) => (l.startsWith('*') ? l : ' '.repeat(Math.floor(r() * 9)) + l.trimStart())).join('\n')],
];

function treeViolations(tree: BlockTree, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = tree.blocks[tree.owner[i]];
    if (!b || (b.kind !== 'program' && (i < b.first || i > b.last))) { out.push(`statement ${i} outside its owner`); break; }
  }
  for (const b of tree.blocks) if (b.parent && b.parent.kind !== 'program' && (b.first < b.parent.first || b.last > b.parent.last)) { out.push(`block ${b.id} outside its parent`); break; }
  return out;
}

const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x, (_, v) => (v instanceof Int32Array ? [...v] : v))).digest('hex').slice(0, 16);

/** Everything engine 4 computes for one source, as one digest. Throws on a broken invariant. */
export function readAll(source: string): string {
  const lexed = lex(source);
  const uncovered = uncoveredCharacters(source, lexed.tokens);
  if (uncovered.length) throw new Error(`L0: ${uncovered.length} characters not covered`);
  const list = statements(lexed.tokens);
  const tree = blocks(list);
  const bad = treeViolations(tree, list.length);
  if (bad.length) throw new Error(`L2: ${bad.join(', ')}`);
  const parsed = parseSource(source);
  parsed.maskNonCode();
  parsed.containerAt(1);
  const table = references(list, tree);
  const dyn = table.references.filter((r) => r.via && r.resolution !== 'declaredType');
  const context = valueContext(list, tree, new Set(dyn.map((r) => r.statement)));
  const values = dyn.map((r) => valueAt(context, r.via!.variable, r.statement));
  const l = ledger(list, ENGINE4_CONSUMERS, { references: table });
  return hash({ kinds: list.map((s) => s.kind), blocks: tree.blocks.map((b) => [b.kind, b.first, b.last, b.termination]), refs: table.references.length, values, ledger: l.byClass });
}

if (require.main === module) {
  const corpus = corpusFromArgs();
  const ri = process.argv.indexOf('--rounds');
  const rounds = ri > 0 ? Number(process.argv[ri + 1]) : 3;
  let seed = 4711;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >>> 8) / 0x800000;
  const stats: Record<string, { n: number; throws: number; nondeterministic: number; maxMs: number; slowest: string }> = {};
  const failures: string[] = [];
  for (const [name, mutate] of MUTATIONS) {
    const st = (stats[name] = { n: 0, throws: 0, nondeterministic: 0, maxMs: 0, slowest: '' });
    const times = ['as-is', 'cr-only', 'bom-crlf', 'upper', 'one-line'].includes(name) ? 1 : rounds;
    for (const file of corpus) {
      for (let k = 0; k < times; k++) {
        const src = mutate(file.source, rnd);
        st.n += 1;
        const t0 = performance.now();
        try {
          const a = readAll(src);
          const b = readAll(src);
          if (a !== b) { st.nondeterministic += 1; failures.push(`${name} ${file.name}: nondeterministic`); }
        } catch (e) {
          st.throws += 1;
          if (failures.length < 20) failures.push(`${name} ${file.name}: ${(e as Error).message.slice(0, 160)}`);
        }
        const ms = (performance.now() - t0) / 2;
        if (ms > st.maxMs) { st.maxMs = ms; st.slowest = `${file.name} (${src.split('\n').length} lines)`; }
      }
    }
  }
  let total = 0;
  for (const [k, v] of Object.entries(stats)) {
    total += v.n;
    console.log(`${k.padEnd(16)} sources ${String(v.n).padStart(5)}  throws ${v.throws}  nondeterministic ${v.nondeterministic}  slowest ${v.maxMs.toFixed(0)} ms ${v.slowest}`);
  }
  console.log(`files ${corpus.length}, sources ${total}, failures ${failures.length}`);
  for (const f of failures) console.log(`  ${f}`);
  if (failures.length) process.exit(1);
}
