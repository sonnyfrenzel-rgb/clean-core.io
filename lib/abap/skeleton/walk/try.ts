import { afterKeyword } from '../../statement-reader';
import type { Block } from '../../block-structure';
import { anchorOf } from '../anchors';
import type { Exit } from '../graph';
import type { WalkContext, Walker } from './walker';

/**
 * `TRY … CATCH … CLEANUP … ENDTRY` in the walk — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"). The
 * protected part and each handler are walked through `w.range`; the boundaries nothing enters are recorded in
 * `state.cutOffBoundaries` for `noteUnreachableSteps`. Moved out of `SkeletonBuilder` unchanged.
 */

/**
 * `TRY … CATCH … ENDTRY` — §5.8's error boundary event.
 *
 * The protected part is the flow; every `CATCH` is a boundary event on the
 * first node of that part, and its handler joins the flow after the construct.
 */
export function walkTry(w: Walker, block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
  const handlers: number[] = [];
  for (let i = block.openIndex + 1; i < block.closeIndex; i++) {
    const enclosing = w.input.structure.enclosing[i];
    if (enclosing[enclosing.length - 1] !== block) continue;
    if (w.input.statements[i].keyword === 'CATCH' || w.input.statements[i].keyword === 'CLEANUP') {
      handlers.push(i);
    }
  }
  const protectedTo = (handlers[0] ?? block.closeIndex) - 1;
  const beforeProtected = w.graph.nodes.length;
  // A handler runs when the protected part broke off somewhere, so it — and
  // each handler after it — starts from what was registered before the TRY.
  const registered = new Set(w.state.registeredInWalk);
  // Nothing enters the TRY although its region already drew steps: what stood
  // before it does not come back. At the start of a region an empty `incoming`
  // only means the walk began here, and the region's entry reaches it. A
  // routine's end event is added before its body is walked and is no step.
  const cutOff = incoming.length === 0
    && w.graph.nodes.slice(0, beforeProtected)
      .some((n) => n.region === ctx.region.key && n.id !== ctx.region.endNodeId);
  const exits = w.range(block.openIndex + 1, protectedTo, ctx, incoming);
  const attachedTo = w.graph.nodes.slice(beforeProtected).find((n) => n.region === ctx.region.key) ?? null;

  const out = [...exits];
  for (let h = 0; h < handlers.length; h++) {
    const header = w.input.statements[handlers[h]];
    const boundary = w.graph.addNode('error-boundary', afterKeyword(header) || header.keyword,
      anchorOf(header), ctx.region, ctx.container, {
        detail: { attachedTo: attachedTo?.id ?? '', source: header.keyword },
      });
    if (attachedTo) {
      w.graph.edges.push({ from: attachedTo.id, to: boundary.id, kind: 'boundary', condition: '' });
    } else {
      // A protected part that drew no node still runs, so its handler is still
      // a path the program can take. Leaving the boundary unconnected made
      // `noteUnreachableSteps` say the opposite — that nothing leads to the
      // CATCH because what stands before it does not come back — with no
      // control flow anywhere in the source to show it (CR-07). The handler
      // hangs on what entered the TRY.
      for (const entry of incoming) {
        w.graph.edges.push({ from: entry.from, to: boundary.id, kind: 'boundary', condition: '' });
      }
      if (cutOff) w.state.cutOffBoundaries.add(boundary.id);
    }
    const to = (handlers[h + 1] ?? block.closeIndex) - 1;
    w.state.registeredInWalk = new Set(registered);
    const handled = w.range(handlers[h] + 1, to, ctx,
      [{ from: boundary.id, condition: '', kind: 'sequence' }]);
    if (header.keyword !== 'CLEANUP') {
      out.push(...handled);
      continue;
    }
    // A CLEANUP runs while an exception this TRY does not catch passes on to
    // an outer handler. When it is done the exception goes on propagating:
    // the statement after ENDTRY is never next. Its
    // end is an error end on the CLEANUP itself, not the normal flow.
    if (handled.length) {
      const passOn = w.graph.addNode('end-error', 'CLEANUP', anchorOf(header), ctx.region, ctx.container, {
        detail: { propagates: true },
      });
      w.graph.connect(handled, passOn.id);
    }
  }
  return out;
}
