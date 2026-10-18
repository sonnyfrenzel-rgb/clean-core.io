/**
 * The original's list display as the run's rows (scaffold version 18, roadmap 3.0.18 item 14).
 *
 * A report shows its result in an ALV grid: `CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' … TABLES t_outtab = gt_orders`,
 * `REUSE_ALV_LIST_DISPLAY` the same way, or `cl_salv_table=>factory( … CHANGING t_table = gt_orders )`. On the
 * CAP/Node route there is no screen; what the original displays is what a run answers as its rows. Until scaffold
 * version 17 nothing put them there — the 3.0.17 acceptance run of the 1,000-line example answered `rows: []` with its
 * orders processed. Now the frame of the step that holds the display (engine-written) sets `st.rows` to a copy of the
 * displayed table where the display happens, and only when the routine reaches it: a `CHECK p_alv = abap_true` that
 * leaves the routine before the display means no rows, as the original shows none.
 *
 * Read here, from the statements alone; the frame lines are written by `scaffold-node.ts`. A display the engine cannot
 * place with certainty is listed with its reason instead (TRACE.md): inside a branch or loop of its routine, behind an
 * exit no check of the plan stands for, behind a check that reads a computed value, on a table that is no global of
 * the program, or in the run order itself (the orchestrator) or a split part.
 *
 * Pure: plan, statements, blocks and shapes in, sites out. No network, no model.
 */

import type { AbapStatement } from '../abap/statement-reader';
import type { BlockStructure } from '../abap/block-structure';
import type { AbapShapes } from './abap-shapes';
import type { PlanGuard, Unit, UnitPlan } from './types';

export interface DisplaySite {
  unitId: string;
  /** The line of the display statement. */
  line: number;
  /** `CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'`, `cl_salv_table=>factory`. */
  via: string;
  /** The displayed table as the original writes it, upper case. */
  table: string;
  /** The `Locals` key of that table, or null when it is no global of the program. */
  key: string | null;
  /** The checks in the body that leave the routine before the display: the frame evaluates them (raw only). */
  exits: string[];
  /** Why the frame does not place the rows, or null when it does. */
  notPlaced: string | null;
}

const ALV_FM = /^CALL\s+FUNCTION\s+'(REUSE_ALV_(?:GRID|LIST)_DISPLAY)'/i;
const ALV_TABLE = /\bTABLES\b[\s\S]*?\bt_outtab\s*=\s*([\w/]+)(?:\[\])?/i;
const SALV = /\bcl_salv_table\s*=>\s*factory\b/i;
const SALV_TABLE = /\bCHANGING\b[\s\S]*?\bt_table\s*=\s*([\w/]+)(?:\[\])?/i;
/** Statements that leave the routine (or a loop pass) where they stand. */
const EXIT = /^(?:RETURN|EXIT|STOP|LEAVE|CHECK|REJECT|RAISE)$/i;
const LOOPS = new Set(['loop', 'do', 'while', 'select', 'provide']);
const CONTAINERS = new Set(['form', 'method', 'module', 'class', 'interface', 'define']);

/** The display of one statement, or null: what it shows and how it names it. */
export function displayOf(st: Pick<AbapStatement, 'text' | 'keyword'>): { via: string; table: string } | null {
  const fm = ALV_FM.exec(st.text);
  if (fm) {
    const t = ALV_TABLE.exec(st.text);
    return t ? { via: `CALL FUNCTION '${fm[1].toUpperCase()}'`, table: t[1].toUpperCase() } : null;
  }
  if (SALV.test(st.text)) {
    const t = SALV_TABLE.exec(st.text);
    return t ? { via: 'cl_salv_table=>factory', table: t[1].toUpperCase() } : null;
  }
  return null;
}

/** A message that ends the routine: TYPE 'E', 'A' or 'X' (an S, I or W message goes on). */
const endingMessage = (st: AbapStatement) => st.keyword === 'MESSAGE' && /\bTYPE\s+'?[EAX]'?(?:\s|$)/i.test(st.text);

/**
 * Every display of the original in the plan's units. A display is placed when it stands at the level of its routine
 * (no IF, CASE, loop or CATCH around it; a TRY's protected part is fine) and every statement before it that can leave
 * the routine is a check of the plan — at entry (the frame leaves before the body) or a raw check in the body (the
 * frame evaluates it: it reads only the request, so its answer does not move while the body runs).
 */
export function displaySitesOf(plan: Pick<UnitPlan, 'units' | 'guards'>, statements: readonly AbapStatement[], blocks: Pick<BlockStructure, 'enclosing'>, shapes: Pick<AbapShapes, 'globals' | 'structures'>): DisplaySite[] {
  const out: DisplaySite[] = [];
  const unitAt = (line: number): Unit | undefined => plan.units.find((u) => !plan.units.some((p) => p.part?.parent === u.id) && u.abap.some((r) => line >= r.lineStart && line <= r.lineEnd));
  const tableTypes = new Set(shapes.structures.map((s) => `${s.tsName}[]`));
  for (let i = 0; i < statements.length; i++) {
    const d = displayOf(statements[i]);
    if (!d) continue;
    const u = unitAt(statements[i].lineStart);
    if (!u) continue;
    const global = shapes.globals.find((g) => g.name.toUpperCase() === d.table);
    const site: DisplaySite = { unitId: u.id, line: statements[i].lineStart, via: d.via, table: d.table, key: global && tableTypes.has(global.ts) ? global.key : null, exits: [], notPlaced: null };
    out.push(site);
    if (u.kind === 'orchestrator') {
      site.notPlaced = 'it stands in the run order itself, whose statements come from several blocks of the original';
      continue;
    }
    if (u.part) {
      site.notPlaced = 'its routine is split into parts';
      continue;
    }
    if (!site.key) {
      site.notPlaced = `${d.table} is no global table of the program with a structure the engine reads`;
      continue;
    }
    if (!/\): StepResult$/.test(u.signature)) {
      site.notPlaced = 'its function returns a value of its own';
      continue;
    }
    const around = (j: number) => blocks.enclosing[j]?.filter((b) => !CONTAINERS.has(b.kind)) ?? [];
    const outer = around(i);
    const inCatch = outer.some((b) => b.kind === 'try' && statements.slice(b.openIndex + 1, i).some((s, k) => /^(?:CATCH|CLEANUP)$/.test(s.keyword) && around(b.openIndex + 1 + k).at(-1) === b));
    if (outer.some((b) => b.kind !== 'try') || inCatch) {
      site.notPlaced = `it stands inside ${outer.find((b) => b.kind !== 'try')?.kind.toUpperCase() ?? 'a CATCH'} of its routine — whether the routine reaches it is the body's`;
      continue;
    }
    const start = Math.min(...u.abap.map((r) => r.lineStart));
    const guards = plan.guards.filter((g) => g.carried && g.unitId === u.id && g.line < site.line);
    const guardAt = (st: AbapStatement): PlanGuard | undefined => guards.find((g) => g.line === st.lineStart || g.endingLine === st.lineStart);
    const exits = new Set<string>();
    for (let j = 0; j < i; j++) {
      const st = statements[j];
      if (st.lineStart < start || !u.abap.some((r) => st.lineStart >= r.lineStart && st.lineStart <= r.lineEnd)) continue;
      if (!EXIT.test(st.keyword) && !endingMessage(st)) continue;
      const enclosing = around(j);
      // EXIT, CHECK and CONTINUE inside a loop end the pass or the loop, not the routine.
      if (/^(?:EXIT|CHECK|CONTINUE)$/i.test(st.keyword) && enclosing.some((b) => LOOPS.has(b.kind))) continue;
      const g = guardAt(st);
      // The check itself must stand at the routine's level: a CHECK, or the IF whose block ends it.
      const gIndex = g ? statements.findIndex((s) => s.lineStart === g.line) : -1;
      if (!g || gIndex < 0 || around(gIndex).length > 0) {
        site.notPlaced = `L${st.lineStart} ${st.keyword} can leave the routine before the display, and no check of the plan stands for it`;
        break;
      }
      if (g.outcome === 'refuses') continue; // the body returns the refusal: the frame places nothing
      if (g.placement === 'entry') continue; // the frame leaves before the body
      if (g.basis !== 'raw') {
        site.notPlaced = `its check at L${g.line} reads a value computed before it — whether the routine reaches the display is the body's`;
        break;
      }
      exits.add(g.id);
    }
    if (!site.notPlaced) site.exits = [...exits];
  }
  // One display a routine: two in one routine would each replace the rows, in an order only the body knows.
  for (const s of out) {
    if (!s.notPlaced && out.filter((x) => x.unitId === s.unitId).length > 1) s.notPlaced = 'its routine displays more than once';
  }
  return out;
}

/** The tag of a display the frame turns into the run's rows, read back by the trace (`displaysIn`). */
export const DISPLAY_TAG = '@cc-display';

/** The tag line's text: "L616 CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' … t_outtab = GT_ORDERS → the run's rows (displayAlv, U19)". */
export function displayWords(site: DisplaySite, fn: string, guardLines: ReadonlyMap<string, number> = new Map()): string {
  const shown = site.via.startsWith('CALL FUNCTION') ? `${site.via} … t_outtab = ${site.table}` : `${site.via}( … t_table = ${site.table} )`;
  if (site.notPlaced) return `L${site.line} ${shown} (${fn}, ${site.unitId}): not placed as the run's rows — ${site.notPlaced}`;
  const exits = site.exits.map((id) => `L${guardLines.get(id) ?? '?'}`);
  return `L${site.line} ${shown} → the run's rows (${fn}, ${site.unitId})${exits.length ? `, only when the routine reaches it (its check${exits.length === 1 ? '' : 's'} at ${exits.join(', ')})` : ''}`;
}

/** The `@cc-display` lines of a step file, as TRACE.md states them. */
export function displaysIn(content: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`^\\s*(?://|\\*)\\s*${DISPLAY_TAG} (.+)$`, 'gm');
  for (let m = re.exec(content); m !== null; m = re.exec(content)) out.push(m[1].trim());
  return out;
}
