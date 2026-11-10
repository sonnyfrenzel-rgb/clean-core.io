import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import { formatLegalDate, type LegalLang } from '@/lib/legal/open-values';
import { providerSuspendedMessage, type ModelKeyProvider } from '@/lib/model-providers';

/**
 * The notice a person reads when the operator has switched a provider off —
 * C11 of the legal texts, Fassung 1.1 (Additional Agreement clause 6;
 * acceptance test T01): "Calls to Anthropic have been suspended since {date}:
 * {reason}. …".
 *
 * The switch itself is `MODEL_PROVIDERS_SUSPENDED` (`lib/model-providers.ts`).
 * The date and the reason the notice names are two more server variables, set
 * together with it (`docs/OPERATIONS.md`):
 *
 * - `MODEL_PROVIDERS_SUSPENDED_AT` — the day the calls stopped, `YYYY-MM-DD`;
 * - `MODEL_PROVIDERS_SUSPENDED_REASON` — one of the three reasons C11 names:
 *   `contracting-entity`, `data-region`, `binding-decision`.
 *
 * C11 is written for Anthropic, the provider under the Additional Agreement.
 * A Gemini switch-off, or an Anthropic one without a valid date and reason,
 * keeps the generic sentence of `providerSuspendedMessage` — which still says
 * that nothing was sent and no other provider or key was used. Pure: the
 * caller hands the variables in, so the Settings card and the routes agree.
 */

export const MODEL_PROVIDERS_SUSPENDED_AT_ENV = 'MODEL_PROVIDERS_SUSPENDED_AT';
export const MODEL_PROVIDERS_SUSPENDED_REASON_ENV = 'MODEL_PROVIDERS_SUSPENDED_REASON';

/** The reasons C11 lists, in its order. */
export const SUSPENSION_REASONS = ['contracting-entity', 'data-region', 'binding-decision'] as const;
export type SuspensionReason = (typeof SUSPENSION_REASONS)[number];

export interface SuspensionDetails {
  at: string | null;
  reason: SuspensionReason | null;
}

/** Reads the two variables; anything that is not a valid date or a listed reason is null. */
export function suspensionDetailsOf(env: Record<string, string | undefined>): SuspensionDetails {
  const rawAt = (env[MODEL_PROVIDERS_SUSPENDED_AT_ENV] ?? '').trim();
  const at = /^\d{4}-\d{2}-\d{2}$/.test(rawAt) && !Number.isNaN(Date.parse(`${rawAt}T00:00:00Z`)) ? rawAt : null;
  const rawReason = (env[MODEL_PROVIDERS_SUSPENDED_REASON_ENV] ?? '').trim().toLowerCase();
  const reason = (SUSPENSION_REASONS as readonly string[]).includes(rawReason) ? (rawReason as SuspensionReason) : null;
  return { at, reason };
}

/** The notice for `provider`: C11 with date and reason where it applies, else the generic sentence. */
export function providerSuspendedNotice(provider: ModelKeyProvider, details: SuspensionDetails, lang: LegalLang = 'en'): string {
  if (provider !== 'anthropic' || !details.at || !details.reason) return providerSuspendedMessage(provider);
  const C11 = CONSENT_TEXTS.anthropicSuspended;
  const reason = C11.reasons[SUSPENSION_REASONS.indexOf(details.reason)];
  return consentText(C11.notice, lang).replace('{Datum}', formatLegalDate(details.at, lang)).replace('{Grund}', reason[lang]);
}
