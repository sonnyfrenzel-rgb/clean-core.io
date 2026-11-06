import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import type { ModelKeyProvider } from '@/lib/model-providers';
import { PROVIDER_LABEL } from '@/lib/model-providers';
import { providerCompanyOf, UI_LANGUAGE } from '@/lib/messages/model-consent';

/**
 * The notice at "Create project" (legal review 06.11.2026, 3.0.21, item 3):
 * the words are the consent text `startDialog`, which the legal-text change
 * adds to `lib/legal/consent-texts.ts` — with the provider of the key the
 * first run would use, in the interface language. Until that text exists, the
 * caller's current sentence stands at the button instead (`fallback`).
 *
 * Read by shape, not by a fixed path, so this file needs no change when the
 * text lands: a bilingual string `{ de, en }` under `startDialog`, or a group
 * under it whose `notice`, `text` or `lead` is one. `{Anbieter}` becomes the
 * company the code goes to, `{Modell}` the model's provider label.
 */

type Bi = { de: string; en: string };

function isBi(value: unknown): value is Bi {
  return !!value && typeof value === 'object' && typeof (value as Bi).de === 'string' && typeof (value as Bi).en === 'string';
}

/** The `startDialog` text, wherever the registry holds it; null while it does not exist. */
export function startDialogTextOf(registry: Record<string, unknown> = CONSENT_TEXTS as unknown as Record<string, unknown>): Bi | null {
  const entry = registry.startDialog;
  if (isBi(entry)) return entry;
  if (entry && typeof entry === 'object') {
    for (const key of ['notice', 'text', 'lead']) {
      const inner = (entry as Record<string, unknown>)[key];
      if (isBi(inner)) return inner;
    }
  }
  return null;
}

export function startDialogNotice(input: {
  provider: ModelKeyProvider | null;
  fallback: string;
  registry?: Record<string, unknown>;
}): { text: string; fromConsentText: boolean } {
  const bi = startDialogTextOf(input.registry);
  if (!bi) return { text: input.fallback, fromConsentText: false };
  const company = providerCompanyOf(input.provider) ?? providerCompanyOf('gemini')!;
  const model = PROVIDER_LABEL[input.provider ?? 'gemini'];
  const text = consentText(bi, UI_LANGUAGE).split('{Anbieter}').join(company).split('{Modell}').join(model);
  return { text, fromConsentText: true };
}
