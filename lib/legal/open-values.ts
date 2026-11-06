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

/**
 * The day the amended Terms (v2.3.0) take effect for an existing account, ISO
 * `YYYY-MM-DD`, or null until the owner sets it on the release day with the
 * announcement mail — at least six weeks after that mail (Terms 10.1). An
 * amendment accepted before it takes effect only on it (Terms 10.2,
 * `lib/terms-effective.ts`).
 *
 * 22 December 2026, entered on the owner's instruction of 06.11.2026: the
 * notice (`scripts/send-terms-announcement.ts`) goes out on 9 November 2026;
 * the script refuses after 10 November, six weeks before the day. Unconfirmed until
 * the owner checks it (`termsEffectiveDate` below), so the release gate stays red.
 */
export const TERMS_EFFECTIVE_DATE_ISO: string | null = '2026-12-22';

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

  {
    key: 'resendRetentionDays',
    kind: 'value',
    topicDe: 'Aufbewahrung des Mailinhalts bei Resend',
    topicEn: 'retention of mail content at Resend',
    questionDe:
      'Wie lange bewahrt Resend den Inhalt einer Mail laut der Aufbewahrungseinstellung Ihres Resend-Kontos auf (Resend-Dashboard)? Eintrag als ganze Angabe mit Stand, etwa „X Tage laut Kontoeinstellung, Stand TT.MM.JJJJ“ / „X days per account setting, as of D Month YYYY“. Für die bisher genannten 30 Tage gibt es keinen Beleg (Resends DPA nennt sie nicht).',
    questionEn:
      'How long does Resend keep the content of a mail under the retention setting of your Resend account (Resend dashboard)? Enter it with its date, e.g. "X days per account setting, as of D Month YYYY" and the German equivalent. The 30 days stated so far have no evidence (Resend\'s DPA does not name them).',
    suggestedDefault: null,
    value: null,
    ownerConfirmed: false,
    isFact: true,
    usedIn: 'DSE 2 (Benachrichtigung, Transaktionale E-Mails), DSE 4 (Resend), DSE 5 (bereits versandte Mails), DSE 6 (Benachrichtigung); C7; Trust (Resend, Your rights)',
  },
  {
    key: 'termsEffectiveDate',
    kind: 'value',
    topicDe: 'Wirksamkeitstag der geänderten Nutzungsbedingungen',
    topicEn: 'effective date of the amended Terms',
    questionDe:
      'An welchem Tag werden die geänderten Nutzungsbedingungen v2.3.0 für bestehende Konten wirksam? Er steht in der Ankündigungsmail (Ziffer 10.1) und liegt mindestens sechs Wochen nach ihrem Versand. Eintrag als TERMS_EFFECTIVE_DATE_ISO am Freigabetag, zusammen mit der Ankündigungsmail.',
    questionEn:
      'On which day do the amended Terms v2.3.0 take effect for existing accounts? It is the date in the announcement mail (section 10.1), at least six weeks after it is sent. Set TERMS_EFFECTIVE_DATE_ISO on the release day, together with the announcement mail.',
    suggestedDefault: null,
    value: TERMS_EFFECTIVE_DATE_ISO
      ? { de: formatLegalDate(TERMS_EFFECTIVE_DATE_ISO, 'de'), en: formatLegalDate(TERMS_EFFECTIVE_DATE_ISO, 'en') }
      : null,
    ownerConfirmed: false,
    isFact: true,
    usedIn: 'C2 (Änderungsdialog); C5 (Bestätigungsmail nach einer Änderung); Terms 10.2',
    enteredFrom:
      'owner instruction relayed 06.11.2026: the announcement mail (scripts/send-terms-announcement.ts) goes out on 09.11.2026, the amended Terms take effect on 22.12.2026 (owner decision 06.11.2026)',
  },

  // --- Confirmations: the sentence is published as written; the owner confirms it holds ---
  check(
    'profilePictureRemoved',
    'Profilbild-Adresse nach der Google-Anmeldung entfernt',
    'profile picture address removed after Google sign-in',
    'Variante B, angepasst am 06.11.2026: Der Server entfernt die Adresse des Profilbilds nach jeder Google-Anmeldung vom Konto selbst (Feld „Photo URL“). In den Anbieterangaben (providerData, google.com) speichert Firebase Authentication sie bei jeder Anmeldung neu, so wie Google sie übermittelt; das sagt DSE 2 jetzt offen. Bitte an einem Google-Konto prüfen, dass „Photo URL“ leer ist.',
    'Variant B, adjusted on 06.11.2026: the server removes the profile picture address from the account itself (the "Photo URL" field) after every Google sign-in. Firebase Authentication rewrites it into the provider data (providerData, google.com) at every sign-in as Google sends it; privacy section 2 now says so openly. Please check on one Google account that "Photo URL" is empty.',
    'DSE 2 (Google-Anmeldung)',
    "Built in 3.0.21 (23.10.2026). T-B confirmed by code search: photoURL (and the ID token's picture claim) ends up in no Firestore collection, no log and no mail — no match for photoURL/picture in app/, components/, hooks/, lib/, scripts/ outside this text; no handler stores or logs the decoded token or the Auth user record. The removal: removeProfilePictureAddress (lib/profile-picture.ts) calls the Admin SDK updateUser(uid, { photoURL: null }) when the verified ID token carries a picture claim; it runs in POST /api/account/register (right after sign-up) and POST /api/account/signed-in, which the signed-in shell calls once per page load (hooks/useUserProfile.ts), so an existing account is cleaned at its next sign-in. Tests: tests/profile-picture-3021.spec.ts. Open: updateUser clears the top-level photoURL; whether Firebase also keeps the address in the google.com provider entry (providerData) could not be checked without the Auth emulator — the owner checks one account in the console. Checked 06.11.2026 on the owner account (read-only, scratch/check-photo.mjs): photoURL on the account empty; providerData google.com still carries the address. Firebase rewrites provider data at every Google sign-in and the Admin SDK cannot clear it permanently, so privacy section 2 was adjusted to say this Wording, legal basis Art. 6(1)(f) for the address, the objection list entry (section 5) and the retention row (section 6) agreed in the legal review of 06.11.2026..",
    true,
  ),
  check(
    'atcImportFieldList',
    'ATC-Import: übernommene Felder',
    'ATC import: fields taken over',
    'Übernimmt der ATC-Import nur Prüfung, Objekt, Position, Priorität, Meldungstext und die Ausnahme-Angabe und verwirft alle Felder mit Personenbezug (T-G)?',
    'Does the ATC import take over only the check, object, position, priority, message text and the exemption flag, and drop every field that relates to a person (T-G)?',
    'DSE 3 (Import von ATC-Ergebnissen)',
    "Verified against dev on 23.10.2026: holds, by two whitelists. The browser keeps only objectName, objectType, checkId, checkTitle, message, priority, line, include, exempted (sanitizeAtcFindings, lib/abap/atc-privacy.ts:25-37, applied in lib/abap/atc-parser.ts:180 for tables and :221 for ADT XML); the server stores only the same nine keys per finding (ATC_FINDING_KEYS, lib/project-commands.ts:243-253) and drops every other key. No author, reviewer, approver or last-changed-by column survives. The draft named a check variant: no check variant is stored, so the published text names the real fields; a name inside the message text stays (ATC_PRIVACY_NOTICE says so to the user).",
    true,
  ),
  check(
    'amendmentEffectiveDate',
    'Wirksamkeitstag einer frühen Annahme (Ziffer 10.2, C2)',
    'effective date of an early acceptance (section 10.2, C2)',
    'Hält der Nachweis einer Änderungsannahme Annahmezeitpunkt und Wirksamkeitstag getrennt fest, zeigt der Dialog C2 den Wirksamkeitstag mit zwei gleichrangigen Schaltflächen, nennt die Bestätigungsmail den Wirksamkeitstag, und gilt bis dahin die bisherige Fassung für das Konto?',
    'Does the record of an accepted amendment hold the time of acceptance and the effective date separately, does dialog C2 show the effective date with two equal buttons, does the confirmation mail name the effective date, and does the previous version apply to the account until then?',
    'Terms 10.2; C2; C5',
    "Built in 3.0.21 (23.10.2026), holds: acceptanceEffectiveAt (lib/terms-effective.ts) puts an amendment accepted before termsEffectiveDate into effect on that day (00:00 Europe/Berlin); recordConsent (lib/consent.ts) writes createdAt and effectiveAt separately to consent_events and termsEffectiveAt plus the version accepted before (termsVersionPrevious) to the profile; termsVersionInEffectFor answers the previous version until the effective date, and the Additional Agreement gate reads it (app/api/secrets/gemini/route.ts); the gate (components/TermsReacceptGate.tsx) shows C2 with the effective date and Accept / Decide later as the same button variant; the confirmation mail names the effective date (lib/contract-confirmation-email.ts). Tests: tests/terms-effective-3021.spec.ts. The date itself is the open value termsEffectiveDate.",
    true,
  ),
  check(
    'reportingBodiesLinks',
    'Externe Meldestellen auf /report am Freigabetag prüfen',
    'external reporting bodies on /report, checked on the release day',
    'Sind am Freigabetag die genannten externen Meldestellen (Onlinewachen der Polizei, jugendschutz.net, internet-beschwerdestelle.de) erreichbar und für solche Meldungen weiterhin zuständig?',
    'On the release day, are the external reporting bodies named (police online stations, jugendschutz.net, internet-beschwerdestelle.de) reachable and still the right place for such reports?',
    '/report, /report/de',
  ),
  check(
    't03AdditionalAgreementAcceptance',
    'Annahme der Zusatzvereinbarung (Abnahme T03)',
    'acceptance of the Additional Agreement (acceptance test T03)',
    'Ist der Annahmedialog der Zusatzvereinbarung gebaut und abgenommen: Annahme je Hinterlegen, Nachweis (Kennung, Sprache, Zeitpunkt, SHA-256) im Nachweisprotokoll, Archiv der Fassung mit Hash, und das Gate „nur für Konten, die v2.3.0 oder später angenommen haben“?',
    'Is the acceptance dialog of the Additional Agreement built and accepted: acceptance on every storing, the record (identifier, language, time, SHA-256) in the proof log, the archive of the version with its digest, and the gate "only for accounts that accepted v2.3.0 or later"?',
    'DSE 2; Terms 5.2; ZV 1, 11, 12; Trust',
    "Built in 3.0.21 (23.10.2026), holds: acceptance on every save (app/api/secrets/gemini/route.ts addendum check); the row in byok_agreement_events carries version, language, server time and now the SHA-256 of the archived wording of that language (BYOK_ADDENDUM_DIGESTS from lib/legal/byok-addendum-versions.ts, lib/byok-addendum.ts:78); archive with digests (docs/byok-addendum/); the gate \"only for accounts that accepted v2.3.0 or later\" refuses before the key is tested or stored (termsAllowAddendum, lib/byok-addendum.ts:99; app/api/secrets/gemini/route.ts:105, code byok-addendum-terms-required). Tests: tests/legal-gaps-3021.spec.ts, tests/byok-3021.spec.ts.",
    true,
  ),
  check(
    't03ConfirmationMail',
    'Bestätigungsmail mit Fassung, Sprache, Zeitpunkt und Hash (Abnahme T03)',
    'confirmation mail with version, language, time and digest (acceptance test T03)',
    'Ist die Bestätigungsmail gebaut und abgenommen — nach der Registrierung, nach der Annahme einer Änderung und nach der Annahme der Zusatzvereinbarung, jeweils mit Fassung, Sprache, Zeitpunkt, SHA-256 und vollständigem Wortlaut? Und: soll der Wortlaut zusätzlich als PDF angehängt werden, falls der Mailtext begrenzt ist (C5)?',
    'Is the confirmation mail built and accepted — after sign-up, after accepting an amendment and after accepting the Additional Agreement, each with version, language, time, SHA-256 and full wording? And: should the wording also be attached as a PDF if the mail body is limited (C5)?',
    'DSE 2; Terms 1.3, 5.2, 10.2; ZV 12; C5',
    "Built in 3.0.21 (23.10.2026), holds: the contract confirmation C5 (lib/contract-confirmation-email.ts:123, sender lib/contract-confirmation-mail.ts) goes out after sign-up (app/api/account/register/route.ts:111), after accepting an amendment (app/api/consent/route.ts:75) and after accepting the Additional Agreement (lib/byok-agreement-mail.ts:29), each in the language version accepted, with version, language, time (UTC), SHA-256, place and one link to the wording of exactly that version and language, at an address bound to both that serves the archived file (publishedWordingPath; /terms/versions/<id>/en|de and /terms/byok-addendum/versions/<id>/en|de); it goes out only while the rendered wording hashes to the recorded digest (acceptedWording, checked in tests/legal-gaps-3021.spec.ts); best effort, no resend (E14/E25). Since 06.11.2026 Terms 1.3 and ZV 12 promise that link instead of the wording in the mail, and the mail no longer carries the wording (so no PDF attachment either). The ending mail (C6) is still English only. Legal statements of 06.11.2026 (B1, M5): no text promises the address \"permanently\" any more. Terms 1.3, 10.5, ZV 2 and 12 and privacy section 2 keep the wording at its address at least as long as the record of acceptance is kept, and send it on request if the Platform closes earlier; C5 says it stays there while the Platform is operated and is sent on request after that (lib/legal/consent-texts.ts confirmationMail.body); the mail's link lead says \"with its hash value\" (lib/contract-confirmation-email.ts). C3 names the hash value of the accepted wording. C1 and C2 offer \"Save as file\" and \"Print\" for the offered wording (components/legal/SaveWordingActions.tsx, lib/legal/wording-file.ts: the archived bytes, so the file's SHA-256 is the recorded digest). Terms 5.2 now says the confirmation carries a link to the wording (M4).",
    true,
  ),
  check(
    't02AcceptedLanguage',
    'Angenommene Sprachfassung im Nachweis (Abnahme T02)',
    'accepted language version in the record (acceptance test T02)',
    'Hält der Zustimmungsnachweis die angenommene Sprachfassung fest (nicht die Oberflächensprache)? Erst dann kann der Registrierungsdialog die deutsche Fassung anbieten.',
    'Does the acceptance record store the accepted language version (not the interface language)? Only then can the sign-up dialog offer the German version.',
    'Terms 1.4; C1',
    "Built in 3.0.21 (23.10.2026), holds: both sign-up dialogs and the amendment dialog let the reader choose the contract language (ContractLanguageChoice, components/LandingModals.tsx:1035, components/UserOnboarding.tsx:255, components/TermsReacceptGate.tsx) and show C1/C2 and the full text in it; the choice travels as termsLanguage (app/api/account/register/route.ts, app/api/consent/route.ts) and lib/consent.ts:118-135 records it with the SHA-256 of exactly that language version's archived wording (archivedTermsSha256For, lib/terms-versions.ts), not the interface locale, plus termsLanguageAccepted on the profile. Tests: tests/legal-gaps-3021.spec.ts (T02). Rendered check for the merge: terms-reaccept-gate, terms-30-reconsent, registration flow specs.",
    true,
  ),
  check(
    'autoStepsSwitch',
    'Schalter „Automatische Schritte“ je eigenem Schlüssel (B6)',
    'switch "Automatic steps" per own key (B6)',
    'Ist der Schalter „Automatische Schritte mit meinem Schlüssel“ (Standard aus) gebaut, und laufen mit eigenem Schlüssel ohne ihn keine automatischen Schritte? (Wird in 3.0.21 von einem anderen Paket gebaut — nach dem Merge bestätigen.)',
    'Is the switch "Automatic steps on my key" (default off) built, and do no automatic steps run on an own key without it? (Built by another 3.0.21 package — confirm after the merge.)',
    'DSE 3; ZV 3; C3, C4; Trust',
    "Verified against dev on 23.10.2026: holds. Off by default per key (lib/firebase-admin.ts:1829-1854); switched on only for a tested key (setOwnKeyAutoSteps :2047-2068, app/api/secrets/gemini/auto-steps/route.ts); the proxy refuses an automatic call on an own key without it (app/api/gemini/route.ts:578-580; loadOwnModelKey lib/firebase-admin.ts:1937). The two automatic stages mark their calls (lib/plain-wording-client.ts, lib/process-naming-client.ts). Gap found 06.11.2026 and closed in code the same day: Transformation (first generation on opening, no code on record, no tip open) and Documentation (business layer on opening, none on record) called the model by themselves without the mark, so the server check never applied to them. Both now send that start as automatic — Transformation's leased fills and single call (generateTransformation(true), leasedFillModel(..., automatic), runSingleCall), Documentation's parts (writeBusinessLayer(true)) — and with an own key whose \"Automatic steps\" are off neither starts by itself: askModeOf (lib/auto-steps.ts) gives 'click', and the tool shows its normal button (Generate code; the business layer's offer) with the note autoSteps.onClickNote. A click is never marked. Platform key unchanged. Tests: tests/auto-steps-tools-on-open-3021.spec.ts. The owner has not checked this change yet. Caveat: the server learns that a call is automatic from the browser (trigger: automatic). Legal review of 06.11.2026 (N1/B2, 17d): Terms 5.4 now says some model-supported steps start without a click, privacy section 3 names them, and one switch in Settings turns them all off; privacy section 3 names that one switch beside the per-step switches; C14's switch is \"All automatic AI steps\" and its sentence on Transformation and Documentation is gone. On this branch the code does not say that yet: Settings has per-stage switches only, no single switch (components/ModelStagesCard.tsx); C14's switch writes naming and statements (AUTO_STEPS_SWITCH_STAGES); Transformation and Documentation still start by themselves on opening on the platform key (askModeOf, lib/auto-steps.ts). A parallel 3.0.21 package makes both tools button-only for every key and adds the one switch; confirm after that merge. Also open: Terms 5.4 says the Platform then calls no model for the account, while the assistant (components/GlossaryChatbot.tsx) has no switch and still calls the model when asked a question. — Superseded: merged on dev 06.11.2026 and checked again the same day, call site by call site. The one main switch \"All automatic AI steps\" (users/{uid}.autoModelSteps, Admin SDK only via POST /api/model-stages; components/ModelStagesCard.tsx) is refused on the server before any key is loaded for every call marked automatic or start and for the assistant (app/api/gemini/route.ts:487-489). Automatic callers: plain wording (hooks/usePlainWording.ts:85), business names (lib/process-naming-client.ts; paused anyway), the first-run narrative (lib/start-narrative.ts:59, trigger start; the start buttons say whether the model is called). Every other model call is a click: Transformation (startGeneration, only from buttons), Documentation (generateBusinessDocumentation; statements via onRequest), Design (regenerate -> generateDesign(..., 'asked')), Testing (handleGenerate), Analyze and the list report's Run, functional-requirement wording. The assistant shows itself off with the switch off (components/GlossaryChatbot.tsx:643). An own key's Automatic steps stay on top. Remaining caveat: the server learns that a call is automatic from the browser's mark. Owner confirmed B6 on 06.11.2026.",
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
    "Built for 3.0.21 on 23.10.2026, per-element marking completed on 05.11.2026 after the legal review of 05.11.2026 (T08 \"including mixed artefacts\"); not yet confirmed: T08 by the owner still open (checklist: docs/OPERATIONS.md, 'Acceptance T08'). Holds: header comment and metadata field (lib/ai-marking.ts). Per-element origin, four spellings (lib/ai-marking.ts:218-340; one reader aiOriginMarksIn :320): Markdown cc:origin comment pair, HTML data-origin/data-ai-provider/data-ai-model, BPMN <cc:origin/> in extensionElements, Word a content control (w:sdt) titled 'AI-generated (provider model)', tagged cc:origin=ai;ai_provider=...;ai_model=..., locked against deletion (aiOriginDocxTag :296; written by lib/requirements-export.ts:257-269, the repository's only docx writer, hand-written WordprocessingML zipped with JSZip). Per format: BPMN (lib/bpmn/export.ts:81, 216, 399-416; no download writes model names today, aiNames stays an owner decision); analysis report HTML (lib/analysis-export.ts:72, 229 ff.); documentation page HTML - glance proposal, SOP cells, model RACI and now every naming-stage business name in the step table, step summary and step heading, plus the naming statement in the header (lib/documentation-export.ts:203, 360); process description Markdown, Word and HTML - the same blocks, now with the business names (lib/process-document-outline.ts:260, 657, 868); functional requirements Markdown/HTML/Word - the worded statement and its overview cell (lib/requirements-export.ts wordingAi, overviewCellAi; components/design/FunctionalRequirements.tsx passes the recorded writer); NFR and specification exports - the proposal cell, the worded statements (cellAi, proposalsAi); requirements specification Markdown/Word/Confluence - only the proposal after an open decision's answer (lib/requirements-spec-export.ts:251); process-documentation.md - every business name and lane (lib/process-documentation.ts:413-419; the SOP prompt reads it without marks, lib/business-sop-prompt.ts); business-documentation.md - every SOP sentence (its basis outside), exception, the RACI and old control rows (lib/business-sop-markdown.ts:97); Excel test cases - Origin/AI provider/AI model columns per row (testCaseOrigin, lib/ai-authorship.ts:181; app/(app)/project/[projectId]/testing/page.tsx). File level newly added: dashboard deliverable downloads (dashboardDeliverableAuthorship, lib/ai-authorship.ts:152; app/(app)/dashboard/page.tsx) and the Delivery stage's business-documentation download had no header before. Delivery package: the engine's process documentation with naming-stage names is co-written ('documentation', header not recorded; lib/delivery-package.ts:2106, 2121); manifest version 2 unchanged. 06.11.2026 (found in a real package built from dev 8060afd3): docs/decision.md showed the design's comparison ('Design's comparison (proposal)' in 'The weighing') without any mark - now each comparison cell sits in a cc:origin pair with the design's authorship (not-recorded; lib/delivery-package.ts buildDecisionRecord, decisionDesignAuthorship), the file carries the design's header comment and manifest.json names it with \"ai\": \"design\" (markModelWrittenFiles, designInDecisionRecord); a decision record without a comparison stays unmarked. The process documentation's provenance legends ('Business names and lanes are AI-generated', the main path's and the disclaimer's naming sentence, the package manifest note) appear only when the file shows a naming-stage name or lane (processDocumentationShowsNames, lib/process-documentation.ts) - with the naming paused none does. Offline verifier: scripts/verify-pack.mjs --package (originMarksIn :575, element lines, fails a file with element marks no statement names :726) and lib/delivery-package-verify.ts (elements, unstatedElements :77, 249) list per file how many elements which provider and model wrote; /verify-pack shows the list (app/(app)/verify-pack/page.tsx:403). Audit-pack and signed-run formats unchanged. Tests: tests/ai-origin-marking-3021.spec.ts, tests/ai-origin-elements-t08.spec.ts (every format read back, Word unzipped). 'not-recorded' stands where the call is not recorded per project (design proposals, naming, decision proposals). Missing / known limits: (1) BPMN downloads carry no model names (owner decision); (2) the process description's 'Main path:' sentence and the choice lists name steps by business name without a per-name mark; (3) project JSON exports (dashboard and workspace list '_export.json', the transformation draft) are raw records without a marking field; the dashboard's test list stored as JSON has no header; (4) the delivery package is not signed: the verifier proves it matches its manifest and names the signed run and source, the model of the code, test and document files is the package's own statement. The trust page's \"future MCP answers\" is the owner-approved wording and was left as it is; it may list only formats the owner's T08 passed.",
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
    "Built in 3.0.21 (23.10.2026), holds: MODEL_PROVIDERS_SUSPENDED (lib/model-providers.ts) is checked before every provider contact without fallback, the key stays stored; the step, the key routes and Settings now show C11 with date and reason from MODEL_PROVIDERS_SUSPENDED_AT and MODEL_PROVIDERS_SUSPENDED_REASON (providerSuspendedNotice, lib/provider-suspension.ts:48; app/api/gemini/route.ts:570, app/api/secrets/gemini/route.ts, app/api/secrets/gemini/test/route.ts, app/api/model-stages/route.ts:114 -> Settings), documented in docs/OPERATIONS.md. Tests: tests/legal-gaps-3021.spec.ts (T01), tests/byok-3021.spec.ts. Setting the three variables is the operator's step.",
    true,
  ),
  check(
    'proofLog',
    'Nachweisprotokoll mit Löschdatum und nächtlicher Löschung (Abnahme T05/T06)',
    'proof log with deletion dates and nightly purge (acceptance tests T05/T06)',
    'Sind Nachweisprotokoll (getrennt, append-only, HMAC statt Adresse nach Kontolöschung), Löschdatum je Eintrag, nächtliche Löschung, die Lösch-Tests (auch für das Nachweisprotokoll) und docs/DATA-RETENTION.md gebaut und abgenommen? Erst dann dürfen DSE 5, Terms 1.3, der Löschdialog C7 und der Satz der Trust-Seite zum automatisierten Löschtest so stehen.',
    'Are the proof log (separate, append-only, HMAC instead of the address after erasure), the per-entry deletion date, the nightly purge, the deletion tests (including the proof log) and docs/DATA-RETENTION.md built and accepted? Only then may privacy section 5, Terms 1.3, the deletion dialog C7 and the trust page sentence on the automated deletion test stand as written.',
    'DSE 5; Terms 1.3; C7; Trust (Your rights)',
    "Built in 3.0.21 (23.10.2026), partial. Holds: every proof record carries retention and expiresAt (lib/consent.ts:144, byokAgreementEventWrite in lib/firebase-admin.ts, lib/email-events.ts); on erasure the records stay with HMAC-SHA256 under PSEUDONYM_PEPPER in place of uid and address, the end of the contract and the deletion date 31 December of the third year after, plus the contract-end record and the three-year deletion note (lib/proof-log-erasure.ts, called at lib/firebase-admin.ts:1163); delivery records pseudonymised until their 90 days; since 05.11.2026 every project and portfolio invitation mail gets its own delivery record in invitation_delivery_records (lib/invitation-delivery-record.ts; written at app/api/projects/[projectId]/invitations/route.ts:408 and app/api/portfolio/selections/[selectionId]/invitations/route.ts:99 through lib/transactional-mail.ts:120, status from the Resend webhook via lib/email-events.ts:113): keyed hash of the address, inviting account, time, provider message id, delivery status, no address, expiresAt six calendar months after sending; on the inviter's erasure the inviter becomes the keyed hash (lib/proof-log-erasure.ts:139); tests/invitation-delivery-record.spec.ts (server-free); community-mail opt-outs kept as the keyed hash only; deletion tests in tests/proof-log-3021.spec.ts (server-free) and tests/account-erasure.spec.ts, tests/hardening-v220-cf.spec.ts (emulator). Missing: (1) the nightly purge is Firestore TTL on expiresAt, and the five policies (consent_events, byok_agreement_events, erasure_notes, email_events, invitation_delivery_records) must be created by the owner (docs/DATA-RETENTION.md, 'The proof log'; npm run retention:verify checks them); (2) the repository secret PSEUDONYM_PEPPER must be set (without it an erasure deletes the records instead, and no invitation delivery record is written while the invitation still goes out); (3) since 06.11.2026 every email_events record holds the address and the subject only as keyed hashes (lib/email-event-hashing.ts); records written before — invitation mails before 05.11.2026 among them — hold both in clear until the owner runs scripts/hash-email-events.ts (dry run, then --apply), and run out after their 90 days either way; the invitation opt-out list exists since 23.10.2026 (invitation_suppressions, lib/invitation-suppression.ts, checked by both invitation routes); (4) older email_events without expiresAt need a backfill.",
  ),
  check(
    'retentionRegister',
    'Register docs/DATA-RETENTION.md ergänzt',
    'register docs/DATA-RETENTION.md extended',
    'Ist docs/DATA-RETENTION.md um Nachweisprotokoll, Löschvermerk, Sperrlisten und Zustellnachweise ergänzt?',
    'Has docs/DATA-RETENTION.md been extended with the proof log, the deletion note, the suppression lists and the delivery records?',
    'DSE 6',
    "Done in 3.0.21 (23.10.2026): docs/DATA-RETENTION.md lists byok_agreement_events, erasure_notes (deletion note), the proof-log consent_events, the delivery records (90 days, pseudonymised after erasure) and the opt-out list (keyed hash, without end), with a section 'The proof log'; it lists the invitation opt-out list (invitation_suppressions, 23.10.2026) and, since 05.11.2026, the invitation delivery records (invitation_delivery_records, six months, keyed hash only); it states plainly that the TTL policies are not yet in place.",
    true,
  ),
  check(
    'noRequestWithoutSignIn',
    'Keine Anfrage an Dritte ohne Anmeldung (Netzwerkmitschnitt)',
    'no third-party request without sign-in (network capture)',
    'Bestätigt ein Netzwerkmitschnitt ohne Anmeldung, dass keine Seite einen Google-Endpunkt (oder sonst jemanden außer clean-core.io) anfragt? Der Prüfbericht warnt: das Firebase-SDK spricht Google-Endpunkte oft schon beim Laden an — dann stimmt der Satz in Abschnitt 7 nicht.',
    'Does a network capture without sign-in confirm that no page requests a Google endpoint (or anyone other than clean-core.io)? The review warns that the Firebase SDK often calls Google endpoints on load — then the sentence in section 7 is wrong.',
    'DSE 7',
    "Product work done 23.10.2026 (3.0.21) for the landing and every public page outside the signed-in shell; the network capture is still open, so not confirmed. Why it mattered (read in @firebase/auth 1.13.3): initialising Auth loads Google's gapi script and the firebaseapp.com frame at once on mobile browsers and Safari (_shouldInitProactively), and with a persisted account reloads it from identitytoolkit.googleapis.com; signed out on desktop it sends nothing. Now: the public header and calls to action load the SDK only when the first-party signed-in hint is set and otherwise report signed out without loading it (lib/auth-subscribe.ts:83-86); the hint is kept in step with Firebase by the one Auth instance (lib/firebase-app.ts:50, lib/auth-hint.ts:64). The landing mounts its dialogs only for ?auth=/?legal= or a pending redirect, no longer when idle (components/landing/LandingModalsLazy.tsx:33-38); Auth is initialised only once the access dialog is open (components/LandingModals.tsx:312, so a ?legal= dialog does not), and getRedirectResult runs only behind the sessionStorage mark (components/LandingModals.tsx:340-363; markRedirectPending, lib/auth-hint.ts:78 - nothing calls signInWithRedirect today, the Google button is a popup). Opening the sign-in dialog does contact Google on phones and Safari, by design (the popup needs the frame ready): if section 7 means 'before sign-in' literally, the owner decides whether to word it 'until you open the sign-in dialog'. Product work done 05.11.2026 for the public pages inside the signed-in shell (app/(app)/layout.tsx: About, Knowledge, Trust, How it works, How-to, First run, Clean Core explained/score, ABAP custom code analysis, SAP cloudification, object classification, tenant security, the demo stages and verify-pack): every page of the shell is classified public or signed-in in lib/shell-routes.ts, and on a public one the shell starts Auth only when the same signed-in hint is set or this page has started Auth already (hooks/useAuthWanted.ts) - the shell's account controls (app/(app)/layout.tsx), the profile (hooks/useUserProfile.ts) and the sign-up card (components/UserOnboarding.tsx) read that gate; the assistant, the Terms gate's render and the demo workspace's lookups read the user through getAuthIfStarted() (lib/firebase-app.ts), which starts nothing. A stale hint costs one Auth start that removes it, as on the landing. /demo/workspace needs an account: without the hint it sends the visitor to the sign-in dialog without starting Auth on the way, and the dialog then does (the same by-design request as above). Pages that need an account (dashboard, projects, settings, admin, invitations, portfolio) still start Auth on every load, so opening one of their addresses signed out contacts Google on phones and Safari before it sends the visitor to sign in. Source guard: tests/public-no-google-before-signin-guard.spec.ts (classifies every page of the shell from the files; every Auth or Firestore call a public page can reach is reviewed); the capture is tests/public-no-third-party-requests.spec.ts (rendered, desktop and iPhone, every public page including the shell's, a stale hint, the demo workspace), which the merge or the owner must run before this can be confirmed. Fonts are local, no analytics, no App Check, no external images, scripts or embeds on these pages; the CSP still permits fonts.googleapis.com/fonts.gstatic.com and Google's sign-in hosts, which permits but loads nothing.",
  ),
  check(
    'emergencyAccessLogging',
    'Protokollierung des Notfallzugriffs',
    'logging of emergency access',
    'Wird ein Notfallzugriff des Betreibers auf ein Projekt oder ein hinterlegtes Geheimnis protokolliert, und sagen Sie zu, Schlüssel und S/4HANA-Passwörter nur als solche protokollierte Notfallhandlung zu entschlüsseln?',
    'Is an emergency access by the operator to a project or a stored secret logged, and do you commit to decrypting keys and S/4HANA passwords only as such a logged emergency act?',
    'DSE 8 (zweimal); ZV 10',
    "Verified against dev on 23.10.2026: partial (operator step). No application path lets the operator open a project or decrypt a secret (firestore.rules:352-370; every loadS4ConfigForUser / loadOwnModelKey caller uses its own uid). But no emergency-access tool or audit write exists: the logging has to come from GCP Data Access audit logs for Firestore and the keys plus a runbook, which the owner sets up. Done 06.11.2026: the runbook is docs/EMERGENCY-ACCESS.md (emergency record in audit_events, procedure, what is never done); the owner enabled Data Access audit logs in cleancore-491216 for datastore.googleapis.com (DATA_READ, DATA_WRITE), cloudkms.googleapis.com and secretmanager.googleapis.com (DATA_READ), with only the app's service account clean-core-run exempted — checked with gcloud projects get-iam-policy (auditConfigs) the same day.",
    true,
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
    'Bleibt der eigene Anthropic-Schlüssel (ANTHROPIC_OWN_KEY_OFFERED) abgeschaltet, bis die geänderten Nutzungsbedingungen wirksam sind und T01, T03 und T08 abgenommen sind — und wird beim Einschalten der Statussatz in DSE 2, Ziffer 5.2 und auf der Trust-Seite ersetzt?',
    'Does the own Anthropic key (ANTHROPIC_OWN_KEY_OFFERED) stay switched off until the amended Terms are in effect and T01, T03 and T08 have passed — and is the status sentence in DSE 2, section 5.2 and on the Trust page replaced when it is switched on?',
    'DSE 2; Terms 5.2',
    "06.11.2026 (owner decision: Claude BYOK ships in 3.0.21 switched off, enabled later): ANTHROPIC_OWN_KEY_OFFERED in lib/model-providers.ts is now false and is the one switch - Settings shows Anthropic as not selectable with the status sentence (components/settings/OwnKeyProviderChoice.tsx), the save and test routes refuse an Anthropic key (app/api/secrets/gemini/route.ts, app/api/secrets/gemini/test/route.ts, code byok-provider-not-enabled), and the proxy refuses a call on an Anthropic key stored before, without falling back (app/api/gemini/route.ts, ownKeyCallRefusal). DSE 2, Terms 5.2 and the Trust page carry the status sentence. Turning it on: set the constant to true, and in the same change replace the status sentence in those three texts (a new Terms version if v2.3.0 is published by then); before that, TERMS_EFFECTIVE_DATE_ISO must have passed and T01 (providerSwitchOff), T03 (t03AdditionalAgreementAcceptance) and T08 (aiMarkingManifest) must be confirmed. Tests: tests/byok-claude.spec.ts (both positions, server-free), tests/byok-claude-routes.spec.ts (emulator; the switched-on proxy paths skip while off).",
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
    'Meldeverfahren: Eingang, Prüfung, Entscheidung (Abnahme T07)',
    'reporting procedure: receipt, examination, decision (acceptance test T07)',
    'Ist der Ablauf für Meldungen rechtswidriger Inhalte eingerichtet, wie Ziffer 7 ihn in Fassung 1.1 zusagt: Eingangsbestätigung, wo eine Kontaktadresse angegeben ist; zeitnahe Prüfung durch einen Menschen; Mitteilung der Entscheidung und ihrer Gründe an Meldenden und betroffenes Konto, soweit Strafverfolgungsbehörden nicht um Zurückhaltung bitten; bei Verdacht einer Straftat Sperrung, Information der Strafverfolgungsbehörden und Aufbewahrung des unveränderten, für niemanden zugänglichen Inhalts bis zu deren Entscheidung, längstens 90 Tage nach der Unterrichtung, danach Löschung — bei Darstellungen sexuellen Missbrauchs von Kindern ohne Ansehen und ohne Kopie?',
    'Is the procedure for reports of illegal content in place as section 7 promises it in Fassung 1.1: acknowledgement where a contact address is given; prompt examination by a person; the decision and its reasons told to the reporting person and the account concerned unless law-enforcement authorities ask for restraint; where a criminal offence is suspected, blocking, informing the authorities and keeping the content unchanged and accessible to no one until they decide, at most 90 days after they were informed, then deletion — for depictions of child sexual abuse without viewing and without a copy?',
    'Terms 7; /report; DSE 2, 6, 8',
    "Built 06.11.2026 (legal texts Fassung 1.1), partial. Product: the admin console blocks a project (components/admin/ContentHoldPanel.tsx -> app/api/admin/content-holds/route.ts, admin claim + step-up, audit row per action) by moving every document of it unchanged into content_holds/{holdId}/held_documents and removing the original (lib/content-hold.ts blockProjectContent) - no rule names content_holds, so no browser reads it, the owner's dashboard, workspace, delete route, invited readers and portfolio overviews find no project; the dashboard tells the account by project id (components/ContentBlockNotice.tsx, profile field contentBlocks). The evidence log on the hold record dates the block, the police notice, the authority's decision, an extension, the release and the deletion; deletion is refused before the police notice and before the decision or day 90; content with suspected offence is never released. No route returns held documents (tests/content-hold-3021.spec.ts). Owner's process, not code: receipt, the examination, the notice of the decision, the report to the authorities; the TTL policy on content_holds.expiresAt (six months after release/deletion) is the owner's to create; deletion at day 90 is a console action the console flags as due, not automatic. Only a whole project can be blocked; a portfolio overview loses a blocked project because it is no longer there.",
  ),
  check(
    't04WithdrawalFunction',
    'Freiwillige Funktion „Vertrag widerrufen / beenden“ mit Eingangsbestätigung (Abnahme T04)',
    'voluntary function "Withdraw from / end the contract" with its receipt (acceptance test T04)',
    'Ist die Funktion „Vertrag widerrufen / beenden“ gebaut und auf dev abgenommen: der Eintrag in den Einstellungen und in der Fußzeile (angemeldet), der zu einem eigenen Widerrufsformular mit Name, Konto-Adresse, Vertrag und der Schaltfläche „Widerruf bestätigen“ führt, und die Eingangsbestätigung per E-Mail nach der Erklärung und vor der Löschung?',
    'Is the function "Withdraw from / end the contract" built and accepted on dev: the entry in Settings and in the footer (signed in) leading to a withdrawal form of its own with name, account address, contract and the button "Confirm withdrawal", and the receipt by e-mail after the declaration and before the deletion?',
    'Terms 13; C13',
    'Built in 3.0.21 (23.10.2026); its own path since A6 of 3.0.21 (06.11.2026, legal texts Fassung 1.1). Label, anchor, footer highlight and button label: lib/contract-withdrawal.ts. Settings (app/(app)/settings/page.tsx): a card of its own whose button opens a withdrawal form - not the deletion confirmation - showing the declaration, the name, the account e-mail and the contract ("Vertrag über die Nutzung von Clean-Core.io" / "Contract for the use of Clean-Core.io"), with the binding button "Confirm withdrawal · Widerruf bestätigen". The signed-in footer links (app/(app)/layout.tsx) are bold and in full ink. The form posts to app/api/account/withdraw/route.ts, which (lib/withdrawal-declaration.ts) records the declaration in the proof log (consent_events, kind withdrawal-declared), sends the receipt at once (declaration, name, contract, time of receipt; lib/withdrawal-receipt-mail.ts), records that it was sent and when (kind withdrawal-receipt), and only then deletes the account (ending withdrawal-function); a receipt that does not go out stops the path before the deletion. The generic deletion (app/api/account/delete/route.ts) sends no receipt any more. Privacy sections 5 and 6 name both records. Held by tests/contract-withdrawal-3021.spec.ts. The owner confirms after testing it on dev. 06.11.2026: the notice of the Terms amendment names this function in its withdrawal point (legal statement 17e, M2: "dafür gibt es die Funktion ‚Vertrag widerrufen / beenden‘ in den Einstellungen"); a parallel 3.0.21 package changes how a received declaration is processed (the withdrawal queue), so the path above is to be re-checked after that merge.',
  ),
  check(
    'identityPlatformEnabled',
    'Firebase Authentication mit Google Identity Platform (E07)',
    'Firebase Authentication with Google Identity Platform (E07)',
    'Läuft Firebase Authentication des Produktionsprojekts mit aktivierter Google Identity Platform, sodass das Cloud Data Processing Addendum für sie gilt (E07)?',
    'Does Firebase Authentication of the production project run with Google Identity Platform enabled, so that the Cloud Data Processing Addendum applies to it (E07)?',
    'DSE 4 (Firebase Authentication)',
    'Owner confirmation 23.10.2026: Identity Platform is enabled on the production project — TOTP multi-factor sign-in runs through it, which plain Firebase Authentication does not offer.',
    true,
  ),
  check(
    'noFirebaseOutsideGoogleCloud',
    'Kein Firebase-Dienst außerhalb von Google Cloud',
    'no Firebase service outside Google Cloud',
    'Bestätigen Sie, dass die Plattform keinen Firebase-Dienst außerhalb von Google Cloud nutzt (kein Firebase Hosting, Cloud Messaging, Analytics, App Check, Remote Config, Storage, Functions, Realtime Database), sodass für alle genutzten Dienste einheitlich das Cloud Data Processing Addendum gilt? Bitte dabei die Anmerkung zu firebaseapp.com und zu den beiden von Firebase Authentication selbst versandten Mails lesen.',
    'Confirm that the Platform uses no Firebase service outside Google Cloud (no Firebase Hosting, Cloud Messaging, Analytics, App Check, Remote Config, Storage, Functions, Realtime Database), so that the Cloud Data Processing Addendum applies uniformly to every service used? Please read the note on firebaseapp.com and on the two mails Firebase Authentication sends itself.',
    'DSE 4 (Auftragsverarbeiter); Trust (Processors)',
    "Code search on dev (683ee9ac), 05.11.2026, after the legal review of that day: holds for the code. The browser imports only firebase/app, firebase/auth and firebase/firestore, the server only firebase-admin/app, firebase-admin/auth and firebase-admin/firestore (app/, lib/, components/, hooks/, scripts/, middleware.ts); no getAnalytics, getMessaging, initializeAppCheck, getRemoteConfig, getStorage, getFunctions, getPerformance, getDatabase or firebase/ai anywhere. firebase.json holds Firestore rules and the emulators only — no hosting, functions or storage target; the app runs on Cloud Run. Three points for the owner: (1) firebase-config.json still carries storageBucket and messagingSenderId — inert configuration fields, no service is initialised with them; (2) the Google sign-in popup and the Auth helper frame are served from the authDomain cleancore-491216.firebaseapp.com (firebase-config.json; lib/csp-report-only.ts:58) - pages Firebase Authentication serves on its reserved path, no deployed Hosting site; whether that is Firebase Hosting in the contractual sense is for the owner to confirm; (3) the client SDK's sendEmailVerification (app/(app)/settings/page.tsx:513) and sendPasswordResetEmail (components/LandingModals.tsx:592) make Firebase Authentication send those two mails itself, not Resend - part of Firebase Authentication / Identity Platform, but privacy section 2 lists 'confirming an address' among the Resend mails.",
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
