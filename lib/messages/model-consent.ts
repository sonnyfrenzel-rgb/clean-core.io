import type { ModelKeyProvider } from '../model-providers';

/**
 * Interface sentences that state where code goes and what the account has
 * declared — legal review of 06.11.2026 for release 3.0.21. Kept apart from the
 * legal texts and consent texts (`lib/legal/*`, which another change owns) and
 * from the plain workspace catalogue (`lib/workspace-messages.ts`), because
 * each one carries a provider, a date or a time and comes in both languages.
 *
 * The interface is English (ADR-009); the German wording is here beside it so
 * the German interface after 3.0, and a reviewer, read the same sentence.
 *
 * Import-free apart from a type, so a spec and a server read it.
 */

export type UiLanguage = 'de' | 'en';

/** The interface language of this build (ADR-009). */
export const UI_LANGUAGE: UiLanguage = 'en';

const COMPANY: Readonly<Record<ModelKeyProvider, string>> = { gemini: 'Google', anthropic: 'Anthropic' };

/** The company the code goes to with this key — `{Anbieter}`. `null` while the key is not known. */
export function providerCompanyOf(provider: ModelKeyProvider | null | undefined): string | null {
  return provider ? COMPANY[provider] : null;
}

/**
 * Item 1 — the button of Transformation and Documentation, which never call
 * the model on opening: "Generate draft (sends code to {provider})", with the
 * provider of the key actually used. Before the key is known, the generic
 * provider, never a guessed one.
 */
export function generateDraftLabel(company: string | null, lang: UiLanguage = UI_LANGUAGE): string {
  if (lang === 'de') return `Entwurf erzeugen (sendet Code an ${company ?? 'den KI-Anbieter'})`;
  return `Generate draft (sends code to ${company ?? 'the AI provider'})`;
}

/**
 * Lawyer's statement 24c (3.5.4): the Decide page's Rebuild confirmation that records the decision and then writes
 * the design, naming the provider of the key actually used. Before the key is known, the generic provider.
 */
export function recordAndWriteDesignLabel(company: string | null, lang: UiLanguage = UI_LANGUAGE): string {
  if (lang === 'de') return `Festhalten und das Design schreiben (sendet Antworten an ${company ?? 'den KI-Anbieter'})`;
  return `Record and write the design (sends answers to ${company ?? 'the AI provider'})`;
}

/**
 * The hint directly above that button: what the design step sends. Statement 24c proposed "… with your answers and
 * the findings of the signed run (rules, counts, object names; no line of your code)". The design prompt sends more
 * than that (`app/(app)/project/[projectId]/design/page.tsx`: the run's model narrative, the rules with their values
 * and lines, the routine names), so this is the accurate variant, for the lawyer to confirm.
 */
export function writeDesignHint(company: string | null, lang: UiLanguage = UI_LANGUAGE): string {
  const who = company ?? (lang === 'de' ? 'den KI-Anbieter' : 'the AI provider');
  if (lang === 'de') {
    return `Danach wird das Design geschrieben: zwei Modellaufrufe an ${who}, mit Ihren Antworten und dem, was die Engine aus Ihrem Code gelesen hat (Regeln mit ihren Werten und Zeilen, Namen von Routinen und SAP-Objekten) sowie der Analyse-Erzählung des Laufs, falls vorhanden, die Code zitieren kann. KI-generiert; zählt nicht gegen Ihre Läufe.`;
  }
  return `Then the design is written: two model calls to ${who}, with your answers and what the engine read from your code (rules with their values and lines, routine and SAP object names), and the run's analysis narrative where it has one, which can quote your code. AI-generated; not counted against your runs.`;
}

/** Statement 24c: what the page says when the design could not be written after the decision was recorded. */
export const DESIGN_AFTER_DECISION_FAILED = 'Your decision is recorded. The design could not be written; open Design to try again.';

/** The same button when a draft is on record and would be replaced. */
export function regenerateDraftLabel(company: string | null, lang: UiLanguage = UI_LANGUAGE): string {
  if (lang === 'de') return `Entwurf neu erzeugen (sendet Code an ${company ?? 'den KI-Anbieter'})`;
  return `Regenerate draft (sends code to ${company ?? 'the AI provider'})`;
}

/**
 * Statement 22c, 4 — the second trigger of Documentation: the button that asks for the business sentences ("only when
 * asked for") names the recipient as `generateDraftLabel` does, with the provider of the key actually used; before
 * the key is known, the generic provider. `again`: a proposal is on record and the owner asks once more.
 */
export function proposeSentencesLabel(company: string | null, again = false, lang: UiLanguage = UI_LANGUAGE): string {
  if (lang === 'de') return `${again ? 'Modell erneut fragen' : 'Fachsätze vorschlagen'} (sendet Code an ${company ?? 'den KI-Anbieter'})`;
  return `${again ? 'Ask the model again' : 'Propose business sentences'} (sends code to ${company ?? 'the AI provider'})`;
}

/** Item 2 — the help line under the main switch "Automatic AI steps" in Settings. */
export function autoModelStepsHelp(lang: UiLanguage = UI_LANGUAGE): string {
  if (lang === 'de') {
    return 'Aus: Die Plattform ruft von selbst kein KI-Modell auf, mit keinem Schlüssel, auch nicht mit dem Plattform-Schlüssel, und der erste Lauf eines neuen Projekts wird ohne Modell-Erzählung signiert. Schritte, die Sie anklicken, und die einzelnen Schalter unten bleiben, wie sie sind.';
  }
  return 'Off: the platform calls no AI model by itself, on any key, the platform key included, and the first run of a new project is signed without the model narrative. Steps you click, and the single switches below, stay as they are.';
}

/**
 * Terms 5.4 (legal review 06.11.2026): with "All automatic AI steps" off the
 * platform calls no model for the account — the assistant included. Shown in
 * its panel, which stays visible but disabled.
 */
export function assistantOffNote(lang: UiLanguage = UI_LANGUAGE): string {
  if (lang === 'de') {
    return 'Der Assistent ist aus: Für Ihr Konto sind alle automatischen KI-Schritte ausgeschaltet, deshalb ruft er kein Modell auf. Sie schalten sie in den Einstellungen unter „Where the AI model is used“ wieder ein.';
  }
  return 'The assistant is off: all automatic AI steps are switched off for this account, so it calls no model. You can switch them back on in Settings under “Where the AI model is used”.';
}

/* ------------------------------------------------------------------ B8 */

/** `{Datum}` and `{Uhrzeit}` of a time of receipt, in Berlin time, as the receipt states it. */
export function receiptDateTime(at: Date | string, lang: UiLanguage = UI_LANGUAGE): { date: string; time: string } {
  const d = typeof at === 'string' ? new Date(at) : at;
  const timeZone = 'Europe/Berlin';
  if (lang === 'de') {
    const date = new Intl.DateTimeFormat('de-DE', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
    const time = new Intl.DateTimeFormat('de-DE', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    return { date, time: `${time} Uhr` };
  }
  const date = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).format(d);
  return { date, time };
}

/**
 * B8 — what the person reads when the withdrawal is received and effective but
 * the receipt could not be sent by e-mail yet. Never "try again": the receipt
 * is queued and sent automatically, and the account is deleted after it.
 */
export function withdrawalReceiptPendingMessage(receivedAt: Date | string, lang: UiLanguage = UI_LANGUAGE): string {
  const { date, time } = receiptDateTime(receivedAt, lang);
  if (lang === 'de') {
    return `Ihr Widerruf ist eingegangen und wirksam (${date}, ${time}). Die Eingangsbestätigung können wir gerade nicht per E-Mail senden; wir holen das automatisch nach und löschen Ihr Konto danach. Sie müssen nichts weiter tun.`;
  }
  return `Your withdrawal has been received and is effective (${date}, ${time}). We cannot send the confirmation of receipt by e-mail right now; we will send it automatically as soon as possible and then delete your account. You do not need to do anything else.`;
}
