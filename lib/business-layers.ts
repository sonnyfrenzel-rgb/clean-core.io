import type { LayerKey } from './workspace-model';

/**
 * The sections the Business view shows (owner, 03.10.2026: "Those two can go
 * out of Business; they come in Design and Economics anyway"; owner,
 * 06.10.2026, ADR-080: Need & process goes too).
 *
 * Business answers "Do I still need this, and what changes for me?"
 * (`VIEW_QUESTIONS`): the process and its rules — the map and the rules card,
 * which stand on the page itself — how much of it the standard covers, and
 * what the reading rests on. *Need & process* repeated the map's counts there
 * and only linked back up to the map. *Costs & assumptions* belongs to
 * Economics and to the Costs row of Management's decision, *Architecture &
 * dependencies* to IT and Design, and *Changes & commitments* held nothing this
 * release can record — it was the "More 1 empty" the owner found dead, and is
 * no layer at all since ADR-087. IT has its own sections instead since ADR-086
 * (`lib/it-sections.ts`), Management none since ADR-087
 * (`lib/management-sections.ts`).
 */
export const BUSINESS_LAYERS: readonly LayerKey[] = ['standard', 'evidence'];

/**
 * Where a link into a section Business does not show is sent instead — never
 * to an empty place: the costs to the Economics stage, the architecture and
 * the changes where IT sends them since ADR-086 (`IT_LAYER_ELSEWHERE`: IT's
 * objects section, Management's decision), and *Need & process* to the
 * process map of the Business view itself (ADR-080). A `?view=business#need`
 * link was written by a reader who was in Business — a stage's "Back to
 * project workspace", a bookmark — and what that section held there, the
 * process and its rules, still stands in Business as the map and the rules
 * card; switching the reader to IT would change their perspective unasked.
 */
export const BUSINESS_LAYER_ELSEWHERE: Partial<Record<LayerKey, 'economics' | 'it' | 'map'>> = {
  need: 'map',
  costs: 'economics',
  architecture: 'it',
  changes: 'it',
};

/** The id of the process map's block on the Business view — where `#need` lands now (ADR-080). */
export const BUSINESS_MAP_ID = 'process-map';
