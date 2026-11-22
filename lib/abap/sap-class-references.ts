import { references, type Reference, type ReferenceKind } from '../engine4/references';
import { gradeSapObject } from './catalog-service';
import { parsedSourceOf } from './statement-reader';

/**
 * The SAP objects a source names, read from the L4 reference table (`lib/engine4/references.ts`) — release 3.4.0,
 * the class gap (owner decision 22.11.2026; ER-03; `engine-reads-340-gate.ts`).
 *
 * ADR-141 extends the one exception of ADR-133 to this module: it is the only place in `lib/abap/` that reads
 * `references`, and it reads it over the same parse-once `ParsedSource` the statement reader is built on
 * (`parsedSourceOf`). Everything else of `lib/engine4/` stays inert.
 *
 * What counts as a reference here: a name written in the statement itself (`resolution: 'static'`) that the source
 * does not define. A name the table resolved from a variable's value is never read (`staticExternalReferences`).
 *
 * The grade is SAP's published classification (`gradeSapObject`), the residual C for an SAP name neither file lists
 * included — the same answer `/api/abcd-classify` and the reference corpus read. It decides *which* references the
 * evidence reports; the A–D letter itself never enters a finding (findings go into the signed run), the state does.
 */

/** The reference kinds that name a class, an interface or an exception class. */
const CLASS_KINDS: ReadonlySet<ReferenceKind> = new Set<ReferenceKind>(['class', 'interface', 'classOrInterface', 'exception']);

export type SapClassKind = 'class' | 'interface' | 'classOrInterface' | 'exception';

/** One SAP class, interface or exception class the source names, graded C or D. */
export interface SapClassReference {
  /** Upper-cased. */
  name: string;
  /** What the syntax says it is; `classOrInterface` where it does not say (`TYPE REF TO x`, `x=>m`). */
  kind: SapClassKind;
  /** C or D — never written into a finding. */
  grade: 'C' | 'D';
  /** SAP's verbatim state behind the grade (`notToBeReleased`, `deprecated`, `noAPI`); absent for the residual C. */
  state?: string;
  /** Every line the object stands on, ascending, without repeats. */
  lines: number[];
  /** How the source uses it, in the order first seen (`typeRef`, `staticAccess`, `catch`, …). */
  uses: string[];
}

/**
 * The references a source writes as names and does not define, in source order.
 *
 * **Static only** (engine review of 22.11.2026, hard limit). A name the table resolved from a constant, a start
 * value or a literal assigned before the use (`constant`, `value`, `assigned`, `onlyValue`, `declaredType`) never
 * feeds a reading here: those resolutions do not follow scope (a constant of one FORM resolves a variable of another),
 * routines (the last write in source order wins) or loops, so a finding built on them could name an object the
 * program never touches. `tests/engine-340-class-gap.spec.ts` proves a dynamic name never becomes a finding.
 */
export function staticExternalReferences(code: string): Reference[] {
  const parsed = parsedSourceOf(code);
  return references(parsed.statements, parsed.tree).references.filter((r) => !r.defined && r.name !== null && r.resolution === 'static');
}

/** The most specific kind seen for one name: an explicit `class`, `interface` or `exception` wins over `classOrInterface`. */
function narrower(a: SapClassKind, b: SapClassKind): SapClassKind {
  if (a === b) return a;
  if (a === 'classOrInterface') return b;
  if (b === 'classOrInterface') return a;
  // A class used both as an exception and as a plain class is an exception class.
  return a === 'exception' || b === 'exception' ? 'exception' : a;
}

/**
 * Every SAP class, interface and exception class the source names that SAP's files grade at level C or D, one entry
 * per object, in the order the objects first appear. `catalogSnapshot` is the catalog the run reads
 * (`buildAbapEvidence`'s own argument); omitted, the default file.
 */
export function readSapClassReferences(code: string, catalogSnapshot?: string): SapClassReference[] {
  const byName = new Map<string, SapClassReference>();
  const graded = new Map<string, ReturnType<typeof gradeSapObject>>();
  for (const ref of staticExternalReferences(code)) {
    if (!CLASS_KINDS.has(ref.kind)) continue;
    const name = ref.name!;
    let g = graded.get(name);
    if (!g) {
      g = gradeSapObject(name, catalogSnapshot);
      graded.set(name, g);
    }
    if (g.grade !== 'C' && g.grade !== 'D') continue;
    if (g.provenance !== 'catalog' && g.provenance !== 'catalog-residual') continue;
    const held = byName.get(name);
    if (held) {
      if (!held.lines.includes(ref.row)) held.lines.push(ref.row);
      if (!held.uses.includes(ref.use)) held.uses.push(ref.use);
      held.kind = narrower(held.kind, ref.kind as SapClassKind);
    } else {
      byName.set(name, {
        name,
        kind: ref.kind as SapClassKind,
        grade: g.grade,
        ...(g.state ? { state: g.state } : {}),
        lines: [ref.row],
        uses: [ref.use],
      });
    }
  }
  for (const r of byName.values()) r.lines.sort((a, b) => a - b);
  return [...byName.values()];
}

/** One DDIC type the source declares with (`TYPE x`, `TYPE TABLE OF x`, `TYPE RANGE OF x`, …), graded by SAP's files. */
export interface SapTypeReference {
  /** Upper-cased; a component reference (`vbak-vbeln`) is graded and listed by its structure. */
  name: string;
  level: 'A' | 'B' | 'C' | 'D';
  state?: string;
  lines: number[];
}

/**
 * The DDIC types (data elements, structures, table types, and tables used as types) the source declares with and
 * SAP's files grade A to D, one entry per object — for the IT view only (owner decision 22.11.2026: shown grouped by
 * level, not as findings). A customer type, a type the source defines and a name neither file lists and that is not
 * an SAP name are left out. Display only: never stored and never signed.
 */
export function readSapTypeReferences(code: string, catalogSnapshot?: string): SapTypeReference[] {
  const byName = new Map<string, SapTypeReference>();
  const graded = new Map<string, ReturnType<typeof gradeSapObject>>();
  for (const ref of staticExternalReferences(code)) {
    if (ref.kind !== 'type') continue;
    const name = ref.name!;
    let g = graded.get(name);
    if (!g) {
      g = gradeSapObject(name, catalogSnapshot);
      graded.set(name, g);
    }
    if (g.grade === 'Unknown' || (g.provenance !== 'catalog' && g.provenance !== 'catalog-residual')) continue;
    const held = byName.get(name);
    if (held) {
      if (!held.lines.includes(ref.row)) held.lines.push(ref.row);
    } else {
      byName.set(name, { name, level: g.grade, ...(g.state ? { state: g.state } : {}), lines: [ref.row] });
    }
  }
  for (const r of byName.values()) r.lines.sort((a, b) => a - b);
  return [...byName.values()];
}
