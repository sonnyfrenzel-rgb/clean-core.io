import type { AbapStatement } from '../statement-reader';
import type { LaneEvidence, NodeAnchor, SkeletonLane } from '../process-skeleton';
import { programName } from './anchors';
import type { SkeletonGraph } from './graph';

/**
 * Pass "lanes" — engine 4 phase 3, after every pass that can still drop a node
 * (`docs/design/engine4.md`, "Phase 3").
 *
 * Reads: nodes, regions, the lane evidence the walk recorded (`recordEvidence`), the statements (`REPORT`/`PROGRAM`
 * for the run lane's name). Returns the lanes; changes nothing in the graph. No reading gate.
 */
/** Above this many lanes no further evidence opens one (2.16, "with an upper limit"). */
export const MAX_LANES = 12;

export interface LanesInput {
  statements: readonly AbapStatement[];
  /** Every piece of lane evidence the walk saw, in the order it saw them. */
  evidence: readonly LaneEvidence[];
}

/**
 * The lanes — roadmap 2.16 (§16 V3).
 *
 * Two rules and no third:
 *
 * 1. **One lane for the run.** Every flow node of this program is executed by
 *    the same actor: the run. There is exactly one run per start, and the code
 *    proves no handover inside a program — so a second lane for the program's
 *    own steps would be a sentence the source does not contain. What the
 *    evidence decides is not *how many* such lanes there are but **what this
 *    one is called**: the first `human` or `system` token in source order,
 *    which is the first statement in the run that says who is at the keyboard
 *    or that nobody is. With no such token the lane takes the program's own
 *    name from `REPORT`/`PROGRAM`, which is still a token out of the source.
 * 2. **One lane per distinct `AUTHORITY-CHECK` object.** That is the only
 *    place ABAP names an actor *outside* the program, and §5.8 calls it
 *    exactly that — *"reviewer (outside the program)"*. Two checks on
 *    `V_VBAK_VKO` are one actor and therefore one lane; the lane holds no flow
 *    node, because the checker runs none of them.
 *
 * Measured on the 1.000-line example: four kinds of evidence (L197/L205
 * authority, L510 update task, L616 ALV, L402 destination) and **2 lanes** —
 * the destination is a pool, the two authority checks are one object, and the
 * run is one lane whatever else it does. `CALL SCREEN 9000` at L670 never
 * arrives here at all: no entry point reaches `legacy_call_screen_example`, so
 * the walk never passes the statement.
 *
 * `MAX_LANES` is the upper bound 2.16 asks for. Evidence past it opens no
 * lane and stays visible in `laneEvidence`.
 */
export function buildLanes(graph: SkeletonGraph, input: LanesInput): SkeletonLane[] {
  if (!graph.nodes.length) return [];
  const lanes: SkeletonLane[] = [];

  const runEvidence = input.evidence
    .filter((e) => e.kind === 'human' || e.kind === 'system')
    .sort((a, b) => a.anchor.statementIndex - b.anchor.statementIndex);
  const named = runEvidence[0];
  const program = programName(input.statements);
  const entry = graph.regions.find((r) => r.kind === 'entry' && r.anchor);
  const anchor = named?.anchor ?? program?.anchor ?? entry?.anchor ?? firstAnchor(graph);
  if (!anchor) return [];

  // Roadmap 3.0.7 (MM case review): the run lane is named for
  // the role its evidence proves — "User" where a person is at the keyboard,
  // "System" where nobody is — and not after the token that proved it. A lane
  // called REUSE_ALV_GRID_DISPLAY named a function module as the actor. The
  // token stays in `evidence`, with its line; "User" and "System" are the two
  // roles BPMN itself knows, never a job title (§8 forbids those).
  lanes.push({
    id: 'lane-1',
    kind: named ? (named.kind === 'human' ? 'human' : 'system') : 'program',
    name: named ? (named.kind === 'human' ? 'User' : 'System') : program?.name ?? '',
    ...(named || program ? {} : {
      unnamedReason:
        'The source names no dialogue, no background task and no program name, so nothing in it says who runs these steps.',
    }),
    anchor,
    evidence: runEvidence,
    nodeIds: graph.nodes.map((n) => n.id),
    status: 'reconstructed',
  });

  const byObject = new Map<string, LaneEvidence[]>();
  for (const e of input.evidence) {
    if (e.kind !== 'authority') continue;
    byObject.set(e.token, [...(byObject.get(e.token) ?? []), e]);
  }
  for (const [token, evidence] of byObject) {
    if (lanes.length >= MAX_LANES) break;
    lanes.push({
      id: `lane-${lanes.length + 1}`,
      kind: 'authority',
      name: token,
      anchor: evidence[0].anchor,
      evidence,
      nodeIds: [],
      status: 'reconstructed',
    });
  }
  return lanes;
}

function firstAnchor(graph: SkeletonGraph): NodeAnchor | null {
  return graph.nodes.find((n) => n.anchor)?.anchor ?? null;
}
