import type { SkeletonNode } from '../../process-skeleton';
import type { Exit } from '../graph';
import { FLOW_BLOCKS } from '../keywords';
import { walkBranch, walkGroupChange } from './branch';
import { walkLoop } from './loop';
import { walkParallel } from './parallel';
import { walkStatement } from './statement';
import { walkTry } from './try';
import type { WalkContext, Walker } from './walker';

/**
 * A range of statements of one region — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"). The walk's
 * loop: a flow block goes to its walker (branch, try, group change, loop), a parallel group to `walkParallel`, every
 * other statement to `walkStatement`, and what a `SET HANDLER` inside a block registered is dropped past it. This is
 * `Walker.range`, the function the walkers recurse through. Moved out of `SkeletonBuilder` unchanged.
 */

export function walkRange(w: Walker, from: number, to: number, ctx: WalkContext, incoming: Exit[]): Exit[] {
  let live = incoming;
  /** The output node a run of list statements is being folded into. */
  let outputRun: SkeletonNode | null = null;
  let i = from;

  while (i <= to) {
    const statement = w.input.statements[i];
    const block = w.input.blockAt.get(i);

    if (block) {
      outputRun = null;
      if (FLOW_BLOCKS.has(block.kind) && block.closeIndex <= to) {
        // A `SET HANDLER` inside a branch, a loop body or a TRY/CATCH may
        // not run at all, so it registers only for what follows it inside
        // that block. Past the block the registrations are what they were
        // before it.
        const registered = new Set(w.state.registeredInWalk);
        if (block.kind === 'if' || block.kind === 'case') live = walkBranch(w, block, ctx, live);
        else if (block.kind === 'try') live = walkTry(w, block, ctx, live);
        else if (block.kind === 'at') live = walkGroupChange(w, block, ctx, live);
        else live = walkLoop(w, block, ctx, live);
        w.state.registeredInWalk = registered;
        i = block.closeIndex + 1;
        continue;
      }
      // A container, a macro body, or a construct that runs past this range:
      // not a flow of this region, so it is stepped over rather than opened.
      i = Math.max(i + 1, Math.min(block.closeIndex + 1, to + 1));
      continue;
    }

    // Roadmap 2.17 (a), before the single statement: two or more
    // `STARTING NEW TASK` calls the source proves are waited for are one
    // fork, not a chain of service tasks.
    const parallel = w.input.readers.parallelGroupAt(i, to);
    if (parallel) {
      outputRun = null;
      live = walkParallel(w, parallel, ctx, live);
      i = parallel.resumeIndex;
      continue;
    }

    const produced = walkStatement(w, statement, ctx, live, outputRun);
    outputRun = produced.outputRun;
    live = produced.exits;
    i += 1;
  }
  return live;
}
