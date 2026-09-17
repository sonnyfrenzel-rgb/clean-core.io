/**
 * "New project" — what it is, before it starts. `DESIGN.md` §6.1.1, roadmap 2.7.
 *
 *   > *Wer in „My workspace" auf „New project" klickt, bekommt zuerst in wenigen
 *   > Sekunden, was Clean-Core.io ist und was es anders macht … Eine Seite, zwei
 *   > Teile, kein Wizard mit Fortschrittsbalken.*
 *
 * The copy lives here rather than in the component for the reason
 * `lib/cc-messages.ts` gives: the German interface comes after 3.0 and a
 * catalogue added later is a rewrite of every component that shipped before it.
 * It is also the only way the one figure on this page that is not copy — the
 * state of the catalog sync — can be kept out of the text: §6.1.1 says *„mit
 * Anzahl und **Stand des letzten Abgleichs** aus dem Katalog, nie fest im
 * Text"*, so the evidence flow is a function of what the catalog reports and
 * never a sentence with a date typed into it.
 *
 * The catalog figures are read on the server (`getLevelRuleVersion()` in
 * `lib/abap/catalog-service.ts` reads 4.3 MB of generated JSON) and passed in.
 * This module imports none of it.
 */

import { CLEAN_CORE_LEVEL_VALUES, cleanCoreLevel, type CleanCoreLevelEntry } from './clean-core-level';
import type { ProvenanceValue } from './provenance';

/** *Ein Satz Kern* — §6.1.1, first bullet. */
export const NEW_PROJECT_CORE =
  'Understand a piece of custom ABAP and decide what happens to it — every statement tied to a line of your code.';

export interface DifferenceLine {
  key: string;
  /** lucide-react icon name, mapped in the component (as `ProvenanceChip` does). */
  icon: string;
  text: string;
}

/**
 * *Drei Zeilen, was anders ist* — §6.1.1, second bullet, word for word.
 *
 * None of the three says the product is good; each says what it does and what
 * it refuses to do. That is the difference §3.1 is about.
 */
export const NEW_PROJECT_DIFFERENCES: readonly DifferenceLine[] = Object.freeze([
  Object.freeze({
    key: 'reads-first',
    icon: 'file-code',
    text: 'Reads your code before any model does. Every finding points to a line.',
  }),
  Object.freeze({
    key: 'says-what-it-cannot',
    icon: 'circle-help',
    text: 'Says what it could not determine — and never passes an assumption off as a fact.',
  }),
  Object.freeze({
    key: 'three-views',
    icon: 'layers',
    text: 'One case, three views: Business, IT and Management see the same facts, each answering its own question.',
  }),
]);

/* --------------------------------------- glance 1: what clean core means */

export const CLEAN_CORE_MEANING =
  'Keep the SAP core standard: extensions use only released, upgrade-stable interfaces — in-app with ABAP Cloud or side-by-side on SAP BTP.';

/**
 * The small schema beside the sentence — §6.1.1: the SAP core as a block with
 * its boundary of released interfaces, *in-app* and *side-by-side* next to it,
 * and a modification as an intrusion into the core.
 *
 * Data, not a picture: the component draws four labelled boxes and a boundary
 * from this, so there is no illustration file to keep in step with the words.
 */
export interface CoreSchemaPart {
  key: string;
  label: string;
  note: string;
  /** `inside` sits within the boundary, `outside` beyond it, `breach` crosses it. */
  place: 'core' | 'inside' | 'outside' | 'breach';
}

export const CLEAN_CORE_SCHEMA: readonly CoreSchemaPart[] = Object.freeze([
  Object.freeze({
    key: 'core',
    label: 'SAP core',
    note: 'Standard, upgraded by SAP. Its boundary is the set of released interfaces.',
    place: 'core' as const,
  }),
  Object.freeze({
    key: 'in-app',
    label: 'In-app',
    note: 'ABAP Cloud on the stack, using released APIs and extension points.',
    place: 'inside' as const,
  }),
  Object.freeze({
    key: 'side-by-side',
    label: 'Side-by-side',
    note: 'A separate service on SAP BTP, reaching the core through released interfaces.',
    place: 'outside' as const,
  }),
  Object.freeze({
    key: 'modification',
    label: 'Modification',
    note: 'A change inside the core itself. It crosses the boundary and the upgrade has to carry it.',
    place: 'breach' as const,
  }),
]);

/* ------------------------------------------ glance 2: the four levels A–D */

/**
 * The ladder, from the one list.
 *
 * `lib/clean-core-level.ts` already holds the four letters, their lines and
 * their colours (ADR-024: A `information`, B `neutral`, C `warning`, D `error`,
 * and never `success`). This page reads that list rather than writing a second
 * set of labels beside it — two spellings of "level C" is exactly the drift
 * `lib/provenance.ts` exists to stop, one vocabulary over.
 */
export function cleanCoreLadder(): CleanCoreLevelEntry[] {
  return CLEAN_CORE_LEVEL_VALUES.map((value) => cleanCoreLevel(value));
}

/** The sentence under the ladder — §6.1.1, verbatim. */
export const CLEAN_CORE_LEVEL_CAVEAT =
  "Levels follow SAP's clean core level concept. The level shown for an object is our reading of SAP's published data — an orientation, never part of a signed audit pack. Confirm with ABAP Test Cockpit.";

/* --------------------------- glance 3: where the evidence comes from */

/** One synced SAP artifact, as the catalog reports it. Never typed by hand. */
export interface CatalogArtifactFigures {
  file: string;
  question: string;
  entries: number;
  /** ISO date of the last sync, `YYYY-MM-DD`, or '' when the artifact has none. */
  fetchedAt: string;
}

export interface EvidenceStation {
  key: string;
  label: string;
  /** What this station contributes. One line. */
  note: string;
  provenance: ProvenanceValue;
  /** Figures the catalog reports — empty for every station but SAP's data. */
  figures?: CatalogArtifactFigures[];
  /** True for a station that only exists if the account supplies something. */
  optional?: boolean;
}

/**
 * The flow of §6.1.1, glance 3, in reading order.
 *
 * `artifacts` comes from `getLevelRuleVersion().artifacts` on the server. When
 * it is empty the SAP station says so instead of printing a number: a count with
 * no catalog behind it is the fabricated figure this whole product is against.
 */
export function evidenceStations(artifacts: readonly CatalogArtifactFigures[]): EvidenceStation[] {
  return [
    {
      key: 'source',
      label: 'Your ABAP source',
      note: 'Every statement we make points back to a line of it.',
      provenance: 'imported',
    },
    {
      key: 'engine',
      label: 'Deterministic engine',
      note: 'Reads the source before any model is asked anything. Its rule version travels with the run.',
      provenance: 'reconstructed',
    },
    {
      key: 'sap-data',
      label: "SAP's published data",
      note:
        artifacts.length > 0
          ? 'The Cloudification Repository for release states and successors, and SAP’s classification file. Your own Z-objects have no catalog entry, and are marked "estimated from the code, no SAP catalog entry".'
          : 'No synced catalog is available in this build, so no entry count and no sync date can be shown.',
      provenance: 'imported',
      figures: [...artifacts],
    },
    {
      key: 'your-imports',
      label: 'Your imports',
      note: 'ATC results and usage data, if you upload them. Nothing is fetched from your system.',
      provenance: 'imported',
      optional: true,
    },
    {
      key: 'model',
      label: 'A language model',
      note: 'Names and wording only. It never decides a level and never produces a finding.',
      provenance: 'proposed',
    },
  ];
}

/* ------------------------------------------------- part 2: how to start */

export type StartChoice = 'example' | 'own-code';

/** The two cards of §6.1.1, part 2. The primary action's label follows the choice. */
export const START_CHOICES: Readonly<
  Record<StartChoice, { title: string; body: string; action: string }>
> = Object.freeze({
  example: Object.freeze({
    title: 'Try an example',
    body: 'Realistic, fictional legacy ABAP — the same sources the engine is regression-tested against.',
    action: 'Open example',
  }),
  'own-code': Object.freeze({
    title: 'Use your own code',
    body: 'ABAP source, includes, or a ZIP. The next screen says what is read and stored before anything is uploaded.',
    action: 'Continue to upload',
  }),
});
