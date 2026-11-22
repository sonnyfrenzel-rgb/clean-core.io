/**
 * Shadow of L3 declarations (`lib/engine4/declarations.ts`) against today's declaration parser
 * (`lib/abap/declaration-parser.ts`, `parseDeclarations`): per class and interface — kind, superclass,
 * interfaces, ABSTRACT/FINAL, friends — and per member — methods with section and flags, attributes, events,
 * aliases. Every difference gets a named category; `unexplained` collects the rest.
 *
 *   npx tsx scripts/engine4/shadow-declarations.ts [--corpus <MANIFEST.json> --group <g>] [--samples]
 *
 * Never reads the holdout.
 */
import { parseDeclarations, tokenize } from '../../lib/abap/declaration-parser';
import type { ClassNode } from '../../lib/abap/class-model';
import { readSource } from '../../lib/engine4/index';
import { declarations, type TypeDeclaration } from '../../lib/engine4/declarations';
import { corpusFromArgs, type CorpusFile } from './shadow';

export interface DeclarationShadow {
  files: number;
  oldTypes: number;
  newTypes: number;
  typesAgree: number;
  members: { old: number; new: number; agree: number };
  categories: Record<string, number>;
  samples: Record<string, string[]>;
}

const sig = {
  type: (t: { kind: string; superclass?: string; isAbstract: boolean; isFinal: boolean; interfaces: string[]; friends: string[] }) =>
    `${t.kind}|${t.superclass ?? ''}|${t.isAbstract}|${t.isFinal}|${[...t.interfaces].sort().join(',')}|${[...t.friends].sort().join(',')}`,
};

function oldMembers(n: ClassNode): string[] {
  return [
    ...n.methods.map((m) => `method ${m.name}|${m.visibility}|${m.isStatic}|${m.isAbstract}|${m.isFinal}|${m.isRedefinition}|${m.isConstructor}|${m.isClassConstructor}`),
    ...n.attributes.map((a) => `attribute ${a.name}|${a.visibility}|${a.isStatic}|${a.isReadOnly}|${a.isConstant}`),
    ...n.events.map((e) => `event ${e.name}|${e.visibility}|${e.isStatic}`),
    ...n.aliases.map((a) => `alias ${a.alias}|${a.target}`),
  ];
}

function newMembers(t: TypeDeclaration): string[] {
  return [
    ...t.methods.map((m) => `method ${m.name}|${m.visibility}|${m.isStatic}|${m.isAbstract}|${m.isFinal}|${m.isRedefinition}|${m.isConstructor}|${m.isClassConstructor}`),
    // A constant is a static attribute in ABAP; the old parser marks it instance. Compared as the old one writes it, counted apart.
    ...t.attributes.map((a) => `attribute ${a.name}|${a.visibility}|${a.isConstant ? false : a.isStatic}|${a.isReadOnly}|${a.isConstant}`),
    ...t.events.map((e) => `event ${e.name}|${e.visibility}|${e.isStatic}`),
    ...t.aliases.map((a) => `alias ${a.alias}|${a.target}`),
  ];
}

/** Why one member line differs. */
function memberCategory(line: string, side: 'old' | 'new', beginOf: boolean, other: readonly string[]): string {
  // `METHODS if_x~m REDEFINITION`: the old parser's name stops at `~`.
  const cut = /^method ([^|~]+)\|/.exec(line);
  if (side === 'old' && cut && other.some((m) => m.startsWith(`method ${cut[1]}~`))) return 'old-cuts-an-interface-method-name';
  if (side === 'new' && /^method [^|]*~[^|]+\|/.test(line)) return 'old-cuts-an-interface-method-name';
  // `METHODS abstract REDEFINITION`: a method named like an option word.
  if (/^method (ABSTRACT|FINAL|REDEFINITION)\|/.test(line)) return 'method-named-like-an-option';
  if (side === 'old' && /^attribute (BEGIN|END)\|/.test(line)) return 'old-reads-begin-of-as-an-attribute';
  if (side === 'new' && beginOf && line.startsWith('attribute ')) return 'new-reads-the-begin-of-structure-name';
  if (side === 'old' && beginOf && line.startsWith('attribute ')) return 'old-reads-structure-components-as-attributes';
  return `member-${side}-only:unexplained`;
}

export function runDeclarationShadow(corpus: CorpusFile[]): DeclarationShadow {
  const r: DeclarationShadow = { files: 0, oldTypes: 0, newTypes: 0, typesAgree: 0, members: { old: 0, new: 0, agree: 0 }, categories: {}, samples: {} };
  const add = (cat: string, s: string) => {
    r.categories[cat] = (r.categories[cat] ?? 0) + 1;
    const list = (r.samples[cat] ??= []);
    if (list.length < 6) list.push(s);
  };
  for (const file of corpus) {
    r.files += 1;
    const old = parseDeclarations(file.source, file.name);
    const { statements, tree } = readSource(file.source);
    const d = declarations(statements, tree);
    const localFriends = new Set(d.localFriends.map((x) => x.name));
    r.oldTypes += old.length;
    r.newTypes += d.types.length;
    const byName = new Map<string, TypeDeclaration[]>();
    for (const t of d.types) (byName.get(`${t.kind}|${t.name}`) ?? byName.set(`${t.kind}|${t.name}`, []).get(`${t.kind}|${t.name}`)!).push(t);
    const matched = new Set<TypeDeclaration>();
    for (const n of old) {
      const t = byName.get(`${n.kind}|${n.key}`)?.find((x) => !matched.has(x));
      if (!t) {
        add(localFriends.has(n.key) ? 'old-reads-local-friends-as-a-class' : 'type-old-only:unexplained', `${file.name}:${n.source?.line} ${n.kind} ${n.key}`);
        continue;
      }
      matched.add(t);
      const a = sig.type({ ...n, superclass: n.superClass });
      const b = sig.type({ ...t, interfaces: t.interfaces.map((i) => i.name) });
      if (a === b) r.typesAgree += 1;
      else add('type-options:unexplained', `${file.name}:${t.row} ${t.name}\n    old ${a}\n    new ${b}`);
      const om = oldMembers(n);
      const nm = newMembers(t);
      r.members.old += om.length;
      r.members.new += nm.length;
      const left = [...nm];
      const beginOf = om.some((m) => /^attribute BEGIN\|/.test(m));
      for (const m of om) {
        const k = left.indexOf(m);
        if (k >= 0) { left.splice(k, 1); r.members.agree += 1; } else add(memberCategory(m, 'old', beginOf, nm), `${file.name} ${t.name}: ${m}`);
      }
      for (const m of left) add(memberCategory(m, 'new', beginOf, om), `${file.name} ${t.name}: ${m}`);
    }
    const lastOld = Math.max(0, ...tokenize(file.source).map((x) => x.line));
    for (const t of d.types) {
      if (matched.has(t)) continue;
      // The old splitter lost the rest of the file (an open literal it never closes): nothing after this line is read.
      add(t.row > lastOld ? 'old-splitter-stops-before-it' : 'type-new-only:unexplained', `${file.name}:${t.row} ${t.kind} ${t.name}`);
    }
  }
  return r;
}

if (require.main === module) {
  const r = runDeclarationShadow(corpusFromArgs());
  console.log(`files ${r.files}; types old ${r.oldTypes}, new ${r.newTypes}, options agree ${r.typesAgree}`);
  console.log(`members old ${r.members.old}, new ${r.members.new}, agree ${r.members.agree}`);
  for (const [k, v] of Object.entries(r.categories).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  if (process.argv.includes('--samples')) for (const [k, v] of Object.entries(r.samples)) console.log(`\n${k}\n  ${v.join('\n  ')}`);
}
