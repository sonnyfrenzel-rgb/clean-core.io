/**
 * Why each clause of the Terms changes from v2.2.0 to v2.3.0 — the "reason for
 * the amendment" the notice under Terms 10.1 must give, picked from the valid
 * reasons of Terms 10.4:
 *
 *   (a) changes in the applicable law or binding decisions;
 *   (b) changes to the third-party services the Platform depends on (section 5);
 *   (c) new functions, or the discontinuation of functions;
 *   (d) closing a gap that became apparent after conclusion;
 *   (e) amendments purely advantageous or neutral for the user.
 *
 * Keyed by the clause id the generator derives (`lib/terms-announcement/changes.ts`).
 * A changed clause without an entry stops the send (`missingReasons`); an entry
 * for a clause that no longer changes is reported (`staleReasons`).
 *
 * **Every reason must be true, and is sourced, not invented.** The sources:
 * - CHANGELOG v3.0.21, "Changed — legal texts, Fassung 1.1": the lawyer's
 *   replacement texts G01–G23 (precautionary joint controllership, billing-address
 *   criterion, contract kept apart from community mail, an amendment accepted
 *   early taking effect on its announced day, ATC fields, SAP interface warranty);
 *   "the record of an acceptance carries the language version and its digest";
 *   "/report — the reporting notes the Terms point to"; "the tenant connection
 *   reads structure only: the S/4 catalogue mode is gone".
 * - docs/ROADMAP.md, row "after 3.0.19 — with the legal texts 1.0" (owner
 *   decisions 17.10.2026): (1) no statutory right of withdrawal for the free
 *   service; (2) own Gemini key needs Cloud Billing, Gemini API terms of
 *   28.04.2026; (3) own Anthropic key, processing in the US, provider charges in
 *   the user's own contract; (5) new version with re-acceptance.
 * - docs/ROADMAP.md, rows "3.0.21 — with the legal texts": automatic model steps
 *   with an own key are a switch (legal review B6); "AI-generated" marking (G05/E28,
 *   Art. 50 AI Act).
 * - docs/ROADMAP.md row 3.0.21 "Portfolio, step 1" (only with an own model key) and
 *   CHANGELOG v3.0.21 "Added — includes and ATC".
 * - docs/ROADMAP.md, legal review of 18.09.2026 "still open": consumer rules for
 *   free digital products (§§ 327 ff. BGB) — answered by 2.2/4.1/4.2.
 *
 * Letters (d) and (e) are the operator's assessment, not a lawyer's; the owner
 * and the lawyer confirm the list before the notice goes out.
 */

export type ReasonLetter = 'a' | 'b' | 'c' | 'd' | 'e';

export interface ChangeReason {
  /** The valid reasons of Terms 10.4 the change rests on. */
  letters: ReasonLetter[];
  /** The plain reason, German. */
  de: string;
  /** The plain reason, English. */
  en: string;
}

const EDITORIAL = {
  de: 'Sprachlich überarbeitet und an die neue deutsche Fassung angeglichen; der Inhalt bleibt gleich.',
  en: 'Reworded and aligned with the new German version; the content stays the same.',
};

export const CHANGE_REASONS: Readonly<Record<string, ChangeReason>> = {
  preamble: {
    letters: ['c', 'e'],
    de: 'Die Bedingungen gibt es jetzt auch auf Deutsch; die Einleitung sagt das und nennt die neue Fassung und ihr Datum.',
    en: 'The Terms now also exist in German; the opening says so and names the new version and its date.',
  },
  provider: {
    letters: ['c', 'e'],
    de: 'Mit dem eigenen Claude-Schlüssel wird Anthropic genannt (keine Verbindung zum Betreiber). „Privat, nicht kommerziell“ heißt jetzt genauer „unentgeltlich und ohne Gewinnerzielungsabsicht“.',
    en: 'With the own Claude key, Anthropic is named (no connection to the operator). "Private, non-commercial" now reads, more precisely, "free of charge and without intent to make a profit".',
  },
  '1:heading': {
    letters: ['d'],
    de: 'Die Überschrift nennt, was Ziffer 1 jetzt zusätzlich regelt: Vertragsschluss und Vertragssprache.',
    en: 'The heading names what section 1 now also covers: conclusion of the contract and contract language.',
  },
  '1': {
    letters: ['c', 'd'],
    de:
      'Bisher fehlte, wie der Vertrag zustande kommt, wie Eingaben korrigiert werden, dass der Vertragstext gespeichert und die Annahme mit Hashwert nachgewiesen und per E-Mail bestätigt wird, und in welcher Sprache der Vertrag gilt (1.2–1.4). ' +
      'Neu ist die deutsche Vertragsfassung (1.4). 1.5 beschreibt das Produkt und dass Batch-Upload und Portfolio, neu in 3.0.21, einen eigenen geprüften Modellschlüssel brauchen. Das Mindestalter (1.6) ist unverändert.',
    en:
      'What was missing: how the contract is concluded, how entries can be corrected, that the contract text is stored and the acceptance is recorded with its digest and confirmed by e-mail, and which language governs (1.2–1.4). ' +
      'The German contract version is new (1.4). 1.5 describes the product, and that bulk upload and portfolio, new in 3.0.21, need an own tested model key. The minimum age (1.6) is unchanged.',
  },
  '2.1': {
    letters: ['c'],
    de: 'Mit eigenen Modellschlüsseln (neu: Anthropic) sagt die Klausel, dass Kosten des Modellanbieters in Ihrem eigenen Vertrag mit ihm entstehen und der Betreiber daran nichts verdient.',
    en: 'With own model keys (new: Anthropic), the clause says that the model provider\'s charges arise in your own contract with it and that the operator earns nothing from them.',
  },
  '2.2': {
    letters: ['d'],
    de: 'Beschreibt den Betrieb durch eine Person ohne Bereitschaftsdienst als Leistungsbeschreibung, statt eine Verfügbarkeit nur auszuschließen (Verbraucherrecht für digitale Produkte, §§ 327 ff. BGB, offener Punkt der Rechtsprüfung).',
    en: 'Describes the operation by one person without on-call service as part of the service description, instead of only excluding availability (consumer law for digital products, §§ 327 ff. BGB, an open point of the legal review).',
  },
  '2.3': {
    letters: ['d', 'e'],
    de: 'Nennt, was bei Vertragsende gelöscht wird (auch eigener Modellschlüssel und S/4HANA-Verbindungsdaten), die Frist und die Backups, wie in der Datenschutzerklärung beschrieben.',
    en: 'States what is deleted when the contract ends (including an own model key and S/4HANA connection data), the period and the backups, as described in the Privacy Policy.',
  },
  '2.4': { letters: ['e'], ...EDITORIAL },
  '2.5': {
    letters: ['e'],
    de: 'Sprachlich überarbeitet; der Verweis auf § 327r BGB gilt „soweit anwendbar“. Inhaltlich unverändert.',
    en: 'Reworded; the reference to § 327r BGB applies "where applicable". The content is unchanged.',
  },
  '3': { letters: ['e'], ...EDITORIAL },
  '4:heading': {
    letters: ['d'],
    de: '„Vereinbarte Beschaffenheit“ wird zu „Leistungsbeschreibung“, passend zu Ziffer 4.1 und 4.2.',
    en: '"Agreed characteristics" becomes "service description", in line with sections 4.1 and 4.2.',
  },
  '4.1': {
    letters: ['c', 'd'],
    de:
      'Neu sind importierte ATC-Ergebnisse und Nutzungsdaten: sie stehen neben den Befunden und fließen nie in den signierten Lauf ein. Jeder Schritt nennt Anbieter und Modell, und Modell-Ergebnisse sind als KI-generiert gekennzeichnet (Transparenzpflicht nach Art. 50 KI-Verordnung). ' +
      'Die Klausel beschreibt die Leistung, statt eine Abweichung von der vereinbarten Beschaffenheit zu vereinbaren.',
    en:
      'New: imported ATC results and usage data stand beside the findings and never flow into the signed run. Every step names the provider and the model, and model output is marked as AI-generated (transparency duty under Art. 50 of the AI Act). ' +
      'The clause describes the service instead of agreeing a deviation from agreed characteristics.',
  },
  '4.2': {
    letters: ['d', 'e'],
    de: 'Für Verbraucher gilt eine Abweichung von den objektiven Anforderungen nur mit gesonderter Zustimmung, die der Betreiber nicht einholt; die Klausel gilt dann nicht (§ 327h BGB). Das klärt einen offenen Punkt der Rechtsprüfung zugunsten der Verbraucher.',
    en: 'For consumers, a deviation from the objective requirements applies only with a separate agreement, which the operator does not obtain; the clause then does not apply (§ 327h BGB). This settles an open point of the legal review in favour of consumers.',
  },
  '4.3': { letters: ['e'], ...EDITORIAL },
  '5': {
    letters: ['b', 'c', 'd'],
    de:
      'Neu ist der eigene Anthropic-Schlüssel (Claude) unter einer gesonderten Zusatzvereinbarung; Anfragen darauf werden in den USA verarbeitet. Für einen eigenen Gemini-Schlüssel gelten die Gemini-API-Bedingungen von Google vom 28.04.2026 (ein aktives Cloud-Billing-Konto ist nötig). ' +
      'Ergänzt sind, wer datenschutzrechtlich wofür verantwortlich ist, eine vorsorgliche Regelung zur gemeinsamen Verantwortlichkeit, dass kein Aufruf auf den Plattform-Schlüssel ausweicht, und dass automatische Modellschritte mit eigenem Schlüssel nur nach Einschalten laufen.',
    en:
      'New: your own Anthropic key (Claude), under a separate Additional Agreement; requests on it are processed in the United States. For an own Gemini key, Google\'s Gemini API terms of 28 April 2026 apply (an active Cloud Billing account is required). ' +
      'Added: who is responsible for what under data-protection law, a precautionary joint-controllership clause, that no call falls back to the platform key, and that automatic model steps with an own key run only once switched on.',
  },
  '6': {
    letters: ['c'],
    de: 'Keine Kontingentgrenze gilt jetzt auch mit einem eigenen Schlüssel eines Anbieters aus der Zusatzvereinbarung (Anthropic), nicht nur mit Gemini.',
    en: 'No quota now also applies with an own key of a provider named in the Additional Agreement (Anthropic), not only with Gemini.',
  },
  '7': {
    letters: ['c', 'd', 'e'],
    de:
      'Neu: die S/4HANA-Anbindung liest nur noch Strukturinformation, der Katalogmodus ist entfallen. Neu ist ein Meldeweg für rechtswidrige Inhalte, die etwa in geteilten Projekten oder Portfolios stehen; die bisherige Fassung hatte keinen. ' +
      'Fehlermeldungen sind eine Bitte, keine Pflicht. Sperren und Beenden verweisen auf Ziffer 2.4 und 2.3.',
    en:
      'New: the S/4HANA connection reads structure only; the catalogue mode is gone. New: a way to report illegal content, for example in shared projects or portfolios; the previous version had none. ' +
      'Reporting errors is a request, not a duty. Suspension and ending refer to sections 2.4 and 2.3.',
  },
  '8': {
    letters: ['c', 'd'],
    de:
      'Ihre Zusicherung deckt jetzt ausdrücklich ganze Repositories mit Fremdcode, importierte ATC-Ergebnisse und Nutzungsdaten sowie die Anbindung eines SAP-Systems (Batch-Upload, ATC-Import und S/4HANA-Anbindung). ' +
      'Die Klausel sagt genauer, dass der Betreiber Verantwortlicher ist und kein Auftragsverarbeiter, und was die Maskierung leistet: nur in Ausgaben, der Modellanbieter erhält den Code unmaskiert.',
    en:
      'Your warranty now expressly covers whole repositories with third-party code, imported ATC results and usage data, and connecting an SAP system (bulk upload, ATC import and S/4HANA connection). ' +
      'The clause says more precisely that the operator is controller, not processor, and what the masking does: only in outputs; the model provider receives the code unmasked.',
  },
  '9': {
    letters: ['e'],
    de: 'Verweist zusätzlich auf die Empfänger Ihrer Daten in der Datenschutzerklärung; sonst sprachlich überarbeitet.',
    en: 'Also refers to the recipients of your data in the Privacy Policy; otherwise reworded.',
  },
  '10.1': {
    letters: ['d'],
    de: 'Stellt klar, dass 10.1 bis 10.3 bestehende Verträge betreffen; wer sich neu registriert, nimmt die dann angebotene Fassung an.',
    en: 'Clarifies that 10.1 to 10.3 concern existing contracts; whoever signs up accepts the version offered at that time.',
  },
  '10.2': {
    letters: ['d'],
    de: 'Regelt, was bisher offen war: Nehmen Sie eine Änderung vor dem angekündigten Tag an, wird sie erst an diesem Tag wirksam; der Betreiber hält beide Zeitpunkte fest und bestätigt die Annahme.',
    en: 'Settles what was open: if you accept an amendment before the announced day, it takes effect only on that day; the operator records both times and confirms the acceptance.',
  },
  '10.3': {
    letters: ['d'],
    de: 'Die bisherige Fassung nannte für die Kündigung durch den Betreiber eine zusätzliche Voraussetzung, die Ziffer 2.3 nicht kennt. Jetzt verweisen beide Kündigungsrechte nur auf Ziffer 2.3 (30 Tage Frist in Textform für den Betreiber).',
    en: 'The previous version named an extra condition for termination by the operator that section 2.3 does not have. Now both rights to terminate refer to section 2.3 only (30 days\' notice in text form for the operator).',
  },
  '10.4': {
    letters: ['d'],
    de: 'Stellt klar, dass Änderungen am Kern des Vertrags immer Ihre ausdrückliche Annahme brauchen und nie als „rein vorteilhaft“ nach 10.4(e) gelten.',
    en: 'Clarifies that amendments to the core of the contract always need your express acceptance and never count as "purely advantageous" under 10.4(e).',
  },
  '10.5': {
    letters: ['d', 'e'],
    de: 'Jede Fassung bleibt mit dem SHA-256-Hashwert ihres Wortlauts veröffentlicht, mindestens so lange, wie ein Nachweis ihrer Annahme aufbewahrt wird.',
    en: 'Every version stays published with the SHA-256 digest of its wording, at least as long as a record of its acceptance is kept.',
  },
  '11': {
    letters: ['d', 'e'],
    de: 'Der Gerichtsstand Bamberg gilt nur noch für Kaufleute, juristische Personen und Sondervermögen des öffentlichen Rechts; die bisherige Formulierung „soweit gesetzlich zulässig“ war unbestimmt.',
    en: 'Bamberg as place of jurisdiction now applies only to merchants, legal entities and special funds under public law; the previous wording "to the extent permitted by law" was vague.',
  },
  '12': { letters: ['e'], ...EDITORIAL },
  '13:heading': {
    letters: ['d'],
    de: 'Die Überschrift folgt dem neuen Inhalt von Ziffer 13: Kündigung statt Widerruf.',
    en: 'The heading follows the new content of section 13: termination instead of withdrawal.',
  },
  '13': {
    letters: ['d'],
    de:
      'Für diesen unentgeltlichen Vertrag besteht kein gesetzliches Widerrufsrecht (§ 312 Abs. 1 und 1a BGB); die bisherige Fassung beschrieb eines. Sie können weiterhin jederzeit ohne Frist kündigen; der Betreiber bietet das als Funktion an. ' +
      'Neu ist auch: Umfragen und Community-Mails gehören nicht zum Vertrag, und Einwilligungen können Sie jederzeit widerrufen.',
    en:
      'There is no statutory right of withdrawal for this free contract (§ 312(1) and (1a) BGB); the previous version described one. You can still end the contract at any time without notice; the operator offers this as a function. ' +
      'Also new: surveys and community mail are not part of the contract, and you can withdraw consents at any time.',
  },
  contact: {
    letters: ['d'],
    de: 'Nennt die Kontaktadresse ausdrücklich als Ansprechstelle für Behörden und Nutzer, auf Deutsch oder Englisch, beantwortet von einer Person.',
    en: 'Names the contact address expressly as the point of contact for authorities and users, in German or English, answered by a person.',
  },
};
