import type { Block } from '../../block-structure';
import type { SkeletonRegion } from '../../process-skeleton';
import { anchorOf, tokenIndexOf } from '../anchors';
import type { Exit } from '../graph';
import { selectTables } from '../recognisers';
import type { WalkContext, Walker } from './walker';

/**
 * The loops of the walk — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"). `LOOP AT` whose body stays
 * inside it is a multi-instance sub-process of its own (roadmap 2.17 (b)); every other loop, `DO`, `WHILE` and
 * `SELECT … ENDSELECT` is a loop node with a loop-back, and `ctx.loops`/`ctx.loopBreaks` carry it to the `CHECK`,
 * `CONTINUE` and `EXIT` inside (rule 5). The body is walked through `w.range`. Moved out of `SkeletonBuilder`
 * unchanged.
 */

/**
 * `LOOP AT <table> … ENDLOOP` whose body stays inside it — roadmap 2.17 (b).
 *
 * `DESIGN.md` §5.8 draws this as *Mehrfach-Instanz, sequenziell*: one activity
 * that contains the body and repeats it per row, not a gateway with a cycle
 * hanging off it. The body becomes a **region** of its own, exactly the way a
 * `FORM` does, so every reader downstream — the export model, the layout, the
 * navigation of 2.9 — draws it as a collapsed sub-process without needing to
 * know that a loop rather than a routine opened it. What makes it a
 * *multi-instance* sub-process rather than a plain one is `detail`, which
 * `lib/bpmn/export.ts` turns into `multiInstanceLoopCharacteristics`.
 *
 * The anchor is the `LOOP AT` statement and the label is the table token, as
 * before; the region's end node is anchored at the `ENDLOOP`. No node here
 * says anything the source does not write (rule 6).
 */
function walkMultiInstanceLoop(
  w: Walker,
  block: Block,
  ctx: WalkContext,
  incoming: Exit[],
  table: string,
): Exit[] {
  const opener = w.input.statements[block.openIndex];
  const region: SkeletonRegion = {
    key: `loop:${table.toUpperCase()}@${opener.lineStart}`,
    kind: 'sub-process',
    label: table,
    anchor: anchorOf(opener),
    endNodeId: '',
    entryNodeId: null,
    multiInstance: true,
  };
  w.graph.regions.push(region);

  const node = w.graph.addNode('loop', table, anchorOf(opener), ctx.region, ctx.container, {
    expandsTo: region.key,
    detail: {
      loopKind: 'multi-instance',
      over: table.toUpperCase(),
      multiInstance: true,
      isSequential: true,
    },
  });
  w.graph.connect(incoming, node.id);

  // The body is walked before the region gets an end node, because whether it
  // needs one is what the walk answers. Nothing in the body can read
  // `region.endNodeId` on the way: every statement that would — `CHECK`,
  // `RETURN`, `STOP`, a `SUBMIT` that does not come back — is a statement
  // `bodyStaysInLoop` has already refused.
  const before = w.graph.nodes.length;
  const exits = w.range(block.openIndex + 1, block.closeIndex - 1, {
    region, container: ctx.container, loops: [], loopBreaks: [],
  }, []);
  const body = w.graph.nodes.slice(before).filter((n) => n.region === region.key);

  // **A body that draws nothing gets no plane.** `LOOP AT gt_orders … lv_sum
  // = lv_sum + ls-netwr … ENDLOOP` is a calculation, and §5.8 gives a
  // calculation no element — so the region would hold one end event and
  // nothing to reach it. §5.8 offers the other half of the same row for
  // exactly this: *an activity* with the marker on it, no sub-process. The
  // loop keeps its anchor, its table and its marker and stops expanding.
  if (!body.length) {
    w.graph.regions = w.graph.regions.filter((r) => r !== region);
    delete node.expandsTo;
    return [{ from: node.id, condition: '', kind: 'sequence' }];
  }

  const closer = w.input.statements[block.closeIndex];
  const end = block.terminated
    ? w.graph.addNode('end', table, anchorOf(closer), region, ctx.container)
    : w.graph.addNode('end', table, null, region, ctx.container, {
      unanchoredReason: `LOOP AT ${table} is not closed by ENDLOOP in this source, so its body has no end to anchor to.`,
    });
  region.endNodeId = end.id;
  region.entryNodeId = body[0].id;
  w.graph.connect(exits, end.id);

  return [{ from: node.id, condition: '', kind: 'sequence' }];
}

export function walkLoop(w: Walker, block: Block, ctx: WalkContext, incoming: Exit[]): Exit[] {
  const opener = w.input.statements[block.openIndex];
  const table = /^LOOP\s+AT\s+([\w/<>]+)/i.exec(opener.text)?.[1];
  const isSelect = block.kind === 'select';
  // Roadmap 2.17 (b): the default of `DESIGN.md` §5.8 for a `LOOP AT` over a
  // table, and the exception `lib/bpmn/model.ts` argued for stays where its
  // argument holds — a body that leaves the block.
  if (block.kind === 'loop' && table && w.input.readers.bodyStaysInLoop(block)) {
    return walkMultiInstanceLoop(w, block, ctx, incoming, table);
  }
  const tables = isSelect ? selectTables(opener.text) : [];
  const node = isSelect && tables.length
    ? w.graph.addNode('read', tables[0], anchorOf(opener, tokenIndexOf(opener, /^FROM$/i) + 1),
      ctx.region, ctx.container, {
        detail: { tables, iterates: true, loopKind: 'multi-instance' },
      })
    : w.graph.addNode('loop', table ?? opener.keyword, anchorOf(opener), ctx.region, ctx.container, {
      detail: {
        loopKind: block.kind === 'loop' ? 'multi-instance' : 'standard',
        ...(table ? { over: table.toUpperCase() } : {}),
      },
    });
  w.graph.connect(incoming, node.id);

  const breaks: Exit[] = [];
  const bodyExits = w.range(block.openIndex + 1, block.closeIndex - 1, {
    ...ctx,
    loops: [...ctx.loops, node.id],
    loopBreaks: [...ctx.loopBreaks, breaks],
  }, [{ from: node.id, condition: '', kind: 'sequence' }]);
  for (const exit of bodyExits) {
    w.graph.edges.push({ from: exit.from, to: node.id, kind: 'loop-back', condition: exit.condition });
  }
  return [{ from: node.id, condition: '', kind: 'sequence' }, ...breaks];
}
