/**
 * Shadow comparison of engine 4.0's L3 upload layout against the shipping
 * upload path.
 *
 *   npx tsx scripts/engine4/shadow-layout.ts            # summary and categories
 *   npx tsx scripts/engine4/shadow-layout.ts --cases    # plus one line per multi-file case
 *
 * Corpus: the starter examples and the benchmark's learn halves (`split.json`
 * `learn` + `w3_learn`); the holdout is never opened. Each benchmark case is
 * one upload. Three readings of it are compared:
 *
 *   - **join**: `resolveIncludes` (lib/abap/include-resolution.ts), the join the
 *     own-code upload and a batch run use: one main object, its includes in
 *     place, sources nobody names after it, further programs left out;
 *   - **concat**: `BM_CONCAT=1` of `tests/prozess-benchmark/evaluate.ts`, the
 *     way a reader pastes several files into one source: the file with
 *     `REPORT`/`PROGRAM`/`FUNCTION-POOL` first, the rest in byte order of names;
 *   - **L3**: `layout(files)` (lib/engine4/layout.ts).
 *
 * Compared: which files are read, which object is the main one, which includes
 * are missing, the order of the files, and the macro calls L1 recognises with
 * the macro names L3 supplies. Every difference falls into a named category;
 * `unexplained` collects the rest. Nothing here is wired into the product.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { classifySource, resolveIncludes } from '../../lib/abap/include-resolution';
import { layout, macrosFor, type UploadFile, type UploadLayout } from '../../lib/engine4/layout';
import { lex } from '../../lib/engine4/lexer';
import { macroNames, statements } from '../../lib/engine4/statements';

const ROOT = join(__dirname, '..', '..');
const STARTERS = join(ROOT, 'public', 'starter-examples');
const BENCH = join(ROOT, 'tests', 'prozess-benchmark');

export interface Upload {
  id: string;
  files: UploadFile[];
}

/** One upload per starter example and per learn case — never the holdout. */
export function layoutCorpus(): Upload[] {
  const out: Upload[] = [];
  for (const name of readdirSync(STARTERS).sort()) {
    if (/\.(abap|txt)$/.test(name)) out.push({ id: `starter/${name}`, files: [{ name, source: readFileSync(join(STARTERS, name), 'utf8') }] });
  }
  const split = JSON.parse(readFileSync(join(BENCH, 'split.json'), 'utf8')) as { learn: string[]; w3_learn: string[] };
  for (const id of [...split.learn, ...split.w3_learn].sort()) {
    const dir = join(BENCH, 'cases', id);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).sort().filter((n) => n.endsWith('.abap')).map((name) => ({ name, source: readFileSync(join(dir, name), 'utf8') }));
    out.push({ id, files });
  }
  return out;
}

/** BM_CONCAT's file order. */
export function concatOrder(files: readonly UploadFile[]): string[] {
  const head = (code: string) => /^\s*(REPORT|PROGRAM|FUNCTION-POOL)\b/im.test(code);
  return [...files].sort((a, b) => Number(head(b.source)) - Number(head(a.source)) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).map((f) => f.name);
}

/** The shipping join's reading, by file. */
export function joinReading(files: readonly UploadFile[]): { main: string | null; order: string[]; missing: string[]; dropped: string[] } {
  const r = resolveIncludes(Object.fromEntries(files.map((f) => [f.name, f.source])));
  const fileOf = new Map<string, string>();
  for (const f of files) {
    const { object } = classifySource(f.source, f.name);
    if (!fileOf.has(object)) fileOf.set(object, f.name);
  }
  const order = r.used.map((o) => fileOf.get(o)).filter((f): f is string => !!f);
  return { main: r.main?.file ?? null, order, missing: [...r.missing].sort(), dropped: files.map((f) => f.name).filter((n) => !order.includes(n)) };
}

/** L3's reading, by file. */
export function l3Reading(l: UploadLayout): { main: string | null; order: string[]; missing: string[]; customerMissing: string[] } {
  const fileOf = new Map(l.parts.map((p) => [p.name, p.file]));
  const primary = l.objects[0];
  const mainPart = primary ? (primary.main ?? primary.order[0]) : null;
  const missing = [...new Set(l.objects.flatMap((o) => o.missing.map((m) => m.name)))].sort();
  const customerMissing = [...new Set(l.objects.flatMap((o) => o.missing.filter((m) => m.customer).map((m) => m.name)))].sort();
  return { main: mainPart ? (fileOf.get(mainPart) ?? null) : null, order: l.order.map((e) => fileOf.get(e.part)!), missing, customerMissing };
}

export interface LayoutShadow {
  uploads: number;
  multiFile: number;
  files: number;
  /** Files the join leaves out (further programs, classes, function modules). */
  joinDropped: number;
  l3Read: number;
  mainAgree: number;
  /** Uploads where the join's files come in the same relative order in L3. */
  joinOrderAgree: number;
  concatOrderAgree: number;
  missingAgree: number;
  objects: Record<string, number>;
  macroCalls: { l3: number; perCase: number; none: number };
  unknown: { l3: number; perCase: number };
  systemMacroCalls: number;
  categories: Record<string, number>;
  samples: Record<string, string[]>;
  cases: string[];
}

function bump(r: LayoutShadow, category: string, sample: string): void {
  r.categories[category] = (r.categories[category] ?? 0) + 1;
  const list = (r.samples[category] ??= []);
  if (list.length < 6) list.push(sample);
}

/** The relative order of `subset` within `order`. */
const restricted = (order: string[], subset: string[]) => order.filter((f) => subset.includes(f));

function countMacroCalls(upload: Upload, l: UploadLayout, r: LayoutShadow): void {
  const caseMacros = upload.files.flatMap((f) => macroNames(statements(lex(f.source).tokens)));
  for (const p of l.parts) {
    const withL3 = statements(p.tokens, { macros: macrosFor(l, p.name) });
    const withCase = statements(p.tokens, { macros: caseMacros });
    const system = new Set(l.objects.flatMap((o) => o.systemMacros.map((m) => m.name)));
    r.macroCalls.l3 += withL3.filter((s) => s.kind === 'MacroCall').length;
    r.macroCalls.perCase += withCase.filter((s) => s.kind === 'MacroCall').length;
    r.macroCalls.none += p.statements.filter((s) => s.kind === 'MacroCall').length;
    r.unknown.l3 += withL3.filter((s) => s.kind === 'Unknown').length;
    withL3.forEach((s, i) => {
      if (s.kind === 'Unknown' && withCase[i]?.kind === 'MacroCall') bump(r, 'macro:defined-in-another-object', `${upload.id}/${p.file}:${s.start.row} ${s.tokens[0].text}`);
      if (s.kind === 'MacroCall' && withCase[i]?.kind === 'Unknown') bump(r, 'macro:system-macro', `${upload.id}/${p.file}:${s.start.row} ${s.tokens[0].text}`);
    });
    r.unknown.perCase += withCase.filter((s) => s.kind === 'Unknown').length;
    r.systemMacroCalls += withL3.filter((s) => s.kind === 'MacroCall' && system.has(s.tokens[0].text.toUpperCase())).length;
  }
}

/**
 * Files the shipping join takes for a global class although they hold only
 * local classes: its header pattern matches the first `CLASS … DEFINITION`
 * anywhere in the text, `DEFERRED` and local ones included. Such a file is
 * renamed to the class, so the `INCLUDE` that names it finds nothing, and it
 * becomes a "further program" the join leaves out.
 */
export function misreadAsClass(files: readonly UploadFile[]): string[] {
  return files
    .filter((f) => classifySource(f.source, f.name).role === 'class' && !/^\s*CLASS\s+\S+\s+DEFINITION\b[^.]*\bPUBLIC\b/im.test(f.source))
    .map((f) => f.name);
}

/**
 * Why the join and L3 read an upload differently. Each rule names a known,
 * explained difference; anything else is `unexplained`.
 */
function categorizeOrder(join: ReturnType<typeof joinReading>, l: UploadLayout, mine: ReturnType<typeof l3Reading>, misread: string[]): string {
  const sub = restricted(mine.order, join.order);
  if (sub.join('|') === join.order.join('|')) return 'same';
  const primary = l.objects[0];
  if (misread.length > 0) return 'join-reads-local-class-as-global-class';
  if (join.main !== mine.main) return 'other-main-object';
  if (primary && !primary.main) return 'no-main-program-workbench-order';
  if (l.diagnostics.some((d) => d.code === 'not-referenced')) return 'unreferenced-parts-in-workbench-order';
  return 'unexplained';
}

function categorizeMain(join: ReturnType<typeof joinReading>, l: UploadLayout, misread: string[]): string {
  if (join.main && misread.includes(join.main)) return 'join-reads-local-class-as-global-class';
  const primary = l.objects[0];
  if (primary?.type === 'program') return 'program-before-other-objects';
  if (primary?.type === 'functionGroup' || primary?.type === 'functionModule') return 'function-before-class';
  return 'unexplained';
}

function categorizeMissing(join: ReturnType<typeof joinReading>, mine: ReturnType<typeof l3Reading>, files: readonly UploadFile[], misread: string[]): string {
  const uploaded = new Set(files.map((f) => f.name.replace(/\.[^.]+$/, '').toUpperCase()));
  const extraInJoin = join.missing.filter((m) => !mine.missing.includes(m));
  const extraInL3 = mine.missing.filter((m) => !join.missing.includes(m));
  if (extraInJoin.length > 0 && extraInJoin.every((m) => uploaded.has(m)) && misread.length > 0 && extraInL3.length === 0) {
    return 'join-reads-local-class-as-global-class';
  }
  return 'unexplained';
}

/** Why BM_CONCAT's order (header file first, then names) differs from L3's. */
function categorizeConcat(concat: string[], l: UploadLayout, mine: ReturnType<typeof l3Reading>): string {
  const fileOf = new Map(l.parts.map((p) => [p.name, p.file]));
  const first = l.objects[0];
  const firstFiles = first ? first.order.map((n) => fileOf.get(n)!) : [];
  // Within the primary object the files differ in order: L3 follows the INCLUDE statements or the workbench's roles, BM_CONCAT the names.
  if (restricted(concat, firstFiles).join('|') !== firstFiles.join('|')) {
    return first?.main && l.parts.find((p) => p.name === first.main)!.includes.length > 0 ? 'concat-ignores-include-order' : 'concat-ignores-workbench-order';
  }
  if (l.objects.length > 1) return 'concat-interleaves-objects';
  return mine.order.length === concat.length ? 'unexplained' : 'concat-reads-other-files';
}

export function runLayoutShadow(corpus: Upload[] = layoutCorpus()): LayoutShadow {
  const r: LayoutShadow = {
    uploads: 0, multiFile: 0, files: 0, joinDropped: 0, l3Read: 0, mainAgree: 0, joinOrderAgree: 0, concatOrderAgree: 0, missingAgree: 0,
    objects: {}, macroCalls: { l3: 0, perCase: 0, none: 0 }, unknown: { l3: 0, perCase: 0 }, systemMacroCalls: 0,
    categories: {}, samples: {}, cases: [],
  };
  for (const upload of corpus) {
    r.uploads += 1;
    r.files += upload.files.length;
    if (upload.files.length > 1) r.multiFile += 1;
    const l = layout(upload.files);
    const join = joinReading(upload.files);
    const mine = l3Reading(l);
    const concat = concatOrder(upload.files);
    for (const o of l.objects) r.objects[o.type] = (r.objects[o.type] ?? 0) + 1;
    r.joinDropped += join.dropped.length;
    r.l3Read += new Set(mine.order).size;
    const misread = misreadAsClass(upload.files);
    if (join.main === mine.main) r.mainAgree += 1;
    else bump(r, `main:${categorizeMain(join, l, misread)}`, `${upload.id}: join ${join.main}, L3 ${mine.main}`);
    const orderCategory = categorizeOrder(join, l, mine, misread);
    if (orderCategory === 'same') r.joinOrderAgree += 1;
    else bump(r, `order:${orderCategory}`, `${upload.id}: join ${join.order.join(' ')} | L3 ${restricted(mine.order, join.order).join(' ')}`);
    if (concat.join('|') === mine.order.join('|')) r.concatOrderAgree += 1;
    else bump(r, `concat:${categorizeConcat(concat, l, mine)}`, `${upload.id}: concat ${concat.join(' ')} | L3 ${mine.order.join(' ')}`);
    if (join.missing.join('|') === mine.missing.join('|')) r.missingAgree += 1;
    else bump(r, `missing:${categorizeMissing(join, mine, upload.files, misread)}`, `${upload.id}: join [${join.missing}] L3 [${mine.missing}]`);
    for (const d of join.dropped) bump(r, `dropped-by-join:${misread.includes(d) ? 'local-class-include' : 'further-object'}`, `${upload.id}: ${d}`);
    countMacroCalls(upload, l, r);
    if (upload.files.length > 1) {
      r.cases.push(`${upload.id}: ${l.objects.map((o) => `${o.type}:${o.name}[${o.order.join(',')}]${o.main ? '' : '(no main)'}`).join(' ')}`);
    }
  }
  return r;
}

const pct = (a: number, b: number) => (b === 0 ? '—' : `${((100 * a) / b).toFixed(1)} %`);

export function formatLayoutReport(r: LayoutShadow, withCases: boolean): string {
  const lines = [
    `uploads ${r.uploads} (multi-file ${r.multiFile}), files ${r.files}`,
    `files read: join ${r.files - r.joinDropped} (drops ${r.joinDropped}), L3 ${r.l3Read}`,
    `main file agrees ${r.mainAgree} (${pct(r.mainAgree, r.uploads)})`,
    `order of the join's files agrees ${r.joinOrderAgree} (${pct(r.joinOrderAgree, r.uploads)}); BM_CONCAT order equals L3 order ${r.concatOrderAgree} (${pct(r.concatOrderAgree, r.uploads)})`,
    `missing includes agree ${r.missingAgree} (${pct(r.missingAgree, r.uploads)})`,
    `objects: ${Object.entries(r.objects).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `macro calls: L3 ${r.macroCalls.l3} (system ${r.systemMacroCalls}), per-case union ${r.macroCalls.perCase}, none ${r.macroCalls.none}; Unknown: L3 ${r.unknown.l3}, per-case ${r.unknown.perCase}`,
    'categories:',
    ...Object.entries(r.categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => `  ${k}: ${v}`),
  ];
  if (withCases) {
    for (const [k, list] of Object.entries(r.samples)) lines.push(`--- ${k}`, ...list.map((s) => `  ${s}`));
    lines.push('--- multi-file layouts', ...r.cases.map((c) => `  ${c}`));
  }
  return lines.join('\n');
}

if (require.main === module) {
  console.log(formatLayoutReport(runLayoutShadow(), process.argv.includes('--cases')));
}
