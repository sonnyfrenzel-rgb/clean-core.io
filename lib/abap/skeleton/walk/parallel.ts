import { anchorOf, snippet, tokenIndexOf } from '../anchors';
import type { Exit } from '../graph';
import type { ParallelGroup } from '../walk-readers';
import { walkStatement } from './statement';
import type { WalkContext, Walker } from './walker';

/**
 * Roadmap 2.17 (a), parallelism — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"). Two or more
 * `STARTING NEW TASK` calls the source proves are waited for (`WalkReaders.parallelGroupAt`) are one fork. Moved out
 * of `SkeletonBuilder` unchanged.
 */

/**
 * The fork, its branches and — where the source waits — the join.
 *
 * Rule 6 holds for both gateways. The fork is named `STARTING NEW TASK`,
 * three words that stand in the source, and is anchored at the `STARTING`
 * token of the first call, which is the evidence it is drawn from; the join
 * carries the `WAIT` statement as the source writes it, anchored at it. A
 * parallel gateway carries no condition, here or in the file — it is not a
 * decision, which is why the kind is `parallel-gateway` and not `gateway`.
 */
export function walkParallel(w: Walker, group: ParallelGroup, ctx: WalkContext, incoming: Exit[]): Exit[] {
  const first = w.input.statements[group.members[0]];
  const fork = w.graph.addNode('parallel-gateway', 'STARTING NEW TASK',
    anchorOf(first, tokenIndexOf(first, /^STARTING$/i)), ctx.region, ctx.container, {
      detail: { direction: 'diverging', branches: group.members.length },
    });
  w.graph.connect(incoming, fork.id);

  const branchExits: Exit[] = [];
  for (const member of group.members) {
    branchExits.push(...walkStatement(w, w.input.statements[member], ctx,
      [{ from: fork.id, condition: '', kind: 'sequence' }], null).exits);
  }
  if (group.joinIndex === null) {
    // **The caller's continuation is not the exit of the tasks.** Handing the
    // branch exits back would let the walker hang the next statement of the
    // caller on them, and the diagram would then say the caller ran on *after
    // the tasks came back*. The source says the opposite — that is why there
    // is no `WAIT` in it. So the caller is one more branch of the same fork:
    // it runs concurrently with the tasks, and the asynchronous branches end
    // where the source stops speaking about them.
    w.graph.note('fork-without-join', first,
      `${group.members.length} tasks are started asynchronously and nothing in this source waits for them. `
      + 'The caller carries on at once, so no step after the fork depends on a result: the branches are drawn '
      + 'without a join, and where each task ends is outside this program.');
    return [{ from: fork.id, condition: '', kind: 'sequence' }];
  }

  const wait = w.input.statements[group.joinIndex];
  const join = w.graph.addNode('parallel-gateway', snippet(wait.text), anchorOf(wait),
    ctx.region, ctx.container, { detail: { direction: 'converging', branches: group.members.length } });
  w.graph.connect(branchExits, join.id);
  return [{ from: join.id, condition: '', kind: 'sequence' }];
}
