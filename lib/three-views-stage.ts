/**
 * The three views in motion — `DESIGN.md` §6.1.1, roadmap step 6.1.
 *
 *   > *Eine Tatsache wandert durch drei Sichten. … Der Anker bleibt fest an
 *   > seinem Platz — er ist das Zeichen, dass es dieselbe Tatsache ist —, nur
 *   > der Inhalt um ihn wechselt.*
 *
 * `components/workspace/NewProject.tsx` said in its own header that this was
 * deliberately missing, and why: *„building it from anything other than a real
 * run of the example would be the staged marketing picture the same section
 * forbids two paragraphs later"*. So this module does not hold the three
 * panels — it **derives** them, from the same deterministic engine that reads a
 * reader's own upload, on the same example file the account can open from the
 * card two sections further down.
 *
 * **Nothing here is written by a page author.** Every line of every panel comes
 * out of `readSource`: the program name from the rule set, the anchors from the
 * skeleton's own node anchors, the table from the `SELECT`'s own detail, the
 * consequence from the string literal the source passes to its reject routine.
 * Where the engine has nothing — a clean core level for a customer table, a
 * recorded decision, a cost — the panel says so with the *Not determined* chip.
 *
 * **What §6.1.1 sketches and this does not print.** The section's Management
 * column reads *„Rebuild — part of decision DEC-1"*. There is no DEC-1: an
 * example that nobody has decided anything about has no decision, and the four
 * buckets of §5.6 put an object with no catalog entry and no level under *not
 * assigned*, not under Rebuild. Printing the sketch would make the one screen
 * whose subject is *"never passes an assumption off as a fact"*
 * (`lib/new-project-content.ts`) open with an invented one. The Management
 * panel therefore shows the absence, which is the same shape the Management
 * view shows in the workspace.
 *
 * Pure, and import-free of React — the route reads the example off disk and
 * hands the result to the client component, the way the catalog figures already
 * travel (`app/(app)/admin/new-project/page.tsx`).
 */

import { anchorLabel, readSource, type SourceReading } from './first-look';
import type { SkeletonNode } from './abap/process-skeleton';
import type { ProvenanceValue } from './provenance';
import { VIEW_QUESTIONS, WORKSPACE_VIEWS, type WorkspaceView } from './workspace-model';

/** One line of one panel. `provenance` is the nine-value list, never free text. */
export interface StageLine {
  key: string;
  text: string;
  provenance: ProvenanceValue;
}

/** What one view says about the one travelling fact. */
export interface StagePanel {
  view: WorkspaceView;
  /** `VIEW_QUESTIONS[view]` — the same sentence the workspace prints (§2.3). */
  question: string;
  lines: StageLine[];
  /**
   * The decisions this view *offers* — Keep · Change · Drop in Business
   * (§6.1.1). Options on a screen, never a decision on record: nothing in this
   * module has decided anything, and the Management panel says exactly that.
   */
  options?: readonly string[];
}

export interface TravellingFact {
  /** The program the reading came from, as the source names itself. */
  program: string;
  /** The one anchor that does not move as the views change. */
  anchor: string;
  /** The table the check reads. Upper-cased, as the engine reports it. */
  table: string;
  /** *„Example · … · fictitious code"* — §6.1.1, last bullet. */
  label: string;
  /** Business, IT, Management — in the one order of ADR-044. */
  panels: StagePanel[];
}

/**
 * A customer object: `Z…` or `Y…`.
 *
 * The one place this module decides anything about an object, and it decides
 * the narrow thing SAP's own namespace rule already says. It is used to reach
 * an absence — *no catalog entry, so no level* — and never to award one.
 */
function isCustomerTable(name: string): boolean {
  return /^[ZY]/.test(name.toUpperCase());
}

function tablesOf(node: SkeletonNode): string[] {
  const tables = node.detail?.tables;
  return Array.isArray(tables) ? tables : [];
}

/**
 * The quoted reason a `PERFORM reject USING '…'` carries, off its own line.
 *
 * Reading one line of the source for one literal is deliberate and bounded: the
 * skeleton keeps a call site's *label* (`REJECT`), because rule 6 forbids it to
 * invent a phrase, and the phrase here is not invented — it is in the program,
 * at the line the node is anchored to. Without a literal there is no line; the
 * panel is one shorter and says nothing extra.
 */
function literalOn(source: string, line: number): string | null {
  const text = source.split(/\r?\n/)[line - 1];
  if (!text) return null;
  const quoted = /'([^']{4,})'/.exec(text);
  return quoted ? quoted[1] : null;
}

/**
 * The fact that travels: a check the program makes against a table of its own.
 *
 * Chosen by shape, not by name — a `SELECT` on a customer table whose result
 * the program immediately branches on. That is a rule standing in the code
 * against data nobody outside the program can see, which is the thing this
 * product exists to surface, and it is what the example's vendor block list is.
 * `null` when a source has no such shape: the stage then does not render, which
 * is better than a stage built from a different kind of fact than the sentence
 * above it promises.
 */
export function travellingFactFrom(source: string, reading: SourceReading): TravellingFact | null {
  const { skeleton, ruleSet } = reading;

  const read = skeleton.nodes.find(
    (node) =>
      node.kind === 'read' &&
      node.anchor !== null &&
      tablesOf(node).some(isCustomerTable) &&
      skeleton.nodes.some(
        (other) => other.kind === 'error-boundary' && other.detail?.attachedTo === node.id,
      ),
  );
  if (!read || !read.anchor) return null;

  const table = tablesOf(read).find(isCustomerTable);
  if (!table) return null;

  const branch = skeleton.nodes.find(
    (node) => node.kind === 'error-boundary' && node.detail?.attachedTo === read.id,
  );

  /**
   * The anchor of the whole check, when the source put it in a routine of its
   * own: the call site that opens this region carries the routine's definition
   * range as its secondary anchor. Otherwise the `SELECT`'s own range — which
   * is still the same fact, just narrower.
   */
  const callSite = read.container
    ? skeleton.nodes.find((node) => node.expandsTo === `form:${read.container}`)
    : undefined;
  const secondary = callSite?.anchor?.secondary;
  const anchor =
    secondary && secondary.reason === 'routine-definition'
      ? anchorLabel(secondary.lineStart, secondary.lineEnd)
      : anchorLabel(read.anchor.lineStart, read.anchor.lineEnd);

  /** What happens when the check hits — the first effect after the branch. */
  const consequence = skeleton.nodes.find(
    (node) =>
      node.kind === 'write' &&
      node.container === read.container &&
      node.anchor !== null &&
      branch?.anchor != null &&
      node.anchor.lineStart >= branch.anchor.lineStart,
  );
  const reason = consequence?.anchor ? literalOn(source, consequence.anchor.lineStart) : null;

  const program = ruleSet.program || (read.container ?? 'this program');

  const business: StageLine[] = [
    reason
      ? {
          key: 'consequence',
          text: `The program stops the requisition here and says why: “${reason}”.`,
          provenance: 'reconstructed',
        }
      : {
          key: 'consequence',
          text: 'The program branches on the result of this check before it carries on.',
          provenance: 'reconstructed',
        },
    {
      key: 'where-it-lives',
      text: `The list it checks against is ${table}, a table of your own — so this rule is not in configuration anyone can look up.`,
      provenance: 'reconstructed',
    },
  ];

  const it: StageLine[] = [
    {
      key: 'statement',
      text: `${program} reads ${table} directly and branches on the result${
        branch?.anchor ? ` (${anchorLabel(branch.anchor.lineStart, branch.anchor.lineEnd)})` : ''
      }.`,
      provenance: 'reconstructed',
    },
    {
      key: 'no-catalog-entry',
      text: `${table} is a customer table: estimated from the code, no SAP catalog entry — so no clean core level is shown for it.`,
      provenance: 'not-determined',
    },
  ];

  const management: StageLine[] = [
    {
      key: 'no-decision',
      text: 'Nobody has decided anything about this object yet, so it sits in none of the four buckets.',
      provenance: 'not-determined',
    },
    {
      key: 'no-cost',
      text: 'And no cost: a figure appears only as a simulation, out of assumptions somebody confirmed.',
      provenance: 'not-determined',
    },
  ];

  const lines: Record<WorkspaceView, StageLine[]> = { business, it, management };

  return {
    program,
    anchor,
    table,
    label: `Example · ${program} · fictitious code`,
    panels: WORKSPACE_VIEWS.map((view) => ({
      view,
      question: VIEW_QUESTIONS[view],
      lines: lines[view],
      ...(view === 'business' ? { options: BUSINESS_OPTIONS } : {}),
    })),
  };
}

/**
 * The example §6.1.1 names — *„Aus dem Beispiel „Emergency purchase approval""*.
 *
 * Named once, here, because the route that reads it off disk and the spec that
 * checks what it derives must not be able to drift onto two different files.
 * It is one of the eight in `lib/starter-examples.ts`, so the stage shows a
 * reader something they can open themselves two sections further down.
 */
export const STAGE_EXAMPLE_FILE = 'Z_MM_PO_APPROVAL.abap';

/** §6.1.1's Business column: *Keep · Change · Drop*. Offered, never recorded. */
export const BUSINESS_OPTIONS = Object.freeze(['Keep', 'Change', 'Drop'] as const);

/** The whole of it, for a caller holding only the source. */
export function travellingFact(source: string): TravellingFact | null {
  return travellingFactFrom(source, readSource(source));
}

/* ------------------------------------------------------------- the timings */

/**
 * *„je 200 ms"*, *„jede Sicht steht 3,5 s"*, **ein** Durchlauf — §6.1.1.
 *
 * Numbers, not a schedule: the component owns the timer, and a test that has to
 * wait 10.5 s for three panels is a test nobody runs. Exported so the spec
 * asserts against the same figures the screen uses.
 */
export const STAGE_DWELL_MS = 3500;
export const STAGE_FADE_MS = 200;
