import type { LayerKey } from './workspace-model';

/**
 * The sections the Business view shows (owner, 03.10.2026: "Those two can go
 * out of Business; they come in Design and Economics anyway").
 *
 * Business answers "Do I still need this, and what changes for me?"
 * (`VIEW_QUESTIONS`): the process and its rules, how much of it the standard
 * covers, and what the reading rests on. *Costs & assumptions* belongs to
 * Economics and to Management's Costs fold, *Architecture & dependencies* to IT
 * and Design, and *Changes & commitments* holds nothing this release can
 * record — it was the "More 1 empty" the owner found dead. All three stay in
 * the IT and Management views, where they answer those views' questions.
 */
export const BUSINESS_LAYERS: readonly LayerKey[] = ['need', 'standard', 'evidence'];

/**
 * Where a link into a section Business does not show is sent instead — never
 * to an empty place: the costs to the Economics stage, the architecture and
 * the changes to the same section in the IT view.
 */
export const BUSINESS_LAYER_ELSEWHERE: Partial<Record<LayerKey, 'economics' | 'it'>> = {
  costs: 'economics',
  architecture: 'it',
  changes: 'it',
};
