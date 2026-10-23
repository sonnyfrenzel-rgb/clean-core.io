import { createHash } from 'crypto';
import { APP_BASE_URL, TERMS_VERSION } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import { escapeHtml } from '@/lib/utils';
import { CONSENT_TEXTS, consentText } from '@/lib/legal/consent-texts';
import { formatLegalDate, type LegalLang } from '@/lib/legal/open-values';
import { TERMS_LABEL, legalDocumentBlocks } from '@/lib/legal/documents';
import { toArchiveMarkdown } from '@/lib/legal/markup';
import { archivedTermsSha256For } from '@/lib/terms-versions';
import { byokAddendumSha256 } from '@/lib/byok-addendum';

/**
 * The contract confirmation mail — C5 of the legal texts, Fassung 1.1
 * (Terms 1.3 and 10.2, Additional Agreement clause 12; acceptance test T03).
 *
 * One template for the three occasions the texts name: after sign-up, after
 * accepting an amendment of the Terms, and after accepting the Additional
 * Agreement with an Anthropic key. It names the version, the language version,
 * the time, the SHA-256 of the wording and the place of acceptance, and it
 * carries **the full wording** — the archived text whose digest the record
 * holds, character for character (`tests/legal-gaps-3021.spec.ts` takes the
 * wording back out of the HTML and hashes it), plus one link to where that
 * version stays published.
 *
 * The mail speaks the language version accepted: a German acceptance gets the
 * German C5 text and the German wording. Best effort and no resend (legal
 * review E14/E25): the record in the proof log is the evidence, the mail the
 * account's copy of it.
 *
 * Pure (no database, no send): `acceptedWording` renders the wording the way the
 * archive is written, and the sender is `lib/contract-confirmation-mail.ts`.
 */

export type ConfirmationOccasion = 'sign-up' | 'amendment' | 'byok-addendum';

export interface ContractConfirmationInput {
  occasion: ConfirmationOccasion;
  language: LegalLang;
  /** The address the mail goes to, raw — escaped here. */
  recipient: string;
  /** The first name on the profile, raw, or null. */
  firstName: string | null;
  /** The version identifier the record names: "2026-10-23" for the Terms, "ZV-BYOK-1.0" for the agreement. */
  versionId: string;
  /** What the document calls itself, e.g. "Terms v2.3.0"; the agreement's id again. */
  versionLabel: string;
  /** SHA-256 of the archived wording of that language version. */
  sha256: string;
  /** The archived wording itself (LF line endings), as hashed. */
  wording: string;
  /** ISO time of the acceptance as the server recorded it. */
  acceptedAt: string;
}

type Bi = { de: string; en: string };

const DOCUMENT: Record<'terms' | 'addendum', Bi> = {
  terms: { de: 'Nutzungsbedingungen und Community-Richtlinien', en: 'Terms of Service and Community Guidelines' },
  addendum: { de: 'Zusatzvereinbarung zu eigenen Modellschlüsseln', en: 'Additional Agreement on Own Model Keys' },
};

const PLACE: Record<ConfirmationOccasion, Bi> = {
  'sign-up': { de: 'Registrierungsdialog auf clean-core.io', en: 'sign-up dialog on clean-core.io' },
  amendment: { de: 'Änderungsdialog nach der Anmeldung auf clean-core.io', en: 'amendment dialog after sign-in on clean-core.io' },
  'byok-addendum': { de: 'Einstellungen auf clean-core.io, eigener Anthropic-Schlüssel', en: 'Settings on clean-core.io, own Anthropic key' },
};

const BASIS: Record<ConfirmationOccasion, Bi> = {
  'sign-up': { de: 'Ziffer 1.3 der Nutzungsbedingungen', en: 'section 1.3 of the Terms of Service' },
  amendment: { de: 'Ziffer 10.2 in Verbindung mit Ziffer 1.3 der Nutzungsbedingungen', en: 'section 10.2 together with section 1.3 of the Terms of Service' },
  'byok-addendum': { de: 'Ziffer 12 der Zusatzvereinbarung', en: 'clause 12 of the Additional Agreement' },
};

const LINK_LEAD: Bi = {
  de: 'Diese Fassung bleibt mit ihrem Hashwert veröffentlicht unter:',
  en: 'This version stays published with its digest at:',
};

const WORDING_MARK: Bi = { de: '— Vollständiger Wortlaut —', en: '— Full wording —' };

function isAddendum(occasion: ConfirmationOccasion): boolean {
  return occasion === 'byok-addendum';
}

/** Where the accepted version stays published (without the scheme, as the texts write it). */
export function publishedWordingPath(occasion: ConfirmationOccasion, versionId: string, language: LegalLang): string {
  if (isAddendum(occasion)) return language === 'de' ? '/terms/byok-addendum/de' : '/terms/byok-addendum';
  return `/terms/versions/${versionId}${language === 'de' ? '/de' : ''}`;
}

export function contractConfirmationSubject(input: Pick<ContractConfirmationInput, 'occasion' | 'language' | 'versionLabel'>): string {
  const doc = DOCUMENT[isAddendum(input.occasion) ? 'addendum' : 'terms'][input.language];
  return consentText(CONSENT_TEXTS.confirmationMail.subject, input.language).replace('{Dokument}', `${doc} ${input.versionLabel}`);
}

function timeOf(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`not an ISO time: ${iso}`);
  const isoDate = d.toISOString().slice(0, 10);
  return { date: isoDate, time: d.toISOString().slice(11, 16) };
}

/**
 * The wording as mail paragraphs: one paragraph per blank-line-separated chunk
 * of the archived file, its lines joined with `<br>`, every character escaped
 * and nothing dropped — so taking the text back out of the HTML gives the file.
 */
export function wordingParagraphs(wording: string): string[] {
  const body = wording.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return body.split('\n\n').map((chunk) => `<span style="overflow-wrap: anywhere;">${chunk.split('\n').map(escapeHtml).join('<br>')}</span>`);
}

/** The inverse of `wordingParagraphs`, for the spec: the wording back out of the mail. */
export function wordingFromParagraphs(paragraphs: string[]): string {
  const unescape = (s: string) =>
    s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  return `${paragraphs
    .map((p) => p.replace(/^<span style="overflow-wrap: anywhere;">/, '').replace(/<\/span>$/, ''))
    .map((p) => p.split('<br>').map(unescape).join('\n'))
    .join('\n\n')}\n`;
}

export function buildContractConfirmationMail(input: ContractConfirmationInput): { subject: string; html: string } {
  const lang = input.language;
  const addendum = isAddendum(input.occasion);
  const doc = DOCUMENT[addendum ? 'addendum' : 'terms'][lang];
  const subjectMatter =
    lang === 'de'
      ? `die ${doc} von Clean-Core.io (Fassung ${input.versionLabel})`
      : `the Clean-Core.io ${doc} (version ${input.versionLabel})`;
  const { date, time } = timeOf(input.acceptedAt);
  const path = publishedWordingPath(input.occasion, input.versionId, lang);
  const version = addendum ? input.versionId : `${input.versionLabel} (${lang === 'de' ? 'Kennung' : 'identifier'} ${input.versionId})`;

  const filled = consentText(CONSENT_TEXTS.confirmationMail.body, lang)
    // The draft's article choice: both documents take "die" in German.
    .replace('den/die', 'die')
    .replace('{Vorname}', input.firstName ? input.firstName : '')
    .replace('{Gegenstand}', subjectMatter)
    .replace('{Datum}', formatLegalDate(date, lang))
    .replace('{Uhrzeit}', time)
    .replace('{Fassung}', version)
    .replace('{Hash}', input.sha256)
    .replace('{E-Mail}', input.recipient)
    .replace('{Stelle}', PLACE[input.occasion][lang])
    .replace('{Adresse}', `clean-core.io${path}`)
    .replace('{Grundlage}', BASIS[input.occasion][lang]);

  const mark = WORDING_MARK[lang];
  const at = filled.indexOf(mark);
  if (at < 0) throw new Error('C5: the wording marker is missing');
  const head = filled.slice(0, at).trim().split('\n\n');
  const greetingLine = head.shift() ?? '';
  // "Hallo ," when there is no name on the profile reads as a slip.
  const greeting = escapeHtml(greetingLine.replace(/ ,$/, ','));
  // A digest or an address is one unbreakable word; it wraps on a 320px screen.
  const paragraphs = head.map((p) => `<span style="overflow-wrap: anywhere;">${p.split('\n').map(escapeHtml).join('<br>')}</span>`);

  const html = buildUserMail({
    greeting,
    paragraphs: [...paragraphs, `<strong>${escapeHtml(mark)}</strong>`, ...wordingParagraphs(input.wording)],
    link: { lead: LINK_LEAD[lang], url: `${APP_BASE_URL}${path}` },
    signature: 'Felix',
    footer: [
      lang === 'de'
        ? `Gesendet an ${escapeHtml(input.recipient)}, weil dieses Konto auf Clean-Core.io ${escapeHtml(subjectMatter)} angenommen hat.`
        : `Sent to ${escapeHtml(input.recipient)} because this account accepted ${escapeHtml(subjectMatter)} on Clean-Core.io.`,
    ],
  });
  return { subject: contractConfirmationSubject(input), html };
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

/** The wording and digest of what an occasion accepted, or null when it is not archived. */
export function acceptedWording(
  occasion: ConfirmationOccasion,
  language: LegalLang,
  addendumVersion?: string,
): { versionId: string; versionLabel: string; wording: string; sha256: string } | null {
  if (occasion === 'byok-addendum') {
    if (!addendumVersion) return null;
    const digest = byokAddendumSha256(addendumVersion, language);
    const wording = toArchiveMarkdown(legalDocumentBlocks('byok-addendum', language));
    if (!digest || sha256(wording) !== digest) return null;
    return { versionId: addendumVersion, versionLabel: addendumVersion, wording, sha256: digest };
  }
  const digest = archivedTermsSha256For(TERMS_VERSION, language);
  const wording = toArchiveMarkdown(legalDocumentBlocks('terms', language));
  if (!digest || sha256(wording) !== digest) return null;
  return { versionId: TERMS_VERSION, versionLabel: TERMS_LABEL, wording, sha256: digest };
}
