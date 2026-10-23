import { OWN_CLAUDE_MODEL } from '@/lib/model-providers';

/**
 * Every value the legal texts of Fassung 1.1 (3.0.21) still wait for — one file,
 * one entry per question the owner has to answer.
 *
 * The published texts (privacy policy, Terms of Service v2.3.0, the Additional
 * Agreement ZV-BYOK-1.0, the trust page and the consent texts) carry a token
 * `{{key}}` wherever the draft had a placeholder. The page renders the token
 * from here, so answering a question is a one-line change in this file and
 * never an edit of the legal wording itself.
 *
 * Two kinds:
 *
 * - `value` — the token is replaced by words (a date, a period, an address).
 *   A value that is a fact — a date, a re-certification date, an address — is
 *   never pre-filled: until the owner enters it, the page shows a visible
 *   "[offen: …]" / "[open: …]" marker. The one exception is a fact entered
 *   on the owner's instruction from a named source (`enteredFrom`), which
 *   renders but stays unconfirmed until he checks it. A period the draft suggested a default
 *   for ("z. B. 90 Tage") is pre-filled with that default and stays
 *   `ownerConfirmed: false` until the owner confirms it.
 * - `check` — the token renders nothing. The sentence around it states a fact
 *   about the product (a function that has to exist, a code state that has to
 *   hold); the entry is the owner's confirmation that it does.
 *
 * `tests/legal-texts-release-gate.spec.ts` fails while any entry is
 * `ownerConfirmed: false` or any published text still renders a marker. It is
 * meant to be red until the owner has answered — that is the point of it.
 *
 * Nothing here is a lawyer question: those are not published and are not
 * tracked in the repository.
 */

export type LegalLang = 'de' | 'en';

export type OpenValueKind = 'value' | 'check';

export interface OpenValue {
  key: string;
  kind: OpenValueKind;
  /** Short German name, used in the "[offen: …]" marker and the owner list. */
  topicDe: string;
  /** Short English name, used in the "[open: …]" marker. */
  topicEn: string;
  /** The question for the owner, in German. */
  questionDe: string;
  /** The same question in English. */
  questionEn: string;
  /** The default the draft suggested, if it suggested one. */
  suggestedDefault: { de: string; en: string } | null;
  /** The words rendered into the text (kind `value` only); null shows the marker. */
  value: { de: string; en: string } | null;
  /** True once the owner has confirmed the value or the check. */
  ownerConfirmed: boolean;
  /** A fact (date, address, URL) — never pre-filled. */
  isFact: boolean;
  /** Where the value appears: DSE = privacy policy, Terms, ZV, Trust, C1–C11. */
  usedIn: string;
  /**
   * Where a fact was read when it was entered on the owner's instruction before he
   * confirmed it (owner decision 23.10.2026). Only such a fact may carry a value
   * while `ownerConfirmed` is false; the release gate stays red until he confirms.
   */
  enteredFrom?: string;
  /** What the build agent found in the code, where it checked. A finding, not a confirmation. */
  agentNote?: string;
}

/**
 * The release date of Fassung 1.1, ISO `YYYY-MM-DD`, or null until the owner
 * sets it. It is the effective date of Terms v2.3.0 and ZV-BYOK-1.0 and the
 * "Stand" of the privacy policy.
 */
export const LEGAL_RELEASE_DATE_ISO: string | null = null;

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "23. Oktober 2026" / "23 October 2026" for an ISO date. */
export function formatLegalDate(iso: string, lang: LegalLang): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`not an ISO date: ${iso}`);
  const day = Number(m[3]);
  const month = Number(m[2]) - 1;
  return lang === 'de' ? `${day}. ${MONTHS_DE[month]} ${m[1]}` : `${day} ${MONTHS_EN[month]} ${m[1]}`;
}

const check = (
  key: string,
  topicDe: string,
  topicEn: string,
  questionDe: string,
  questionEn: string,
  usedIn: string,
  agentNote?: string,
  ownerConfirmed = false,
): OpenValue => ({
  key,
  kind: 'check',
  topicDe,
  topicEn,
  questionDe,
  questionEn,
  suggestedDefault: null,
  value: null,
  ownerConfirmed,
  isFact: false,
  usedIn,
  ...(agentNote ? { agentNote } : {}),
});

export const OPEN_VALUES: readonly OpenValue[] = [
  // --- Values rendered into the text -------------------------------------------------
  {
    key: 'releaseDate',
    kind: 'value',
    topicDe: 'Datum der Freigabe',
    topicEn: 'release date',
    questionDe:
      'An welchem Tag gehen die Rechtstexte Fassung 1.1 live (Stand der Datenschutzerklärung, Inkrafttreten der Nutzungsbedingungen v2.3.0 und der Zusatzvereinbarung ZV-BYOK-1.0, „Last reviewed“ der Trust-Seite)? Eintrag als LEGAL_RELEASE_DATE_ISO; danach TERMS_VERSION auf dieses Datum setzen und das Archiv neu erzeugen (scripts/legal/archive-terms.ts).',
    questionEn:
      'On which day do the legal texts of version 1.1 go live (privacy policy date, effective date of Terms v2.3.0 and ZV-BYOK-1.0, trust page "last reviewed")? Set LEGAL_RELEASE_DATE_ISO, then set TERMS_VERSION to that date and regenerate the archive (scripts/legal/archive-terms.ts).',
    suggestedDefault: null,
    value: LEGAL_RELEASE_DATE_ISO
      ? { de: formatLegalDate(LEGAL_RELEASE_DATE_ISO, 'de'), en: formatLegalDate(LEGAL_RELEASE_DATE_ISO, 'en') }
      : null,
    ownerConfirmed: false,
    isFact: true,
    usedIn: 'DSE Kopf; Terms Kopf; ZV Kopf; Trust Kopf; C1',
  },
  {
    key: 'operatorSignupMailRetention',
    kind: 'value',
    topicDe: 'Löschfrist der Betreiber-Mail über ein neues Konto',
    topicEn: 'retention of the new-account mail to the operator',
    questionDe:
      'Nach wie vielen Tagen löschen Sie die Benachrichtigung über ein neues Konto spätestens aus Ihrem Postfach (wenn das Konto nicht vorher gelöscht wird)? Vorschlag des Entwurfs: 90 Tage.',
    questionEn:
      'After how many days at the latest do you delete the new-account notice from your mailbox (if the account is not erased before)? The draft suggests 90 days.',
    suggestedDefault: { de: '90 Tage', en: '90 days' },
    value: { de: '90 Tage', en: '90 days' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'DSE 2 (Benachrichtigung), DSE 6 (Speicherdauer)',
  },
  {
    key: 'accessLogRetention',
    kind: 'value',
    topicDe: 'Aufbewahrung der Serverprotokolle mit IP-Adresse',
    topicEn: 'retention of server logs with IP address',
    questionDe:
      'Wie lange bleiben Server- und Zugriffsprotokolle mit IP-Adresse in Cloud Logging (der Entwurf erlaubt 7 bis 14 Tage)? Die Frist muss in Cloud Logging tatsächlich so eingestellt sein. Vorbelegt: 14 Tage (Obergrenze des Entwurfs).',
    questionEn:
      'How long do server and access logs with IP address stay in Cloud Logging (the draft allows 7 to 14 days)? The period must actually be configured in Cloud Logging. Pre-filled: 14 days (the upper bound of the draft).',
    suggestedDefault: { de: '14 Tage', en: '14 days' },
    value: { de: '14 Tage', en: '14 days' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'DSE 6, DSE 9',
    agentNote:
      'Owner decision 22./23.10.2026: 14 days. The retention of the Cloud Logging bucket must actually be set to 14 days — an operator step outside the code (the owner does it).',
  },
  {
    key: 'mailDeliveryRecordRetention',
    kind: 'value',
    topicDe: 'Aufbewahrung der Zustellnachweise von Mails',
    topicEn: 'retention of mail delivery records',
    questionDe:
      'Wie lange behalten Sie den Zustellnachweis einer Mail an ein Konto (Art, Zeitpunkt, Message-ID, Status; der Entwurf erlaubt 30 bis 90 Tage)? Vorbelegt: 90 Tage (Obergrenze des Entwurfs; der Löschdialog C7 nennt „30 bis 90 Tage“).',
    questionEn:
      'How long do you keep the delivery record of a mail to an account (kind, time, message id, status; the draft allows 30 to 90 days)? Pre-filled: 90 days (the upper bound; the deletion dialog C7 says "30 to 90 days").',
    suggestedDefault: { de: '90 Tage', en: '90 days' },
    value: { de: '90 Tage', en: '90 days' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'DSE 6',
  },
  {
    key: 'operatorTerminationDeletion',
    kind: 'value',
    topicDe: 'Löschfrist nach Kündigung durch den Betreiber',
    topicEn: 'deletion period after termination by the operator',
    questionDe:
      'Binnen wie vieler Tage nach Vertragsende löschen Sie Konto und Inhalte, wenn Sie (der Betreiber) den Vertrag beenden? Vorschlag des Entwurfs: 7 Tage.',
    questionEn:
      'Within how many days after the contract ends do you delete the account and its content when you, the operator, end the contract? The draft suggests 7 days.',
    suggestedDefault: { de: '7 Tagen', en: '7 days' },
    value: { de: '7 Tagen', en: '7 days' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'DSE 6; Terms 2.3',
  },
  {
    key: 's4RequestMailRetention',
    kind: 'value',
    topicDe: 'Löschfrist der Antragsmail S/4HANA',
    topicEn: 'retention of the S/4HANA request mail',
    questionDe:
      'Wie lange nach Ihrer Entscheidung über einen Antrag auf die S/4HANA-Funktionen löschen Sie die Antragsmail spätestens aus Ihrem Postfach? Der Entwurf schlägt keinen Wert vor.',
    questionEn:
      'How long after your decision on a request for the S/4HANA functions do you delete the request mail from your mailbox at the latest? The draft suggests no value.',
    suggestedDefault: null,
    value: { de: '30 Tage', en: '30 days' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'DSE 2 (S/4HANA-Antrag), DSE 6',
    agentNote:
      'Owner decision 22./23.10.2026: 30 days after the decision. The sentence already says "nach der Entscheidung darüber" / "after the decision on it", so the value is the period alone.',
  },
  {
    key: 's4ApprovalCriteria',
    kind: 'value',
    topicDe: 'Kriterien für die Freischaltung der S/4HANA-Funktionen',
    topicEn: 'criteria for granting the S/4HANA functions',
    questionDe:
      'Nach welchen Kriterien schalten Sie die S/4HANA-Funktionen frei oder lehnen ab? Der Satz steht in der Datenschutzerklärung direkt nach „ein Administrator schaltet frei oder lehnt ab“ — bitte als ganzen Satz formulieren (DE und EN). Der Entwurf schlägt nichts vor.',
    questionEn:
      'By which criteria do you grant or refuse the S/4HANA functions? The sentence follows "an administrator grants or refuses it" in the privacy policy — please write it as a full sentence (DE and EN). The draft suggests nothing.',
    suggestedDefault: null,
    value: {
      de: 'Freigeschaltet wird ein Geschäftskonto mit aktiver Zwei-Faktor-Anmeldung, das den Zweck nennt und bestätigt, dass es nur ein eigenes Test- oder Sandbox-System verbindet.',
      en: 'An account is granted the S/4HANA functions when it is a business account with active two-factor sign-in, names the purpose, and confirms that it connects only its own test or sandbox system.',
    },
    ownerConfirmed: true,
    isFact: true,
    usedIn: 'DSE 2 (S/4HANA-Anbindung)',
  },
  {
    key: 'resendRecertificationDate',
    kind: 'value',
    topicDe: 'Rezertifizierungsdatum Resend (DPF)',
    topicEn: 'Resend re-certification date (DPF)',
    questionDe:
      'Welches nächste Rezertifizierungsdatum nennt die DPF-Liste (dataprivacyframework.gov/list) für Resend? Am Freigabetag nachsehen und eintragen.',
    questionEn:
      'Which next re-certification date does the DPF list (dataprivacyframework.gov/list) show for Resend? Look it up on the release day.',
    suggestedDefault: null,
    value: { de: formatLegalDate('2027-03-03', 'de'), en: formatLegalDate('2027-03-03', 'en') },
    ownerConfirmed: false,
    isFact: true,
    usedIn: 'DSE 4 (Drittlandübermittlung); Trust (Processors)',
    enteredFrom: 'dataprivacyframework.gov/list, participant 8907 (Resend), read 23.10.2026',
    agentNote:
      'Entered 23.10.2026 from the DPF list (participant 8907, status "re-certification under review"): 3 March 2027. The owner confirms it; it is re-checked on the release day.',
  },
  {
    key: 'transferReviewInterval',
    kind: 'value',
    topicDe: 'Prüfturnus der Übermittlungsgrundlagen',
    topicEn: 'review interval of the transfer bases',
    questionDe:
      'In welchem Turnus prüfen Sie DPF-Zertifizierungen, Vertragspartner der Anbieter und Anthropics Datenregion erneut? Vorschlag des Entwurfs: vierteljährlich.',
    questionEn:
      'How often do you re-check DPF certifications, the providers\' contracting entities and Anthropic\'s data region? The draft suggests quarterly.',
    suggestedDefault: { de: 'vierteljährlich', en: 'quarterly' },
    value: { de: 'vierteljährlich', en: 'quarterly' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'DSE 4 (zweimal); ZV 6',
  },
  {
    key: 'anthropicIrelandAddress',
    kind: 'value',
    topicDe: 'Anschrift Anthropic Ireland, Limited',
    topicEn: 'address of Anthropic Ireland, Limited',
    questionDe:
      'Welche Anschrift nennen Anthropics Vertragsunterlagen für Anthropic Ireland, Limited? (Steht in der Zusatzvereinbarung, Ziffer 4, vor „Irland“.)',
    questionEn:
      'Which address do Anthropic\'s contract documents give for Anthropic Ireland, Limited? (Clause 4 of the Additional Agreement, before "Ireland".)',
    suggestedDefault: null,
    value: { de: '6th Floor South Bank House, Barrow Street, Dublin 4', en: '6th Floor South Bank House, Barrow Street, Dublin 4' },
    ownerConfirmed: false,
    isFact: true,
    usedIn: 'ZV 4',
    enteredFrom: 'Irish company register (CRO), company number 760497, read 23.10.2026',
    agentNote:
      'Entered 23.10.2026 from the Irish company register (CRO 760497); the text adds "Irland" / "Ireland" itself. The owner checks it against his contract documents.',
  },
  {
    key: 'claudeModelId',
    kind: 'value',
    topicDe: 'Modellkennung Anthropic',
    topicEn: 'Anthropic model identifier',
    questionDe:
      'Welches Claude-Modell ruft die Plattform auf? Beantwortet (B7): claude-sonnet-5-5, gelesen aus OWN_CLAUDE_MODEL in lib/model-providers.ts — ein Modell neuer als Claude 4.6, unterstützt also die Datenregion „us“.',
    questionEn:
      'Which Claude model does the Platform call? Answered (B7): claude-sonnet-5-5, read from OWN_CLAUDE_MODEL in lib/model-providers.ts — newer than Claude 4.6, so it supports the data region "us".',
    suggestedDefault: null,
    value: { de: OWN_CLAUDE_MODEL, en: OWN_CLAUDE_MODEL },
    ownerConfirmed: true,
    isFact: true,
    usedIn: 'ZV 4; C3',
  },
  {
    key: 'zvTextFormEndingPeriod',
    kind: 'value',
    topicDe: 'Frist für das Löschen des Schlüssels nach Beendigung in Textform',
    topicEn: 'period for deleting the key after an ending in text form',
    questionDe:
      'Beendet jemand die Zusatzvereinbarung per E-Mail: binnen welcher Frist löschen Sie den Schlüssel spätestens? Vorschlag des Entwurfs: zwei Werktage.',
    questionEn:
      'If someone ends the Additional Agreement by e-mail: within which period do you delete the key at the latest? The draft suggests two working days.',
    suggestedDefault: { de: 'zwei Werktage', en: 'two working days' },
    value: { de: 'zwei Werktage', en: 'two working days' },
    ownerConfirmed: true,
    isFact: false,
    usedIn: 'ZV 11',
  },
  {
    key: 'reportingNotesUrl',
    kind: 'value',
    topicDe: 'Adresse der Meldehinweise (rechtswidrige Inhalte)',
    topicEn: 'address of the reporting notes (illegal content)',
    questionDe:
      'Unter welcher Adresse sind die Angaben für eine Meldung rechtswidriger Inhalte und die Ausnahmen davon beschrieben (Terms Ziffer 7)? Eine solche Seite gibt es heute nicht; sie müsste geschrieben werden, oder der Satz entfällt (dann bitte den Satz in beiden Fassungen streichen lassen).',
    questionEn:
      'At which address are the details a report of illegal content should contain, and the exceptions, described (Terms section 7)? No such page exists today; it would have to be written, or the sentence goes (then have it removed in both versions).',
    suggestedDefault: null,
    value: { de: 'clean-core.io/report/de', en: 'clean-core.io/report' },
    ownerConfirmed: true,
    isFact: true,
    usedIn: 'Terms 7',
    agentNote:
      'Owner decision 22./23.10.2026: the page /report (English) and /report/de (German), words in lib/legal/texts/report.en.ts and report.de.ts. The lawyer should read the page.',
  },

  // --- Confirmations: the sentence is published as written; the owner confirms it holds ---
  check(
    'profilePictureObjection',
    'Ablauf des Widerspruchs gegen das Profilbild',
    'objection workflow for the profile picture',
    'Wie läuft ein Widerspruch gegen das Profilbild ab (heute ein manueller Schritt: wer entfernt das Bild, wo)? Bitte bestätigen, dass Sie das Bild auf Widerspruch hin nicht mehr zeigen und speichern.',
    'How is an objection to the profile picture handled (a manual step today: who removes the picture, where)? Please confirm that you stop showing and storing it on objection.',
    'DSE 2 (Google-Anmeldung)',
    "Verified against dev on 23.10.2026: owner step; the text needs a look. The app never reads, stores or shows photoURL (no match in app/, components/, hooks/, lib/); it lives only in the Firebase Auth record. An objection today means a manual Admin-SDK updateUser(photoURL: null); no tool exists.",
  ),
  check(
    't03AdditionalAgreementAcceptance',
    'Annahme der Zusatzvereinbarung (Abnahme T03)',
    'acceptance of the Additional Agreement (acceptance test T03)',
    'Ist der Annahmedialog der Zusatzvereinbarung gebaut und abgenommen: Annahme je Hinterlegen, Nachweis (Kennung, Sprache, Zeitpunkt, SHA-256) im Nachweisprotokoll, Archiv der Fassung mit Hash, und das Gate „nur für Konten, die v2.3.0 oder später angenommen haben“?',
    'Is the acceptance dialog of the Additional Agreement built and accepted: acceptance on every storing, the record (identifier, language, time, SHA-256) in the proof log, the archive of the version with its digest, and the gate "only for accounts that accepted v2.3.0 or later"?',
    'DSE 2; Terms 5.2; ZV 1, 11, 12; Trust',
    "Verified against dev on 23.10.2026: partial. Holds: acceptance on every save (app/api/secrets/gemini/route.ts:81-90), proof-log row in the key transaction with version, language, server time (lib/firebase-admin.ts:2014-2038), archive with digests (lib/legal/byok-addendum-versions.ts). Missing (product work): the SHA-256 in the row is always null (lib/byok-addendum.ts:73 map is empty; archivedAddendumSha256 is not called), and there is no \"accepted v2.3.0 or later\" gate (requireCurrentTerms lets v2.2.0 through, lib/firebase-admin.ts:607-615).",
  ),
  check(
    't03ConfirmationMail',
    'Bestätigungsmail mit Fassung, Sprache, Zeitpunkt und Hash (Abnahme T03)',
    'confirmation mail with version, language, time and digest (acceptance test T03)',
    'Ist die Bestätigungsmail gebaut und abgenommen — nach der Registrierung, nach der Annahme einer Änderung und nach der Annahme der Zusatzvereinbarung, jeweils mit Fassung, Sprache, Zeitpunkt, SHA-256 und vollständigem Wortlaut? Und: soll der Wortlaut zusätzlich als PDF angehängt werden, falls der Mailtext begrenzt ist (C5)?',
    'Is the confirmation mail built and accepted — after sign-up, after accepting an amendment and after accepting the Additional Agreement, each with version, language, time, SHA-256 and full wording? And: should the wording also be attached as a PDF if the mail body is limited (C5)?',
    'DSE 2; Terms 1.3, 5.2, 10.2; ZV 12; C5',
    "Verified against dev on 23.10.2026: does not hold (product work). No confirmation mail to the user after sign-up or after accepting an amendment (lib/consent.ts sends nothing). After the Additional Agreement a mail goes out (lib/byok-agreement-mail.ts) but in English only, without the full wording (a link) and with the digest \"not pinned\"; CONSENT_TEXTS.confirmationMail (C5) is used nowhere. No PDF attachment (owner decision whether to add one).",
  ),
  check(
    't02AcceptedLanguage',
    'Angenommene Sprachfassung im Nachweis (Abnahme T02)',
    'accepted language version in the record (acceptance test T02)',
    'Hält der Zustimmungsnachweis die angenommene Sprachfassung fest (nicht die Oberflächensprache)? Erst dann kann der Registrierungsdialog die deutsche Fassung anbieten.',
    'Does the acceptance record store the accepted language version (not the interface language)? Only then can the sign-up dialog offer the German version.',
    'Terms 1.4; C1',
    "Verified against dev on 23.10.2026: does not hold (product work). lib/consent.ts:81-101 records the interface locale and always the English digest; the German archive is never recorded; components/legal/SignupConsent.tsx:10-14 says so.",
  ),
  check(
    'autoStepsSwitch',
    'Schalter „Automatische Schritte“ je eigenem Schlüssel (B6)',
    'switch "Automatic steps" per own key (B6)',
    'Ist der Schalter „Automatische Schritte mit meinem Schlüssel“ (Standard aus) gebaut, und laufen mit eigenem Schlüssel ohne ihn keine automatischen Schritte? (Wird in 3.0.21 von einem anderen Paket gebaut — nach dem Merge bestätigen.)',
    'Is the switch "Automatic steps on my key" (default off) built, and do no automatic steps run on an own key without it? (Built by another 3.0.21 package — confirm after the merge.)',
    'DSE 3; ZV 3; C3, C4; Trust',
    "Verified against dev on 23.10.2026: holds. Off by default per key (lib/firebase-admin.ts:1829-1854); switched on only for a tested key (setOwnKeyAutoSteps :2047-2068, app/api/secrets/gemini/auto-steps/route.ts); the proxy refuses an automatic call on an own key without it (app/api/gemini/route.ts:578-580; loadOwnModelKey lib/firebase-admin.ts:1937). The two automatic stages mark their calls (lib/plain-wording-client.ts, lib/process-naming-client.ts). Caveat: the server learns that a call is automatic from the browser (trigger: automatic).",
    true,
  ),
  check(
    'retryCounts',
    'Wiederholungszahlen der Modellaufrufe',
    'retry counts of model calls',
    'Wiederholt der Server einen vorübergehend gescheiterten Aufruf höchstens dreimal bei Google Gemini und höchstens zweimal bei Anthropic?',
    'Does the server repeat a temporarily failed call at most three times for Google Gemini and at most twice for Anthropic?',
    'DSE 3; Terms 5.3; ZV 7',
    "Verified against dev on 23.10.2026: holds. app/api/gemini/route.ts:215-217 MAX_RETRIES = 3 (Gemini), ANTHROPIC_MAX_RETRIES = 2; callWithRetry (:220-247) makes the first call and at most `retries` repeats, only on a transient error; used for Anthropic at :696. No SDK retry on top (@google/genai retries only with httpOptions.retryOptions, never set; lib/anthropic-messages.ts is a plain fetch). /api/gemini is the only server route that calls a model.",
    true,
  ),
  check(
    'aiMarkingManifest',
    'KI-Kennzeichnung und Manifest des Lieferpakets (Abnahme T08)',
    'AI marking and delivery-package manifest (acceptance test T08)',
    'Tragen alle modellgeschriebenen Artefakte Kopfkommentar und Metadatenfeld, gemischte Artefakte das Herkunftsattribut je Element, und deckt das Manifest die Dateien des Lieferpakets ab, sodass der Offline-Prüfer die Herkunft zeigt? Die Trust-Seite darf nur Formate nennen, die T08 bestanden haben.',
    'Do all model-written artefacts carry the header comment and the metadata field, mixed artefacts the per-element origin attribute, and does the manifest cover the delivery-package files so that the offline verifier shows the origin? The trust page may list only formats that passed T08.',
    'DSE 3; Trust (Server-authoritative evidence)',
    "Verified against dev on 23.10.2026: partial (product work, then T08 by the owner). Holds: header comment and metadata field (lib/ai-marking.ts), delivery-package manifest aiGeneration (lib/delivery-package.ts:2119-2166, 2279), audit-pack verifier hashes it (lib/audit-pack-verify.ts:791). Missing: per-element origin attribute on mixed artefacts; no marking in the BPMN export (lib/bpmn/export.ts); the offline verifier does not check the delivery-package manifest and /verify-pack does not show the origin; the trust page lists \"future MCP answers\", which cannot have passed T08.",
  ),
  check(
    'noProviderStorageFunctions',
    'Keine Speicherfunktionen der Anbieter',
    'no provider storage functions',
    'Bestätigen Sie gegen den Code-Stand, dass keine Funktion eines Anbieters genutzt wird, die eine Anfrage dort als Zustand hält (keine gespeicherten Antworten, hochgeladenen Dateien, Stapelaufträge, Zwischenspeicher)?',
    'Confirm against the code that no provider function is used that keeps a request there as state (no stored responses, uploaded files, batches, caches)?',
    'DSE 3',
    "Verified against dev on 23.10.2026: holds by code search. Gemini only via models.generateContent without cachedContent (app/api/gemini/route.ts:699); Anthropic only via /v1/messages without cache_control, batches or files (lib/anthropic-messages.ts:99-112, 186); key tests only list models. No files, batches, caches, cachedContent, store: true, previous_response_id or anthropic-beta in app/, lib/, components/, hooks/.",
    true,
  ),
  check(
    'providerSwitchOff',
    'Abschaltung je Anbieter ohne Ausweichen (Abnahme T01)',
    'per-provider switch-off without fallback (acceptance test T01)',
    'Ist die anbieterbezogene Abschaltung gebaut und abgenommen: Aufrufe an einen Anbieter lassen sich einstellen, der Schritt hält an und nennt den Grund (C11), kein Wechsel zu einem anderen Anbieter oder zum Plattform-Schlüssel, der Schlüssel bleibt gespeichert?',
    'Is the per-provider switch-off built and accepted: calls to a provider can be stopped, the step stops and says why (C11), no switch to another provider or the platform key, the key stays stored?',
    'DSE 4; Terms 5.3; ZV 6; Trust',
    "Verified against dev on 23.10.2026: partial. Holds: MODEL_PROVIDERS_SUSPENDED (lib/model-providers.ts:64-78) checked before every provider contact without fallback (app/api/gemini/route.ts:565-571, app/api/secrets/gemini/route.ts:75, app/api/secrets/gemini/test/route.ts:107, app/api/model-stages/route.ts:108-111); the key stays stored. Missing (product work): the C11 notice with date and reason (consent-texts.ts) is used nowhere, users see providerSuspendedMessage; no behavioural test. Setting the variable is an operator step.",
  ),
  check(
    'proofLog',
    'Nachweisprotokoll mit Löschdatum und nächtlicher Löschung (Abnahme T05/T06)',
    'proof log with deletion dates and nightly purge (acceptance tests T05/T06)',
    'Sind Nachweisprotokoll (getrennt, append-only, HMAC statt Adresse nach Kontolöschung), Löschdatum je Eintrag, nächtliche Löschung, die Lösch-Tests (auch für das Nachweisprotokoll) und docs/DATA-RETENTION.md gebaut und abgenommen? Erst dann dürfen DSE 5, Terms 1.3, der Löschdialog C7 und der Satz der Trust-Seite zum automatisierten Löschtest so stehen.',
    'Are the proof log (separate, append-only, HMAC instead of the address after erasure), the per-entry deletion date, the nightly purge, the deletion tests (including the proof log) and docs/DATA-RETENTION.md built and accepted? Only then may privacy section 5, Terms 1.3, the deletion dialog C7 and the trust page sentence on the automated deletion test stand as written.',
    'DSE 5; Terms 1.3; C7; Trust (Your rights)',
    "Verified against dev on 23.10.2026: does not hold (product work). byok_agreement_events exists and is server-only, but on erasure both logs are deleted (lib/firebase-admin.ts:980, 983) instead of an HMAC replacing the address; consent_events stores the address in clear (lib/consent.ts:94); no per-entry deletion date, no nightly purge, no deletion tests for a kept log; docs/DATA-RETENTION.md does not list it.",
  ),
  check(
    'retentionRegister',
    'Register docs/DATA-RETENTION.md ergänzt',
    'register docs/DATA-RETENTION.md extended',
    'Ist docs/DATA-RETENTION.md um Nachweisprotokoll, Löschvermerk, Sperrlisten und Zustellnachweise ergänzt?',
    'Has docs/DATA-RETENTION.md been extended with the proof log, the deletion note, the suppression lists and the delivery records?',
    'DSE 6',
    "Verified against dev on 23.10.2026: does not hold (docs work after proofLog). docs/DATA-RETENTION.md has no byok_agreement_events and no deletion note; consent_events listed as deleted on erasure; email_suppressions \"until erased\", no invitation suppression list; email_events \"Life of account\" instead of the 30 to 90 days the texts state.",
  ),
  check(
    'noRequestWithoutSignIn',
    'Keine Anfrage an Dritte ohne Anmeldung (Netzwerkmitschnitt)',
    'no third-party request without sign-in (network capture)',
    'Bestätigt ein Netzwerkmitschnitt ohne Anmeldung, dass keine Seite einen Google-Endpunkt (oder sonst jemanden außer clean-core.io) anfragt? Der Prüfbericht warnt: das Firebase-SDK spricht Google-Endpunkte oft schon beim Laden an — dann stimmt der Satz in Abschnitt 7 nicht.',
    'Does a network capture without sign-in confirm that no page requests a Google endpoint (or anyone other than clean-core.io)? The review warns that the Firebase SDK often calls Google endpoints on load — then the sentence in section 7 is wrong.',
    'DSE 7',
    "Verified against dev on 23.10.2026: the code suggests it does not hold (product work + owner network capture). Public headers load the Firebase Auth SDK after hydration and call onAuthStateChanged (lib/auth-subscribe.ts:29-46 via components/landing/AuthLink.tsx); the landing mounts LandingModals when idle and calls getRedirectResult (components/LandingModals.tsx:318), which typically loads the firebaseapp.com iframe and apis.google.com. Fonts are local, no analytics.",
  ),
  check(
    'emergencyAccessLogging',
    'Protokollierung des Notfallzugriffs',
    'logging of emergency access',
    'Wird ein Notfallzugriff des Betreibers auf ein Projekt oder ein hinterlegtes Geheimnis protokolliert, und sagen Sie zu, Schlüssel und S/4HANA-Passwörter nur als solche protokollierte Notfallhandlung zu entschlüsseln?',
    'Is an emergency access by the operator to a project or a stored secret logged, and do you commit to decrypting keys and S/4HANA passwords only as such a logged emergency act?',
    'DSE 8 (zweimal); ZV 10',
    "Verified against dev on 23.10.2026: partial (operator step). No application path lets the operator open a project or decrypt a secret (firestore.rules:352-370; every loadS4ConfigForUser / loadOwnModelKey caller uses its own uid). But no emergency-access tool or audit write exists: the logging has to come from GCP Data Access audit logs for Firestore and the keys plus a runbook, which the owner sets up.",
  ),
  check(
    'anthropicDpfRecheck',
    'DPF-Status Anthropic am Freigabetag',
    'Anthropic DPF status on the release day',
    'Ist Anthropic am Freigabetag weiterhin nicht als aktiver Teilnehmer des EU-U.S. Data Privacy Framework gelistet (dataprivacyframework.gov/list)?',
    'On the release day, is Anthropic still not listed as an active participant of the EU-U.S. Data Privacy Framework (dataprivacyframework.gov/list)?',
    'DSE 4; ZV 4; Trust',
  ),
  check(
    'anthropicResidencyRecheck',
    'Datenresidenz-Seite Anthropic am Freigabetag',
    'Anthropic data-residency page on the release day',
    'Sagt Anthropics Seite zur Datenresidenz am Freigabetag weiterhin: nur „us“ und „global“ für die Verarbeitung, keine EU-Option, Workspace geo nur „us“, Aufschlag 1,1-fach?',
    'On the release day, does Anthropic\'s data-residency page still say: only "us" and "global" for processing, no EU option, workspace geo "us" only, 1.1 times the price?',
    'ZV 6; Trust',
  ),
  check(
    'googleDpfRecheck',
    'DPF-Status Google LLC am Freigabetag',
    'Google LLC DPF status on the release day',
    'Ist Google LLC am Freigabetag weiterhin als aktiver Teilnehmer des Data Privacy Framework gelistet?',
    'On the release day, is Google LLC still listed as an active participant of the Data Privacy Framework?',
    'DSE 4',
  ),
  check(
    'manualKeyBlock',
    'Manuelle Sperre des Schlüssels bis zur Löschung',
    'manual blocking of the key until deletion',
    'Können Sie einen Anthropic-Schlüssel nach einer Beendigung per E-Mail sofort sperren, sodass bis zur Löschung kein Aufruf mehr an Anthropic geht?',
    'Can you block an Anthropic key at once after an ending by e-mail, so that no call goes to Anthropic until it is deleted?',
    'ZV 11',
    "Verified against dev on 23.10.2026: holds. Admin console panel components/admin/ByokEndingPanel.tsx (app/(app)/admin/page.tsx:584) -> app/api/admin/console-action/route.ts:69-71 (admin + step-up) -> adminBlockOwnModelKey lib/firebase-admin.ts:2104-2121 sets blockedAt and writes a proof-log and an audit row; loadOwnModelKey throws OwnModelKeyBlockedError (:1935), so /api/gemini answers 503 without a call and never falls back to the platform key.",
    true,
  ),
  check(
    'behaviourAfterKeyDeletion',
    'Verhalten nach dem Löschen des eigenen Schlüssels',
    'behaviour after deleting the own key',
    'Laufen modellgestützte Schritte nach dem Löschen des Anthropic-Schlüssels wieder über den Plattform-Schlüssel im Rahmen des Kontingents (gegen den Code-Stand bestätigen)?',
    'After the Anthropic key is deleted, do model-supported steps run on the platform key again within the quota (confirm against the code)?',
    'ZV 11',
    "Verified against dev on 23.10.2026: holds. deleteOwnModelKey (lib/firebase-admin.ts:1968-2002) removes every provider record and the profile fields; loadOwnModelKey then returns null (:1922-1925) and the proxy uses the platform key (app/api/gemini/route.ts:565, 588-592) within the daily budget and quota (:621-633). Same after a text-form ending (adminEndByokAgreement :2124). Caveat: if gemini is suspended, the platform key is too.",
    true,
  ),
  check(
    'anthropicGoLive',
    'Anthropic-Schlüssel erst mit diesen Texten freischalten',
    'enable Anthropic keys only with these texts',
    'Wird der eigene Anthropic-Schlüssel (ANTHROPIC_OWN_KEY_OFFERED) genau mit der Veröffentlichung dieser Fassung und der Zusatzvereinbarung freigeschaltet — nicht vorher?',
    'Is the own Anthropic key (ANTHROPIC_OWN_KEY_OFFERED) enabled exactly with the publication of this version and of the Additional Agreement — not before?',
    'DSE 2; Terms 5.2',
    "Verified against dev on 23.10.2026: operator step. ANTHROPIC_OWN_KEY_OFFERED is a hard-coded true (lib/model-providers.ts:45), so every build, dev included, offers Anthropic keys; the only tie to publication is this release gate on main. Either make the gate a required check before the production deploy or set the flag false until the release day.",
  ),
  check(
    's4NoRecordRead',
    'S/4HANA: nur Strukturinformationen, kein Datensatz',
    'S/4HANA: structural information only, no record',
    'Liest der veröffentlichte Stand aus einem angebundenen System nur Strukturinformationen ($metadata oder CSRF-Token) und nie einen Datensatz, Feldinhalt oder eine Anzahl?',
    'Does the published build read only structural information ($metadata or a CSRF token) from a connected system and never a record, a field value or a count?',
    'DSE 2; Terms 7; Trust (S/4HANA connection)',
    "Verified on the 3.0.21 package branch on 23.10.2026: holds. Every route that reaches a tenant builds only `…/$metadata` URLs: the connection test through lib/s4-connection-probe.ts:86 (app/api/test-s4-connection/route.ts:318, :422; plus the OAuth token exchange, which reads no record), app/api/fetch-s4-metadata/route.ts:343, app/api/test-s4-odata-read/route.ts:278 and app/api/fetch-odata-metadata/route.ts:398-406. The catalog mode of fetch-odata-metadata, which read the gateway catalog's ServiceCollection records, is removed together with its Testing-stage list; a call without a service name is refused before any request (route.ts:319), and the page's quick picks are a fixed list (app/(app)/project/[projectId]/testing/page.tsx:190). The only other outbound route, the credential proxy app/api/s4-proxy, serves live test runs only, which are locked (lib/locked-paths.ts:41-43; refused before a capability is minted, app/api/run-tests/route.ts:295). No CSRF-token fetch exists. Held by tests/s4-metadata-only-guard.spec.ts.",
    true,
  ),
  check(
    't07ReportingProcess',
    'Meldeverfahren: Eingang, Prüfung, begründete Entscheidung (Abnahme T07)',
    'reporting procedure: receipt, examination, reasoned decision (acceptance test T07)',
    'Ist der Ablauf für Meldungen rechtswidriger Inhalte eingerichtet: Eingangsbestätigung, Prüfung durch einen Menschen, begründete Mitteilung an Meldenden und betroffenes Konto?',
    'Is the procedure for reports of illegal content in place: acknowledgement of receipt, examination by a person, reasoned notice to the reporting person and the account concerned?',
    'Terms 7',
    "Verified against dev on 23.10.2026: owner/operator procedure, no code. Reports arrive by e-mail at info@clean-core.io; the notes are at /report. Acknowledgement, human review and reasoned notices are the owner's process.",
  ),
];

const BY_KEY = new Map(OPEN_VALUES.map((v) => [v.key, v]));

export function openValue(key: string): OpenValue {
  const v = BY_KEY.get(key);
  if (!v) throw new Error(`unknown open value: ${key}`);
  return v;
}

/** The visible marker an unfilled value renders as. The release gate looks for it. */
export function openValueMarker(v: OpenValue, lang: LegalLang): string {
  return lang === 'de' ? `[offen: ${v.topicDe}]` : `[open: ${v.topicEn}]`;
}

/** What the token `{{key}}` renders as in `lang`: the words, nothing (a check), or the marker. */
export function renderOpenValue(key: string, lang: LegalLang): string {
  const v = openValue(key);
  if (v.kind === 'check') return '';
  return v.value ? v.value[lang] : openValueMarker(v, lang);
}

/** The open entries — the owner's to-do list. */
export function unconfirmedOpenValues(): OpenValue[] {
  return OPEN_VALUES.filter((v) => !v.ownerConfirmed);
}
