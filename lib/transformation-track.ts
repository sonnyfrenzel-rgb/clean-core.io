/**
 * Which track the Transformation stage is generating for, and what that track
 * is called on screen.
 *
 * Roadmap 0.2 (UX-037). The stage promised "Node.js (TypeScript)" in its
 * subtitle, in the header over the target pane and in its loading line no
 * matter what the extensibility route said, while the generator on the same
 * page built RAP artefacts for the in-app track. A reader on the RAP track was
 * told three times about a technology their code was never going to be written
 * in — and the file tree beside the sentence said `.clas.abap`.
 *
 * The predicate lives here so that the prompt, the file paths and the words
 * cannot pick different answers: the page imports it once and uses it for all
 * three. It is deliberately the generator's own test (`not BTP`), not the
 * delivery stage's (`contains ABAP Cloud`) — the words have to describe the
 * code that was actually produced, so they have to ask the question the
 * producer asked.
 */

/** What the generator assumes when a project carries no route at all. */
export const DEFAULT_EXTENSIBILITY_ROUTE = 'Side-by-Side (SAP BTP)';

export function isAbapCloudTrack(route?: string | null): boolean {
  return !(route || DEFAULT_EXTENSIBILITY_ROUTE).includes('BTP');
}

export interface TrackCopy {
  /** The lead under the stage title. */
  lead: string;
  /** The header over the generated-code pane. */
  pane: string;
  /** The line shown while the model is writing. */
  loading: string;
}

export function trackCopy(isAbapCloud: boolean): TrackCopy {
  return isAbapCloud
    ? {
        lead: 'Legacy ABAP to ABAP Cloud (RAP) Conversion',
        pane: 'Modernized Target (ABAP Cloud/RAP)',
        loading: 'Generating an ABAP Cloud (RAP) project from the staged ABAP source...',
      }
    : {
        lead: 'Legacy ABAP to Modern Node.js (TypeScript) Conversion',
        pane: 'Modernized Target (Node.js/TS)',
        loading: 'Generating a Node.js (TypeScript) project from the staged ABAP source...',
      };
}
