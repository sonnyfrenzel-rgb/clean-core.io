/**
 * The stop flag of a split routine (scaffold version 22, owner decision 22.10.2026).
 *
 * `splitOversized` (unit-plan.ts) cuts an oversized FORM or METHOD into parts that its parent calls one after the
 * other. An exit that leaves the routine — RETURN, a CHECK or EXIT outside a loop — leaves only its part, so without a
 * flag the next part would still run. The parent's shared locals therefore hold one flag, "the routine has ended": a
 * part sets it right before it leaves the routine, and the parent calls the next part only while it is not set.
 *
 * The exits are read as the planner reads the original's CHECK (unit-plan.ts, the guards' `outcome`): a CHECK inside
 * a loop skips the pass and an EXIT inside a loop leaves the loop — both stay local; RETURN always leaves the routine;
 * a CHECK or EXIT outside a loop leaves it. Node: a bare `return;` at the body's own function level leaves the routine;
 * `continue`, `break` and a `return` inside a callback stay local; a `return` of a refusal ends the run anyway.
 *
 * Pure: names and statements in, names and refusal texts out.
 */
import type { AbapStatement } from '../abap/statement-reader';
import type { BlockStructure } from '../abap/block-structure';

/** The flag's name in a RAP split routine: a component of `ls_local` and a CHANGING parameter of every part. */
export const RAP_STOP_FLAG = 'cc_routine_ended';
/** The flag's name in a Node split routine: a property of `local`. */
export const NODE_STOP_FLAG = 'ccRoutineEnded';

/** What a Node part's fill request says of the stop flag. */
export const nodeStopFlagNote = (flag: string) =>
  `// This function is one part of a split routine: the parent calls the next part unless local.${flag} is true. Where the original leaves the routine early (RETURN, a CHECK or EXIT outside a loop), write local.${flag} = true; directly before the return. A CHECK in a loop is continue, an EXIT in a loop is break: they need no flag.`;

/** What a RAP part's fill request says of the stop flag. */
export const rapStopFlagNote = (flag: string) =>
  `" This method is one part of a split routine: the parent calls the next part unless ${flag} (a CHANGING parameter) is abap_true. Where the original leaves the routine (RETURN, a CHECK or EXIT outside a loop), write ${flag} = abap_true. directly before RETURN; a CHECK outside a loop becomes IF NOT ( <condition> ). ${flag} = abap_true. RETURN. ENDIF. A CHECK or EXIT inside a loop ends only the pass or the loop: no flag.`;

/** `base`, or `base_2`, `base_3` … (Node: `base2` …) — the first that is none of `taken` (compared without case). */
export function stopFlagName(base: string, taken: Iterable<string>): string {
  const t = new Set([...taken].map((n) => n.toLowerCase()));
  const sep = base.includes('_') ? '_' : '';
  let name = base;
  for (let i = 2; t.has(name.toLowerCase()); i++) name = `${base}${sep}${i}`;
  return name;
}

const LOOP_KINDS = new Set(['loop', 'do', 'while', 'select']);

/**
 * The ABAP statements of a body that leave the routine early: RETURN anywhere, CHECK or EXIT outside a loop. A last
 * statement at the body's own level is not early — nothing follows it — and is not listed.
 */
export function abapRoutineExits(statements: readonly Pick<AbapStatement, 'keyword' | 'text' | 'lineStart'>[], blocks: Pick<BlockStructure, 'enclosing'>): number[] {
  const out: number[] = [];
  statements.forEach((s, i) => {
    if (s.keyword !== 'RETURN' && s.keyword !== 'CHECK' && s.keyword !== 'EXIT') return;
    const enclosing = blocks.enclosing[i] ?? [];
    if (s.keyword !== 'RETURN' && enclosing.some((b) => LOOP_KINDS.has(b.kind))) return;
    if (i === statements.length - 1 && enclosing.length === 0) return;
    out.push(i);
  });
  return out;
}

/** Refusals of a RAP part body whose routine-level exit does not set the flag right before it (`abapRoutineExits`). */
export function abapStopFlagRefusals(statements: readonly Pick<AbapStatement, 'keyword' | 'text' | 'lineStart'>[], blocks: Pick<BlockStructure, 'enclosing'>, flag: string): string[] {
  const sets = new RegExp(`^${flag}\\s*=\\s*abap_true$`, 'i');
  const missing: string[] = [];
  const checks: string[] = [];
  for (const i of abapRoutineExits(statements, blocks)) {
    const s = statements[i];
    if (s.keyword === 'CHECK') {
      checks.push(`body line ${s.lineStart}: ${s.text.slice(0, 50)}`);
      continue;
    }
    const before = statements[i - 1];
    if (!before || !sets.test(before.text.trim())) missing.push(`body line ${s.lineStart}: ${s.keyword}`);
  }
  const out: string[] = [];
  if (missing.length > 0) {
    out.push(
      `leaves the routine without setting ${flag} right before it (${missing.slice(0, 4).join('; ')}) — this method is one part of a split routine and the frame runs the next part unless ${flag} is set: write ${flag} = abap_true. directly before each RETURN, and before an EXIT outside a loop; a CHECK or EXIT inside a loop ends only the pass or the loop and needs no flag`,
    );
  }
  if (checks.length > 0) {
    out.push(
      `a CHECK outside a loop leaves the routine (${checks.slice(0, 4).join('; ')}) — this method is one part of a split routine: write it as IF NOT ( <condition> ). ${flag} = abap_true. RETURN. ENDIF. so the frame does not run the next part`,
    );
  }
  return out;
}

/**
 * Refusals of a Node part body whose bare `return;` at its own function level does not set the flag right before it.
 * `mask` marks the code characters of `body` (`codeMask`), so a `return` in a string or comment does not count.
 */
export function nodeStopFlagRefusals(body: string, mask: Uint8Array, flag: string): string[] {
  // Each `{` of the body: a function's body (after `=>`, or after the parameter list of `function f(…)` or a method)
  // or a plain block. A `return` counts only where no function's body encloses it.
  const CONTROL = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);
  const parens: number[] = [];
  const openOf = new Map<number, number>();
  const braces: boolean[] = [];
  const fnDepthAt = new Int32Array(body.length + 1);
  const braceDepthAt = new Int32Array(body.length + 1);
  let fnDepth = 0;
  for (let i = 0; i < body.length; i++) {
    fnDepthAt[i] = fnDepth;
    braceDepthAt[i] = braces.length;
    if (!mask[i]) continue;
    const c = body[i];
    if (c === '(') parens.push(i);
    else if (c === ')') {
      const open = parens.pop();
      if (open !== undefined) openOf.set(i, open);
    } else if (c === '{') {
      const before = body.slice(0, i).replace(/\s+$/, '');
      let fn = before.endsWith('=>');
      if (!fn && before.endsWith(')')) {
        const open = openOf.get(before.length - 1);
        const word = open !== undefined ? /([A-Za-z_$][\w$]*)\s*$/.exec(body.slice(0, open))?.[1] : undefined;
        fn = !!word && !CONTROL.has(word);
      }
      braces.push(fn);
      if (fn) fnDepth++;
    } else if (c === '}') {
      if (braces.pop()) fnDepth--;
    }
  }
  const sets = new RegExp(`local\\s*\\.\\s*${flag}\\s*=\\s*true\\s*;?$`);
  const missing: string[] = [];
  for (const m of body.matchAll(/\breturn\b(\s*(?:undefined\s*)?)(;|(?=\s*\}|\s*$|\n))/g)) {
    const at = m.index ?? 0;
    if (!mask[at] || fnDepthAt[at] > 0) continue;
    // A last statement at the body's own level is not early: nothing follows it.
    let codeAfter = false;
    for (let k = at + m[0].length; k < body.length && !codeAfter; k++) codeAfter = !!mask[k] && !/[\s;]/.test(body[k]);
    if (!codeAfter && braceDepthAt[at] === 0) continue;
    if (!sets.test(body.slice(0, at).replace(/\s+$/, ''))) missing.push(`body line ${body.slice(0, at).split('\n').length}`);
  }
  if (missing.length === 0) return [];
  return [
    `returns without setting local.${flag} = true; right before it (${missing.slice(0, 4).join(', ')}) — this function is one part of a split routine and the frame runs the next part unless local.${flag} is set: write local.${flag} = true; directly before each return that leaves the routine early (continue, break, a return inside a callback, a returned refusal and a last return need none)`,
  ];
}
