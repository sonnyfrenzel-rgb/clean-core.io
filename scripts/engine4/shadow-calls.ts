/**
 * Shadow of the L5 call graph (`lib/engine4/calls.ts`) against today's (`lib/abap/call-graph.ts`,
 * `readCallGraph`): the PERFORM edges, caller to callee, and the FORMs no path reaches. Method calls have no
 * counterpart there (today resolves them per reader, `method-resolution.ts`), so they are counted: static,
 * dispatched, external, unresolved — and how many dispatched calls FINAL pruned to one target.
 *
 *   npx tsx scripts/engine4/shadow-calls.ts [--corpus <MANIFEST.json> --group <g>] [--samples]
 *
 * Never reads the holdout.
 */
import { readCallGraph } from '../../lib/abap/call-graph';
// Aliased: engine 4's reader takes no engine version, and `readSource` is the name of a versioned reader
// `tests/engine-version-callers.spec.ts` checks.
import { readSource as readEngine4Source } from '../../lib/engine4/index';
import { callGraph } from '../../lib/engine4/calls';
import { corpusFromArgs, type CorpusFile } from './shadow';

export interface CallShadow {
  files: number;
  performEdges: { old: number; new: number; agree: number };
  unreachableForms: { old: number; new: number; agree: number };
  methodCalls: Record<string, number>;
  categories: Record<string, number>;
  samples: Record<string, string[]>;
}

export function runCallShadow(corpus: CorpusFile[]): CallShadow {
  const r: CallShadow = { files: 0, performEdges: { old: 0, new: 0, agree: 0 }, unreachableForms: { old: 0, new: 0, agree: 0 }, methodCalls: {}, categories: {}, samples: {} };
  const add = (cat: string, s: string) => {
    r.categories[cat] = (r.categories[cat] ?? 0) + 1;
    const l = (r.samples[cat] ??= []);
    if (l.length < 6) l.push(s);
  };
  for (const file of corpus) {
    r.files += 1;
    const old = readCallGraph(file.source);
    const { statements, tree } = readEngine4Source(file.source);
    const g = callGraph(statements, tree);
    const name = (key: string) => key.replace(/^(FORM|FUNCTION|MODULE) /, '').replace(/^METHOD .*=>/, '').replace(/^EVENT (.*)@\d+$/, '$1').replace(/^PROGRAM$/, '');
    const oldEdges = old.edges.map((e) => `${e.from ?? ''}->${e.to}`);
    const newEdges = g.edges.filter((e) => e.kind === 'perform' && e.to && e.how === 'static').map((e) => `${name(e.from)}->${name(e.to!)}`);
    r.performEdges.old += oldEdges.length;
    r.performEdges.new += newEdges.length;
    const left = [...newEdges];
    for (const e of oldEdges) {
      const k = left.indexOf(e);
      if (k >= 0) { left.splice(k, 1); r.performEdges.agree += 1; } else add('perform-edge-old-only:unexplained', `${file.name}: ${e}`);
    }
    for (const e of left) add('perform-edge-new-only:unexplained', `${file.name}: ${e}`);
    const callbacks = new Set(old.callbacks.map((c) => c.to));
    const oldUnreach = new Set(old.unreachable);
    const newUnreach = new Set(g.unreachable.filter((k) => k.startsWith('FORM ')).map(name));
    r.unreachableForms.old += oldUnreach.size;
    r.unreachableForms.new += newUnreach.size;
    for (const f of oldUnreach) if (newUnreach.has(f)) r.unreachableForms.agree += 1; else add('unreachable-old-only:unexplained', `${file.name}: ${f}`);
    for (const f of newUnreach) {
      if (oldUnreach.has(f)) continue;
      add(callbacks.has(f) ? 'callback-registration-not-read-yet' : 'unreachable-new-only:unexplained', `${file.name}: ${f}`);
    }
    for (const e of g.edges.filter((x) => x.kind === 'method')) r.methodCalls[e.how] = (r.methodCalls[e.how] ?? 0) + 1;
  }
  return r;
}

if (require.main === module) {
  const r = runCallShadow(corpusFromArgs());
  console.log(`files ${r.files}`);
  console.log(`PERFORM edges old ${r.performEdges.old}, new ${r.performEdges.new}, agree ${r.performEdges.agree}`);
  console.log(`unreachable FORMs old ${r.unreachableForms.old}, new ${r.unreachableForms.new}, agree ${r.unreachableForms.agree}`);
  console.log(`method call edges: ${JSON.stringify(r.methodCalls)}`);
  for (const [k, v] of Object.entries(r.categories).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  if (process.argv.includes('--samples')) for (const [k, v] of Object.entries(r.samples)) console.log(`\n${k}\n  ${v.join('\n  ')}`);
}
