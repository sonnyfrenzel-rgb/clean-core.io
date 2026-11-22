import type { SkeletonRegion } from '../../process-skeleton';
import { anchorOf, bodyRange } from '../anchors';
import { CANDIDATE_TRIGGER, type EntryPoint } from '../entries';
import { classOf } from '../statement-readers';
import { walkRange } from './range';
import type { Walker } from './walker';

/**
 * The regions of the walk — engine 4 phase 3, pass 5 (`docs/design/engine4.md`, "Phase 3"): the region an entry
 * opens (`buildEntryRegion`, with what `SET HANDLER` has registered when it starts) and the region a routine opens
 * (`routineRegion`, built once, with the expansion floor). Moved out of `SkeletonBuilder` unchanged.
 */

/**
 * How many `PERFORM`s deep the walk opens a routine before it says so instead.
 *
 * The walk follows a chain of calls by recursing once per link, so the chain's
 * depth is the call stack's depth — and a source that is one long chain ended
 * the whole analysis in a `RangeError` (see `routineRegion`). Two hundred is far
 * past any chain a program written by a person has, and far short of the depth
 * at which this walk runs out of stack (measured: between 800 and 1200 links).
 */
const MAX_PERFORM_EXPANSION = 200;

export function buildEntryRegion(w: Walker, entry: EntryPoint): void {
  const key = `entry:${entry.label}@${entry.statement.lineStart}`;
  if (w.graph.regions.some((r) => r.key === key)) return;
  const region: SkeletonRegion = {
    key,
    kind: 'entry',
    label: entry.label,
    anchor: anchorOf(entry.statement),
    runtimeRank: entry.rank,
    endNodeId: '',
    entryNodeId: null,
  };
  w.graph.regions.push(region);

  const container = entry.implicit ? null : entry.label;
  const start = w.graph.addNode('start', entry.label, anchorOf(entry.statement), region, container, {
    detail: {
      implicit: entry.implicit,
      runtimeRank: entry.rank,
      // Roadmap 2.14: which of the six the reader is looking at, and what the
      // source said to justify it. `trigger: null` is the honest half — the
      // source proves the routine is callable and not what calls it.
      origin: entry.origin,
      ...(entry.trigger ? { trigger: entry.trigger } : { triggerNotDetermined: true }),
    },
  });
  // The normal end of a named region is its closing word, not the last
  // statement before it (2.14): `ENDMETHOD` is where the method ends, and
  // corpus cases CC-040 and CC-057 anchor their end node exactly there.
  const end = w.graph.addNode('end', entry.label, anchorOf(entry.endStatement), region, container);
  region.endNodeId = end.id;

  const from = entry.implicit ? entry.statement.index : entry.statement.index + 1;
  w.state.regionLast.set(region.key, entry.lastIndex);
  // What `SET HANDLER` registered holds only within one run. Every entry
  // that is called on its own — a function module, a method called from
  // outside, a screen module, a bare FORM, a callback, an event handler —
  // starts with nothing registered. The event blocks of a report are one
  // run: a block starts with what the blocks that run **before** it (runtime
  // order, rule 4 — not the order they are written in) register
  // unconditionally (`registeredBefore`).
  w.state.registeredInWalk = entry.origin === 'event' || entry.origin === 'implicit'
    ? registeredBefore(w, entry)
    : registeredAtEntry(w, entry);
  const exits = walkRange(w, from, entry.lastIndex, {
    region, container, loops: [], loopBreaks: [],
  }, [{ from: start.id, condition: '', kind: 'sequence' }]);
  region.entryNodeId = start.id;
  w.graph.connect(exits, end.id);
}

/**
 * The handlers the event blocks that run before this one register for
 * certain: a `SET HANDLER` standing at the top level of such a block — in
 * no branch, loop or TRY, and not in a routine it calls — in a block that
 * cannot be left before its end. Anything less certain is left out, and the
 * `RAISE` it would have opened stays opaque.
 */
function registeredBefore(w: Walker, entry: EntryPoint): Set<string> {
  const out = new Set<string>();
  if (!w.input.boundHandlers.length) return out;
  for (const earlier of w.input.runEntries) {
    if (earlier === entry || earlier.rank >= entry.rank) continue;
    const from = earlier.implicit ? earlier.statement.index : earlier.statement.index + 1;
    if (w.input.readers.canLeaveEarly(from, earlier.lastIndex)) continue;
    // The implicit START-OF-SELECTION is scattered between blocks: only its own statements.
    const own = earlier.implicit ? new Set(w.input.entryReader.programLevelStatements().map((s) => s.index)) : null;
    for (let i = from; i <= earlier.lastIndex; i++) {
      if ((w.input.structure.enclosing[i] ?? []).length || (own && !own.has(i))) continue;
      const handlers = w.input.dispatch.handlersSetBy(w.input.statements[i]);
      if (!handlers || handlers.deregisters) continue;
      for (const { key } of handlers) if (w.input.boundHandlers.includes(key)) out.add(key);
    }
  }
  return out;
}

/**
 * Engine 3.2.0 — what an entry that runs **inside** this program's run starts with: the handlers registered when
 * the walk passed the statement that hands over to it (`registrationsAtCall`), of every such statement walked
 * before this entry is built. Three such entries: a candidate implementation runs inside the ambiguous call that
 * reaches it (`candidateEntries`); a screen module runs inside the `CALL SCREEN` of the report that showed the
 * screen (`deferredModuleEntries`); a callback runs in the session that registered it (`callbackEntry`). An ABAP
 * event handler registered with `SET HANDLER` stays registered for the whole internal session, so a `RAISE EVENT`
 * in any of them runs it. Every other entry called on its own starts with nothing registered — and so does every
 * entry of an older engine, whose map stays as it was.
 */
function registeredAtEntry(w: Walker, entry: EntryPoint): Set<string> {
  const out = new Set<string>();
  if (!w.readings.reads320) return out;
  const sites: number[] = [];
  if (entry.trigger?.startsWith(CANDIDATE_TRIGGER)) {
    const key = `${classOf(w.input.statements, w.input.structure, entry.statement.index) ?? ''}=>${entry.label.toUpperCase()}`;
    sites.push(...(w.input.candidateSites.get(key) ?? []).map((site) => site.index));
  } else if (entry.origin === 'module') {
    sites.push(...w.state.screenCallSites);
  } else if (entry.origin === 'callback' && entry.site !== undefined) {
    sites.push(entry.site);
  }
  for (const site of sites) for (const handler of w.state.registrationsAtCall.get(site) ?? []) out.add(handler);
  return out;
}

/**
 * The region a routine opens — a `FORM`, or since D2 a method this source
 * implements — built once however often it is called. This is `Walker.routineRegion`.
 */
export function routineRegion(w: Walker, name: string): SkeletonRegion | null {
  const known = w.state.regionOfRoutine.get(name);
  if (known) return known;
  const block = w.input.routineBlocks.get(name);
  if (!block) return null;
  const method = w.input.methodImpls.find((impl) => impl.key === name);

  // A chain of PERFORMs is followed by recursion — this method, the walk over
  // the routine it opens, and the PERFORM in that routine call one another —
  // so the depth of the chain is the depth of the call stack. A source with a
  // 6000-link chain fits in 410 kB, well under the 1 MB a `legacyCode` field
  // may hold, and the stack gave out before the walk did: `RangeError:
  // Maximum call stack size exceeded` out of `buildProcessSkeleton`, and with
  // it every reading derived from it. The floor
  // answers the way the macro floor above does: read what can be read, and
  // say what was left unread rather than fail. Real chains are two digits at
  // most; this one is the last link that still gets opened.
  if (w.state.expanding.length >= MAX_PERFORM_EXPANSION) {
    w.graph.note('expansion-depth-reached', w.input.statements[block.openIndex],
      `${name} is performed ${MAX_PERFORM_EXPANSION} calls deep, in a chain that starts at `
      + `${w.state.expanding[0]}. The call is drawn; what this routine does is not read, `
      + 'so no step inside it is in this skeleton.');
    return null;
  }

  const opener = w.input.statements[block.openIndex];
  const region: SkeletonRegion = {
    key: method ? `method:${name}` : `form:${name}`,
    kind: 'sub-process',
    label: method ? method.name : name,
    anchor: anchorOf(opener),
    endNodeId: '',
    entryNodeId: null,
    effects: [...(w.input.effects.get(name) ?? [])],
  };
  w.graph.regions.push(region);
  w.state.regionOfRoutine.set(name, region);

  const closer = w.input.statements[block.closeIndex];
  const end = block.terminated
    ? w.graph.addNode('end', name, anchorOf(closer), region, name)
    // Rule 1: nothing closed this routine, so where it ends is a guess. A node
    // that says so must not look like a node that carries a range.
    : w.graph.addNode('end', name, null, region, name, {
      unanchoredReason: method
        ? `METHOD ${method.name} is not closed by ENDMETHOD in this source, so it has no end to anchor to.`
        : `FORM ${name} is not closed by ENDFORM in this source, so it has no end to anchor to.`,
    });
  region.endNodeId = end.id;

  const [from, to] = bodyRange(block);
  const guarded = w.input.readers.readGuard(from, to, region);
  const before = w.graph.nodes.length;
  w.state.regionLast.set(region.key, to);
  w.state.expanding.push(name);
  const registered = new Set(w.state.registeredInWalk);
  const exits = walkRange(w, guarded, to, {
    region, container: name, loops: [], loopBreaks: [],
  }, []);
  w.state.expanding.pop();
  // A routine that can leave before its end (`CHECK`, `RETURN`, `EXIT`,
  // `STOP`, `LEAVE`, an error end) may return without its `SET HANDLER`
  // having run — its registrations do not reach the caller. Its region is
  // also built once and reused, so what it registers is kept only where no
  // way out precedes it anywhere.
  if (w.input.readers.canLeaveEarly(from, to)) w.state.registeredInWalk = registered;
  // The walk gives a sub-process no start event — the call site is where it
  // begins, and `addSubProcessStarts` adds one only once it is known that the
  // routine is drawn as a plane of its own (ADR-054) — so its first node is
  // the one nothing inside the region points at.
  // It is looked up by region and not by position: a `PERFORM` inside this
  // routine builds the region it opens *before* it adds its own call site, so
  // the node at `before` can belong to a routine one level down.
  region.entryNodeId = w.graph.nodes.slice(before).find((n) => n.region === region.key)?.id ?? null;
  w.graph.connect(exits, end.id);
  return region;
}
