import { providerLabelOfReceiptId } from '../model-providers';
import { UI_LANGUAGE, type UiLanguage } from './model-consent';

/**
 * How the business names and the role lanes a model wrote are marked where they stand — on the process map, beside
 * it and in the documentation — in the interface language (Art. 50(2) AI Act; the legal review of document 19).
 *
 * The mark and the legend say what the check does and no more: the names come from the code's facts, and their terms
 * are matched against those facts, not reviewed. The mark's tooltip names the provider and the model the answer's
 * receipt recorded for that naming (`ProcessNamingRecord.origin`), never a model written here, so it stays right when
 * the platform model changes.
 *
 * The interface is English (ADR-009); the German wording stands beside it, so the German interface and a reviewer
 * read the same sentence. `tests/legal-names-wording.spec.ts` holds the wording.
 */

/** Who wrote a naming, as its receipt recorded it. */
export interface AiNameOrigin {
  provider: string;
  modelId: string;
}

/** The mark on a name a model wrote. */
export function aiNameMark(lang: UiLanguage = UI_LANGUAGE): string {
  return lang === 'de' ? 'KI-generierter Name' : 'AI-generated name';
}

/** The legend under the map, once a name a model wrote is on it. */
export function aiNamesLegend(lang: UiLanguage = UI_LANGUAGE): string {
  return lang === 'de'
    ? 'Namen: KI-generiert aus den Fakten des Codes; Begriffe mit diesen Fakten abgeglichen, nicht fachlich geprüft.'
    : "Names: AI-generated from the code's facts; terms matched against those facts, not reviewed.";
}

/** The mark on a role lane a model proposed. */
export function aiLaneMark(lang: UiLanguage = UI_LANGUAGE): string {
  return lang === 'de' ? 'KI-generierte Rollen-Bahn' : 'AI-generated role lane';
}

/** Provider and model as the receipt recorded them, e.g. "Google Gemini gemini-2.5-flash"; null when not recorded. */
export function aiOriginWords(origin: AiNameOrigin | null | undefined): string | null {
  if (!origin || !origin.provider || !origin.modelId) return null;
  return `${providerLabelOfReceiptId(origin.provider) ?? origin.provider} ${origin.modelId}`;
}

/** The tooltip of a mark: the mark, then provider and model of the receipt — "AI-generated name · Google Gemini …". */
export function aiMarkTooltip(mark: string, origin: AiNameOrigin | null | undefined): string {
  const words = aiOriginWords(origin);
  return words ? `${mark} · ${words}` : mark;
}

/** Where the names wait for the one-time notice on automatic AI steps (`lib/auto-steps-notice.ts`). */
export function namesWaitForNoticeNote(lang: UiLanguage = UI_LANGUAGE): string {
  return lang === 'de'
    ? 'Die Schritte tragen die Namen, die die Engine aus dem Code gelesen hat. KI-generierte Namen starten erst, wenn Sie den Hinweis oben bestätigt haben.'
    : 'The steps keep the names the engine read from the code. AI-generated names start only once you have confirmed the notice above.';
}
