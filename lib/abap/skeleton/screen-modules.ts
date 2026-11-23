import type { AbapStatement } from '../statement-reader';
import type { SkeletonGraph } from './graph';

/**
 * Pass "screen modules" — engine 3.5.0 (`ENGINE_READS_350_FROM`), after the report chain and before the notes.
 *
 * Reads: the user tasks a `CALL SCREEN n` drew, the entry regions of the dialog modules (`MODULE m OUTPUT|INPUT`,
 * label `M OUTPUT` / `M INPUT`) and the statements. Writes: `detail.screenModules` (the region keys of the modules
 * that belong to screen `n`, PBO before PAI, each in source order) on the user task, and `detail.screen` (the screen
 * number) on the start node of each such module region. Adds no node and no edge.
 *
 * Which module a screen's flow logic calls is not in the ABAP source; the flow logic is a part of the screen. What the
 * source does carry is SAP's naming convention: the modules of screen 9000 carry its number (`STATUS_9000`,
 * `USER_COMMAND_9000`, `PAI_0100` for screen 100). A module is linked to a `CALL SCREEN` with a literal number when a
 * run of three or more digits in its name has that number's value. A screen number read from a variable
 * (`CALL SCREEN lv_dynnr`) or a module whose name carries no number is linked to nothing; before 3.5.0 no `CALL
 * SCREEN` was linked to any module, and the user task "9000" stood apart from the modules it shows.
 */
export function linkScreenModules(graph: SkeletonGraph, statements: readonly AbapStatement[]): void {
  const modules = graph.regions
    .filter((r) => r.kind === 'entry')
    .map((r) => ({ region: r, m: /^([\w/]+)\s+(OUTPUT|INPUT)$/i.exec(r.label) }))
    .filter((x): x is { region: typeof x.region; m: RegExpExecArray } => x.m !== null)
    .map(({ region, m }) => ({
      region,
      pbo: m[2].toUpperCase() === 'OUTPUT',
      numbers: new Set((m[1].match(/\d{3,}/g) ?? []).map((d) => Number(d))),
    }));
  if (!modules.length) return;
  for (const node of graph.nodes) {
    if (node.kind !== 'user-task' || !node.anchor) continue;
    const statement = statements[node.anchor.statementIndex];
    const screen = statement ? /^CALL\s+SCREEN\s+(\d+)\b/i.exec(statement.text)?.[1] : undefined;
    if (!screen) continue;
    const number = Number(screen);
    const linked = modules
      .filter((x) => x.numbers.has(number))
      .sort((a, b) => Number(b.pbo) - Number(a.pbo) || (a.region.anchor?.lineStart ?? 0) - (b.region.anchor?.lineStart ?? 0));
    if (!linked.length) continue;
    node.detail = { ...(node.detail ?? {}), screenModules: linked.map((x) => x.region.key) };
    for (const { region } of linked) {
      const start = graph.nodes.find((n) => n.kind === 'start' && n.region === region.key);
      if (start) start.detail = { ...(start.detail ?? {}), screen };
    }
  }
}
