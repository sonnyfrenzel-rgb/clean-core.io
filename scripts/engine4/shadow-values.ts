/**
 * Shadow of the scoped value reading (`lib/engine4/values.ts`) against the first-step resolver of the reference
 * table (22.11.2026, pinned below as it was): for every dynamic name of the corpus, did the answer stay, become
 * less certain, become resolved, or — never allowed without a named reason — change to a different single value?
 *
 *   npx tsx scripts/engine4/shadow-values.ts [--corpus <MANIFEST.json> --group <g>] [--samples]
 *
 * Every newly open answer is put into the reason that opened it: a write in another processing unit (routine or
 * event block), in another scope, a loop around the use, or a call between write and use. Never reads the holdout.
 */
import { readSource } from '../../lib/engine4/index';
import { references } from '../../lib/engine4/references';
import type { Block, BlockTree } from '../../lib/engine4/blocks';
import type { Statement } from '../../lib/engine4/statements';
import type { Token } from '../../lib/engine4/tokens';
import { valueContext } from '../../lib/engine4/values';
import { corpusFromArgs, type CorpusFile } from './shadow';

// ---- The first-step resolver, pinned (lib/engine4/references.ts at 602ae276). ----
interface Unit { up: string; kind: 'name' | 'literal' | 'other'; token: Token; value?: string }
const LITERAL_KINDS = new Set(['textLiteral', 'stringLiteral', 'template']);
function literalValue(t: Token): string {
  const q = t.text[0];
  const body = t.text.slice(1, t.text.endsWith(q) && t.text.length > 1 ? -1 : undefined);
  return q === "'" ? body.replace(/''/g, "'") : q === '`' ? body.replace(/``/g, '`') : body;
}
function unitsOf(tokens: readonly Token[]): Unit[] {
  const out: Unit[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'word') {
      let text = t.text;
      i += 1;
      while (i + 1 < tokens.length && tokens[i].kind === 'punct' && tokens[i].text === '-' && !tokens[i].spaceBefore && !tokens[i + 1].spaceBefore && tokens[i + 1].kind === 'word') {
        text += `-${tokens[i + 1].text}`;
        i += 2;
      }
      out.push({ up: text.toUpperCase(), kind: 'name', token: t });
      continue;
    }
    if (LITERAL_KINDS.has(t.kind)) out.push({ up: t.text.toUpperCase(), kind: 'literal', token: t, value: literalValue(t) });
    else out.push({ up: t.text.toUpperCase(), kind: 'other', token: t });
    i += 1;
  }
  return out;
}
const DECLARING_KINDS = new Set(['Data', 'ClassData', 'Statics', 'Constants', 'Parameters', 'SelectOptions', 'FieldSymbols', 'Ranges', 'Tables', 'Nodes']);
function ownUnits(s: Statement): Unit[] {
  const own = unitsOf(s.tokens.slice(s.headCount));
  return s.headCount === 0 && (DECLARING_KINDS.has(s.kind) || s.kind === 'Types') ? own.slice(1) : own;
}
function branchPath(tree: BlockTree, index: number): string[] {
  const out: string[] = [];
  for (let b: Block | null = tree.blocks[tree.owner[index]] ?? null; b; b = b.parent) {
    const k = b.branches.findIndex((br) => br.first <= index && index <= br.last);
    out.push(`${b.id}:${k}`);
  }
  return out.reverse();
}
interface Write { statement: number; row: number; value: string | null; constant: boolean; declared: boolean }
function writesOf(list: readonly Statement[], name: string, uses: ReadonlySet<number>): Write[] {
  const out: Write[] = [];
  for (const s of list) {
    if (uses.has(s.index)) continue;
    const u = ownUnits(s);
    const at = u.findIndex((x) => x.kind === 'name' && x.up === name);
    if (at < 0) continue;
    const row = u[at].token.row;
    if (DECLARING_KINDS.has(s.kind) && at === 0) {
      const v = u.findIndex((x) => x.up === 'VALUE');
      if (v > 0) out.push({ statement: s.index, row, value: u[v + 1]?.kind === 'literal' ? (u[v + 1].value ?? null) : null, constant: s.kind === 'Constants', declared: true });
      continue;
    }
    if (s.kind === 'Assignment' && at === 0 && u[1]?.up === '=') {
      out.push({ statement: s.index, row, value: u.length === 3 && u[2].kind === 'literal' ? (u[2].value ?? null) : null, constant: false, declared: false });
      continue;
    }
    if (s.kind === 'Move' && u[at - 1]?.up === 'TO') {
      out.push({ statement: s.index, row, value: u.length === 4 && u[1].kind === 'literal' ? (u[1].value ?? null) : null, constant: false, declared: false });
      continue;
    }
    out.push({ statement: s.index, row, value: null, constant: false, declared: DECLARING_KINDS.has(s.kind) });
  }
  return out;
}
function oldResolve(list: readonly Statement[], tree: BlockTree, uses: ReadonlySet<number>, variable: string, at: number): { name: string | null; resolution: string; write: number | null } {
  const writes = writesOf(list, variable, uses);
  const real = writes.filter((w) => !(w.declared && w.value === null));
  const constant = writes.find((w) => w.constant && w.value !== null);
  if (constant) return { name: constant.value!.toUpperCase(), resolution: 'constant', write: constant.statement };
  const candidates = [...new Set(real.filter((w) => w.value !== null).map((w) => w.value!.toUpperCase()))];
  const before = real.filter((w) => w.statement < at);
  const last = before[before.length - 1];
  if (last && last.value !== null) {
    const pw = branchPath(tree, last.statement);
    const pu = branchPath(tree, at);
    if (pw.every((p, k) => pu[k] === p)) return { name: last.value.toUpperCase(), resolution: last.declared ? 'value' : 'assigned', write: last.statement };
  }
  if (real.length > 0 && real.every((w) => w.value !== null) && candidates.length === 1) {
    return { name: candidates[0], resolution: real.length === 1 && real[0].declared ? 'value' : 'onlyValue', write: real[0].statement };
  }
  return { name: null, resolution: 'dynamic', write: null };
}
// ---- end of the pinned resolver ----

export interface ValueShadow {
  files: number;
  dynamicNames: number;
  old: { resolved: number; open: number };
  new: { resolved: number; open: number };
  categories: Record<string, number>;
  samples: Record<string, string[]>;
}

const LOOPS = new Set(['loop', 'do', 'while', 'select', 'provide']);

export function runValueShadow(corpus: CorpusFile[]): ValueShadow {
  const r: ValueShadow = { files: 0, dynamicNames: 0, old: { resolved: 0, open: 0 }, new: { resolved: 0, open: 0 }, categories: {}, samples: {} };
  const add = (cat: string, sample: string) => {
    r.categories[cat] = (r.categories[cat] ?? 0) + 1;
    const list = (r.samples[cat] ??= []);
    if (list.length < 6) list.push(sample);
  };
  for (const file of corpus) {
    r.files += 1;
    const { statements: list, tree } = readSource(file.source);
    const refs = references(list, tree).references.filter((x) => x.via && x.resolution !== 'declaredType');
    const uses = new Set(refs.map((x) => x.statement));
    const c = valueContext(list, tree, uses);
    for (const ref of refs) {
      r.dynamicNames += 1;
      const o = oldResolve(list, tree, uses, ref.via!.variable, ref.statement);
      if (o.name) r.old.resolved += 1; else r.old.open += 1;
      if (ref.name) r.new.resolved += 1; else r.new.open += 1;
      const where = `${file.name}:${ref.row} ${ref.via!.variable}: old ${o.name ?? 'open'} (${o.resolution}), new ${ref.name ?? 'open'} (${ref.resolution}) [${ref.scope}]`;
      if (o.name === ref.name && o.resolution === ref.resolution) { add('same', where); continue; }
      if (o.name && ref.name && o.name !== ref.name) { add('different-single-value:unexplained', where); continue; }
      if (o.name && ref.name) { add(`same-value:${o.resolution}->${ref.resolution}`, where); continue; }
      if (!o.name && ref.name) { add(`newly-resolved:${ref.resolution}`, where); continue; }
      if (!o.name && !ref.name) { add('both-open', where); continue; }
      // Old single, new open: why.
      const w = o.write as number;
      const at = ref.statement;
      let reason = 'unexplained';
      const loopAroundUseOnly = () => {
        for (let b: Block | null = tree.blocks[tree.owner[at]] ?? null; b; b = b.parent) {
          if (LOOPS.has(b.kind) && b.opener !== at && !(b.first <= w && w <= b.last)) return true;
        }
        return false;
      };
      if (c.routineOf[w] !== c.routineOf[at]) reason = 'write-in-another-routine';
      else if (c.unitOf[w] !== c.unitOf[at]) reason = 'write-in-another-event-block';
      else if (loopAroundUseOnly()) reason = 'loop-around-the-use';
      else if (Array.from({ length: Math.max(0, at - w - 1) }, (_, k) => w + 1 + k).some((k) => c.calls[k])) reason = 'call-between-write-and-use';
      else if (o.resolution === 'onlyValue' || o.resolution === 'value') reason = 'start-value-may-reach-the-use';
      add(`newly-open:${reason}`, where);
    }
  }
  return r;
}

if (require.main === module) {
  const r = runValueShadow(corpusFromArgs());
  console.log(`files ${r.files}, dynamic names ${r.dynamicNames}`);
  console.log(`old: resolved ${r.old.resolved}, open ${r.old.open}; new: resolved ${r.new.resolved}, open ${r.new.open}`);
  for (const [k, v] of Object.entries(r.categories).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  if (process.argv.includes('--samples')) for (const [k, v] of Object.entries(r.samples)) if (k !== 'same' && k !== 'both-open') console.log(`\n${k}\n  ${v.join('\n  ')}`);
}
