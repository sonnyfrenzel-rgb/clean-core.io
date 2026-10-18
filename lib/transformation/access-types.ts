/**
 * The types the access interface needs live in the interface (roadmap 3.0.18 item 13, the PM trial of 18.10.2026).
 *
 * The access interface typed its parameters by the logic class (`data_tab TYPE zcl_x_logic=>tt_csv`, `is_selection
 * TYPE zcl_x_logic=>ty_run_selection`), and the logic class holds `mo_access TYPE REF TO zif_x_access`: each needs
 * the other's definition to activate, a cycle abaplint's `cyclic_oo` names on every RAP package with an access layer
 * (SD, PM, QM of the 3.0.17 acceptance). Here the types the interface's signatures name — and every type or constant
 * those definitions read — are declared in the interface; the logic class keeps each name as an alias
 * (`TYPES tt_csv TYPE zif_x_access=>tt_csv`), so every body, test and caller that writes `tt_csv` or
 * `zcl_x_logic=>tt_csv` reads the same type as before. A constant a moved type reads is copied, not moved: the
 * class's bodies read it unqualified.
 *
 * Pure: the class's TYPES block in (one statement per line, four spaces in, with its period), both blocks out.
 */

export interface HoistedAccessTypes {
  /** The class's TYPES block with each moved type as an alias of the interface's. */
  classTypes: string[];
  /** The declarations the interface carries, two spaces in (empty when nothing moves). */
  interfaceTypes: string[];
  /** The type names now declared in the interface (lower case), in declaration order. */
  moved: string[];
}

interface Item {
  kind: 'type' | 'constant';
  name: string;
  /** Indexes of the item's lines in the block (without the comments before it). */
  lines: number[];
}

const OPEN = /^\s*(TYPES|CONSTANTS)\s+BEGIN\s+OF\s+([\w/]+)/i;
const CLOSE = /^\s*(TYPES|CONSTANTS)\s+END\s+OF\s+([\w/]+)/i;
const SINGLE = /^\s*(TYPES|CONSTANTS)\s+([\w/]+)/i;
const isComment = (line: string) => /^\s*["*]/.test(line);

function itemsOf(block: readonly string[]): Item[] {
  const items: Item[] = [];
  let open: Item | null = null;
  let depth = 0;
  block.forEach((line, i) => {
    // A comment inside a structure is the structure's (a component's note); one between items stays where it is.
    if (isComment(line)) {
      if (open) open.lines.push(i);
      return;
    }
    const begin = OPEN.exec(line);
    const end = CLOSE.exec(line);
    if (open) {
      open.lines.push(i);
      if (begin) depth++;
      else if (end && --depth === 0) open = null;
      return;
    }
    const kind = (k: string) => (k.toUpperCase() === 'TYPES' ? 'type' : 'constant') as Item['kind'];
    if (begin) {
      open = { kind: kind(begin[1]), name: begin[2].toLowerCase(), lines: [i] };
      depth = 1;
      items.push(open);
      return;
    }
    const single = SINGLE.exec(line);
    if (single) items.push({ kind: kind(single[1]), name: single[2].toLowerCase(), lines: [i] });
  });
  return items;
}

/** The names a statement reads as a type or constant: whole words, not a component (`-x`) or another class's (`=>x`). */
function wordsOf(text: string): Set<string> {
  const out = new Set<string>();
  const code = text.replace(/'(?:[^']|'')*'|`(?:[^`]|``)*`/g, "''").replace(/".*$/, '');
  for (const m of code.matchAll(/(?<![\w/~>-])[a-z_/][\w/]*/gi)) out.add(m[0].toLowerCase());
  return out;
}

/**
 * Moves the types `needed` names (and what they read) from the class's TYPES block into the access interface.
 * `accessIf` is the interface's name. A name the block does not declare is ignored.
 */
export function hoistAccessTypes(block: readonly string[], needed: Iterable<string>, accessIf: string): HoistedAccessTypes {
  const items = itemsOf(block);
  const byName = new Map(items.map((it) => [it.name, it]));
  const reads = new Map(
    items.map((it) => {
      const words = new Set<string>();
      it.lines.forEach((i) => {
        // The first word after TYPES/CONSTANTS (BEGIN OF) is the item's own name or a component's: no read.
        const stripped = block[i].replace(/^\s*(?:TYPES|CONSTANTS)\s+(?:(?:BEGIN|END)\s+OF\s+)?[\w/]+/i, '');
        for (const w of wordsOf(stripped)) if (w !== it.name && byName.has(w)) words.add(w);
      });
      return [it.name, words] as const;
    }),
  );
  const closure = new Set<string>();
  const visit = (name: string) => {
    if (closure.has(name) || !byName.has(name)) return;
    closure.add(name);
    for (const w of reads.get(name) ?? []) visit(w);
  };
  for (const n of needed) visit(n.toLowerCase());
  const moved = items.filter((it) => closure.has(it.name) && it.kind === 'type');
  if (moved.length === 0) return { classTypes: [...block], interfaceTypes: [], moved: [] };

  const inInterface = items.filter((it) => closure.has(it.name));
  const interfaceTypes = [
    `  " The types these methods take, declared here so the interface needs nothing of the logic class: the two activate`,
    '  " in either order. The logic class names each as its own (an alias), and copies the constants they read.',
    ...inInterface.flatMap((it) => it.lines.map((i) => block[i].replace(/^ {4}/, '  '))),
  ];
  const aliasAt = new Map(moved.map((it) => [it.lines[0], it]));
  const dropped = new Set(moved.flatMap((it) => it.lines.slice(1)));
  const classTypes: string[] = [];
  block.forEach((line, i) => {
    if (dropped.has(i)) return;
    const it = aliasAt.get(i);
    if (!it) return classTypes.push(line);
    const indent = /^\s*/.exec(line)![0];
    classTypes.push(`${indent}TYPES ${it.name} TYPE ${accessIf}=>${it.name}.`);
  });
  const header = classTypes.findIndex((l) => new RegExp(`TYPE ${accessIf}=>`, 'i').test(l));
  classTypes.splice(header, 0, `    " Declared in ${accessIf}, whose methods take them (an alias here): the interface needs nothing of this class.`);
  return { classTypes, interfaceTypes, moved: moved.map((it) => it.name) };
}
