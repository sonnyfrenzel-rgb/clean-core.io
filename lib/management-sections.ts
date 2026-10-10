import type { LayerKey } from './workspace-model';
import { BUSINESS_MAP_ID } from './business-layers';
import { IT_SECTION_IDS, type LayerHome } from './it-sections';

/**
 * The Management view's own places and where its old layer addresses lead
 * (owner decision 10.10.2026, ADR-087, amending ADR-018, ADR-069 and
 * `DESIGN.md` §2.3 item 4).
 *
 * Management answers "What do I risk, what do I decide?" and shows only that:
 * the decision (question, answer, next step, the four options, what it rests
 * on, the record), the distance to SAP standard and the readiness trend, then
 * one "Evidence" fold and one quiet row of links out. It has no layer bar and
 * no anchor bar — the page is three blocks and a fold, shorter than a bar
 * would be worth. Like a layer, a place is held in the URL fragment and
 * nowhere else: the view is a lens, never stored on a project, run or pack.
 */
export const MANAGEMENT_IDS = Object.freeze({
  /** The decision record's card — the address `#changes` and IT's "Decision →" lead to. */
  decision: 'decision-card',
  /** "What it rests on: n of 4 in place" — the four foundations with their open conditions. */
  restsOn: 'decision-rests-on',
  /** The Costs row of that list — where an old `#costs` link lands while a decision exists. */
  costs: 'decision-rests-on-cost',
  /** The readiness trend on the first screen (mockup s5). */
  readiness: 'management-readiness',
  /** The links-out row that ends the view. */
  elsewhere: 'management-elsewhere',
});

/**
 * Where a layer address lands when the reader is in Management — the view has
 * no layers any more, so an old link (`?view=management#need`, a bookmark, a
 * mail, a stage's way back) goes where that content lives now: the process to
 * the Business map, the standard fit to Business, the costs to the Costs row
 * of the decision (the Economics tool where no decision can be shown),
 * architecture and evidence to IT's own sections, and the changes to the
 * decision card with its timeline.
 */
export const MANAGEMENT_LAYER_ELSEWHERE: Readonly<Record<LayerKey, LayerHome>> = {
  need: { kind: 'view', view: 'business', hash: BUSINESS_MAP_ID },
  standard: { kind: 'view', view: 'business', hash: 'standard' },
  costs: { kind: 'view', view: 'management', hash: MANAGEMENT_IDS.costs },
  architecture: { kind: 'view', view: 'it', hash: IT_SECTION_IDS.objects },
  evidence: { kind: 'view', view: 'it', hash: IT_SECTION_IDS.trust },
  changes: { kind: 'view', view: 'management', hash: MANAGEMENT_IDS.decision },
};
