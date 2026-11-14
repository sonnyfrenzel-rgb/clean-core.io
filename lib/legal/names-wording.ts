import { engineReads310Apply } from '../abap/engine-reads-310-gate';
import { APP_VERSION } from '../version';

/**
 * Whether the legal texts say that business names start by themselves (legal review, document 19).
 *
 * Business names were paused by the owner decision of 06.11.2026 until they could be built from the code's facts
 * alone (`NAMING_WITHOUT_FACTS_PAUSED`, `lib/process-naming.ts`). From the release whose engine hands the model those
 * facts (`ENGINE_READS_310_FROM`, read against `APP_VERSION`) the product asks for them again when the owner opens a
 * project, and privacy section 3, the Trust page and the one-time notice C14 say so. Before that release they keep
 * the sentence that names are paused.
 *
 * One rule for the texts and the build: `tests/legal-names-wording.spec.ts` holds this equal to
 * `NAMING_ASKED_IN_THIS_BUILD`, so a build never asks for names beside a text that calls them paused, and no text
 * says they run in a build that does not ask. Pure: nothing beyond the version gate.
 */
export const LEGAL_TEXTS_NAMES_AUTOMATIC: boolean = engineReads310Apply(APP_VERSION);

/**
 * The wording for this build: `automatic` once names start by themselves, `paused` before. `namesAutomatic` names
 * the side for a text rendered for another version than this build's — the archive of the privacy policy
 * (`lib/legal/privacy-versions.ts`) renders both.
 */
export function namesWording(automatic: string, paused: string, namesAutomatic: boolean = LEGAL_TEXTS_NAMES_AUTOMATIC): string {
  return namesAutomatic ? automatic : paused;
}
