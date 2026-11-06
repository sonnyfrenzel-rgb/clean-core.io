import { CONSENT_TEXTS, consentText } from './consent-texts';
import type { LegalLang } from './open-values';
import type { ModelKeyProvider } from '../model-providers';

/**
 * The sentences that stand at the button starting a run of own code (legal
 * review of 06.11.2026, B5 and N2): who receives the code, named after the key
 * the run actually uses, and that the run is free. The words are
 * `CONSENT_TEXTS.startRun`; this module only fills them in.
 *
 * For the start screen and the first run's "create project" button. Pure.
 */

const COMPANY: Readonly<Record<ModelKeyProvider, string>> = { gemini: 'Google', anthropic: 'Anthropic' };

/** The company the code goes to on the key a run uses; the platform key is Google's. */
export function runProviderCompany(provider: ModelKeyProvider | null | undefined): string {
  return COMPANY[provider ?? 'gemini'];
}

/** "Ruft das KI-Modell auf (Google). Dafür geht Ihr Code an Google." or the no-call sentence. */
export function runModelCallNotice(input: { callsModel: boolean; provider: ModelKeyProvider | null | undefined; lang: LegalLang }): string {
  const t = CONSENT_TEXTS.startRun;
  if (!input.callsModel) return consentText(t.noModelCall, input.lang);
  return consentText(t.modelCall, input.lang).split('{Anbieter}').join(runProviderCompany(input.provider));
}

export type RunFreeCase =
  | { kind: 'platform-key'; limit: number; remainingAfter: number }
  | { kind: 'own-key' }
  | { kind: 'not-counted' };

/** The "Kostenlos. …" line before a run: never a word about costs. */
export function runFreeNotice(c: RunFreeCase, lang: LegalLang): string {
  const t = CONSENT_TEXTS.startRun;
  if (c.kind === 'own-key') return consentText(t.freeOwnKey, lang);
  if (c.kind === 'not-counted') return consentText(t.freeNotCounted, lang);
  return consentText(t.freePlatformKey, lang)
    .replace('{Anzahl}', String(c.limit))
    .replace('{Rest}', String(Math.max(0, c.remainingAfter)));
}
