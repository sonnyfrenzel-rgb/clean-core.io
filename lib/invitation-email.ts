import { CONTACT_EMAIL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import {
  INVITATION_SCOPE_SENTENCE_RECIPIENT,
  INVITATION_LIMITS_SENTENCE_RECIPIENT,
  INVITATION_DEFAULT_DAYS,
  INVITATION_MAX_DAYS,
} from '@/lib/invitations';

/**
 * The two mails phase 5 sends.
 *
 * Both are built with the plain user-mail layout, `lib/user-mail.ts`
 * (roadmap 3.0.9): paragraphs, one link at the end shown as its URL, no
 * button — what reached the inbox in the seed run of 24.09.2026.
 *
 * Every interpolated value must be HTML-escaped by the caller — this module
 * puts them into markup unchanged.
 */

/* ------------------------------------------------------- the invitation mail */

export interface InvitationEmailInput {
  /**
   * HTML-escaped display name of the person who invited, already passed
   * through `inviterNameForMail` — or `''` to name nobody.
   */
  inviterName: string;
  /** HTML-escaped invited address; shown in the transactional footer. */
  recipient: string;
  /**
   * The unsubscribe link (C10; privacy policy section 8): using it puts the
   * address on the invitation suppression list (`lib/invitation-suppression.ts`).
   * Built by `invitationUnsubscribeUrl`; shown in the footer.
   */
  unsubscribeUrl?: string | null;
  /** Absolute URL of the invitation link. Built from `APP_BASE_URL`, never a Host header. */
  link: string;
  /** Human-readable expiry, e.g. "2 October 2026". */
  expires: string;
  /** The expiry as an ISO time, for the German date; without it the German part repeats `expires`. */
  expiresAt?: string;
  /**
   * Which language comes first (legal texts Fassung 1.1, C10/C12): German when
   * the inviting person uses the German interface, otherwise English. The
   * interface has no per-account language today, so every caller leaves the
   * default — German first.
   */
  firstLanguage?: MailLanguage;
}

export type MailLanguage = 'de' | 'en';

/**
 * Both invitation mails are bilingual (legal texts Fassung 1.1, C10/C12): the
 * invited person's language is unknown, so the whole mail — invitation, link
 * notice and the Art. 14 notice — stands in German and in English, one after
 * the other, around the one link the layout allows.
 */
export const INVITATION_EMAIL_SUBJECT =
  'Einladung zum Lesen eines Projekts auf Clean-Core.io · You have been invited to read a project on Clean-Core.io';

const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "2. Oktober 2026" for an ISO time (UTC), or the fallback when it is not one. */
export function germanMailDate(iso: string | undefined, fallback: string): string {
  const ms = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ms)) return fallback;
  const d = new Date(ms);
  return `${d.getUTCDate()}. ${MONTHS_DE[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The parts of a bilingual mail, in the order `first` asks for. */
export function inLanguageOrder<T>(first: MailLanguage, de: T[], en: T[]): T[] {
  return first === 'de' ? [...de, ...en] : [...en, ...de];
}

export const BILINGUAL_GREETING: Readonly<Record<MailLanguage, string>> = { de: 'Hallo,', en: 'Hello,' };
export const SECOND_LANGUAGE_HEADING: Readonly<Record<MailLanguage, string>> = {
  de: '<strong>Deutsche Fassung</strong>',
  en: '<strong>English version</strong>',
};
export const BILINGUAL_SIGNATURE = 'Viele Grüße, Ihr Clean-Core.io-Team<br>Regards,<br>The Clean-Core.io Team';

/** The body: the first language, a heading, the second. */
export function bilingualParagraphs(first: MailLanguage, de: string[], en: string[]): string[] {
  return first === 'de' ? [...de, SECOND_LANGUAGE_HEADING.en, ...en] : [...en, SECOND_LANGUAGE_HEADING.de, ...de];
}

/** The one link's lead, in both languages. */
export function bilingualLinkLead(first: MailLanguage): string {
  return first === 'de' ? 'Einladung öffnen &middot; Open the invitation:' : 'Open the invitation &middot; Einladung öffnen:';
}

/** The most characters of the inviter's profile name a mail repeats. */
export const INVITER_NAME_MAX_CHARS = 60;

/**
 * The inviter's profile name as the invitation mail may repeat it (SEC-02).
 *
 * The name is free text the inviting account typed into its own profile, and
 * the mail goes from clean-core.io to an address that account chose. So the
 * mail never puts it in the sender line or in bold — the first sentence is the
 * platform's own — and repeats it once, in plain text, labelled as unchecked:
 * whitespace collapsed, control characters removed, at most
 * `INVITER_NAME_MAX_CHARS` characters, and not at all when it carries
 * something a mail client would turn into a link (an address, a domain, a
 * URL). Returns raw text; the caller escapes it.
 */
export function inviterNameForMail(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let name = '';
  for (const ch of raw) {
    const c = ch.codePointAt(0) ?? 0;
    const control = c <= 0x1f || (c >= 0x7f && c <= 0x9f) || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
    name += control ? ' ' : ch;
  }
  name = name.replace(/\s+/g, ' ').trim();
  if (!name) return '';
  if (/@|:\/\/|www\.|[a-z0-9-]\.[a-z]{2,}/i.test(name)) return '';
  const chars = [...name];
  return chars.length > INVITER_NAME_MAX_CHARS ? `${chars.slice(0, INVITER_NAME_MAX_CHARS - 1).join('').trimEnd()}…` : name;
}

/**
 * The mail deliberately does **not** name the project.
 *
 * A project title routinely carries a customer name, a system id or a ticket
 * number, and the invited address is the one thing about this message we have
 * not verified yet — it is whatever the owner typed. A mail that names the
 * project therefore tells a typo'd recipient something the owner never meant to
 * tell them. The name appears on the invitation page, after the reader has
 * shown they hold the account with that confirmed address.
 *
 * **It carries the Art. 14 GDPR notice** (Sonny, 18.09.2026), and it is the only
 * mail that has to. The invited person's address reached us from the owner who
 * typed it, not from them, so Art. 14 applies in full: they are owed the
 * identity of the controller, what is held, why, on what basis, for how long,
 * where it came from, who else handles it, where it may travel, and their
 * rights — and this mail is the only channel we have to them. The confirmation
 * mail below is deliberately without it: it goes to somebody who already holds
 * an account and gave us that address themselves, which is Art. 13 and already
 * answered by the privacy policy they accepted.
 *
 * The notice sits last and small on purpose. What the reader came for is the
 * invitation; a legal panel above the link would bury it.
 */
export function buildInvitationEmail({ inviterName, recipient, link, expires, expiresAt, unsubscribeUrl, firstLanguage = 'de' }: InvitationEmailInput): string {
  const second: MailLanguage = firstLanguage === 'de' ? 'en' : 'de';
  const de = [
    // The platform's own sentence first and in bold; the inviter's name, if
    // any, after it in plain text and labelled as unchecked (SEC-02).
    '<strong>Sie wurden eingeladen, ein Projekt auf Clean-Core.io zu lesen.</strong>',
    ...(inviterName
      ? [`Die Einladung kommt von einem Clean-Core.io-Konto, dessen Inhaber den Namen ${inviterName} eingetragen hat. Clean-Core.io hat diesen Namen nicht geprüft.`]
      : []),
    INVITATION_SCOPE_SENTENCE_RECIPIENT_DE,
    INVITATION_LIMITS_SENTENCE_RECIPIENT_DE,
    `<strong>Der Link öffnet sich nur für Sie.</strong> Er öffnet sich für ein Clean-Core.io-Konto, das mit <strong>${recipient}</strong> angemeldet ist, und für kein anderes. Wer ihn weiterleitet, gibt niemandem etwas: Die Adresse des Kontos muss diese sein, und sie muss bestätigt sein. Haben Sie noch kein Konto, legen Sie eines mit dieser Adresse an &ndash; der Link bringt Sie danach hierher zurück.`,
    `Diese Einladung läuft am ${germanMailDate(expiresAt, expires)} ab.`,
  ];
  const en = [
    '<strong>You have been invited to read a project on Clean-Core.io.</strong>',
    ...(inviterName
      ? [`The invitation comes from a Clean-Core.io account whose holder entered the name ${inviterName}. Clean-Core.io has not checked that name.`]
      : []),
    INVITATION_SCOPE_SENTENCE_RECIPIENT,
    INVITATION_LIMITS_SENTENCE_RECIPIENT,
    `<strong>The link only opens for you.</strong> It opens for a Clean-Core.io account signed in with <strong>${recipient}</strong> and no other. Forwarding it gives nobody anything: the address on the account has to be this one, and it has to be confirmed. If you have no account yet, create one with this address &mdash; the link brings you back here afterwards.`,
    `This invitation expires on ${expires}.`,
  ];
  const afterDe = `Haben Sie das nicht erwartet? Dann ignorieren Sie die Mail &ndash; es geschieht nichts, solange Sie den Link nicht öffnen und sich anmelden. Fragen an ${CONTACT_EMAIL}; die Seite Trust &amp; Transparency auf clean-core.io erklärt, wie die Plattform mit Code umgeht.`;
  const afterEn = `Did you not expect this? Then ignore the mail &mdash; nothing happens until you open the link and sign in. Questions go to ${CONTACT_EMAIL}; the page Trust &amp; Transparency on clean-core.io explains how the platform handles code.`;
  const footerDe = [
    `<strong>Woher wir Ihre Adresse haben &ndash; Art. 14 DSGVO.</strong> ${ART14_NOTICE_DE}`,
    `Gesendet an ${recipient}, weil ein Clean-Core.io-Nutzer diese Adresse eingeladen hat, eines seiner Projekte zu lesen. Durch diese Mail haben Sie kein Konto bei uns, und wir haben keines angelegt.`,
    INVITATION_ONE_MAIL_SENTENCE_DE,
  ];
  const footerEn = [
    `<strong>How we got your address &mdash; Art. 14 GDPR.</strong> ${ART14_NOTICE}`,
    `Sent to ${recipient} because a Clean-Core.io user invited that address to read one of their projects. You do not have an account with us because of this mail, and we added none.`,
    INVITATION_ONE_MAIL_SENTENCE,
  ];
  return buildUserMail({
    greeting: `${BILINGUAL_GREETING[firstLanguage]} &middot; ${BILINGUAL_GREETING[second]}`,
    paragraphs: bilingualParagraphs(firstLanguage, de, en),
    link: { lead: bilingualLinkLead(firstLanguage), url: link },
    after: inLanguageOrder(firstLanguage, [afterDe], [afterEn]),
    signature: BILINGUAL_SIGNATURE,
    footer: inLanguageOrder(firstLanguage, footerDe, footerEn),
    unsubscribeUrl: unsubscribeUrl ?? null,
  });
}

/**
 * C10/C12: one mail per invitation and a way out. The unsubscribe link itself
 * is the footer line `buildUserMail` adds for `unsubscribeUrl`. The suppression
 * entry is kept as long as invitations are sent, or until the person asks for
 * it to be removed (legal texts Fassung 1.1).
 */
export const INVITATION_ONE_MAIL_SENTENCE =
  'You receive exactly this one e-mail; we send no reminder and no advertising. If you want no further invitations from Clean-Core.io, use the unsubscribe link below: we then keep only a keyed hash of this address on a suppression list, so that no invitation reaches it again, for as long as we send invitations or until you ask us to remove the entry (one line to info@clean-core.io).';

export const INVITATION_ONE_MAIL_SENTENCE_DE =
  'Sie erhalten genau diese eine E-Mail; wir senden keine Erinnerung und keine Werbung. Möchten Sie keine weiteren Einladungen von Clean-Core.io, nutzen Sie den Abmeldelink unten: Wir behalten dann nur einen schlüsselbasierten Hashwert dieser Adresse auf einer Sperrliste, damit keine Einladung sie mehr erreicht, solange wir Einladungen versenden oder bis Sie verlangen, dass wir den Eintrag entfernen (eine Zeile an info@clean-core.io).';

/** The two recipient sentences of `lib/invitations.ts`, in German. */
const INVITATION_SCOPE_SENTENCE_RECIPIENT_DE =
  'Sie können dieses Projekt vollständig lesen, einschließlich des ABAP-Quellcodes, der dafür hochgeladen wurde.';
const INVITATION_LIMITS_SENTENCE_RECIPIENT_DE =
  'Nur Lesen. Analysieren, Bestätigen, Signieren und Exportieren bleiben beim Eigentümer, und der Eigentümer kann Ihren Zugriff jederzeit entziehen.';

/**
 * The Art. 14 notice itself. No caller value is interpolated into it — the
 * guard in `tests/invitation-email-guard.spec.ts` builds the mail with hostile
 * input and compares this part byte for byte. The privacy policy is named, not
 * linked: the one link of a user mail is the invitation (`lib/user-mail.ts`).
 */
const ART14_NOTICE =
  'The person who invited you typed your address; you never gave it to us. We store it to send this one mail and to open that one project for this address and no other, and if you accept, we also store your account&rsquo;s id and the address on that account. Nobody sees any of it but the owner who invited you: our security rules let no browser read an invitation at all. Two processors handle it on our behalf: Resend, which delivers this mail, and Google Firebase, which hosts the database the invitation is stored in (Belgium, europe-west1). Both are US companies certified under the EU-U.S. Data Privacy Framework, so a transfer to them rests on the European Commission&rsquo;s adequacy decision of 10 July 2023 (Art. 45 GDPR); where that does not cover it, the EU Standard Contractual Clauses (Art. 46 GDPR) and the providers&rsquo; data-processing terms apply. ' +
  `The basis is our legitimate interest in running an invitation feature a user asked for (Art. 6(1)(f) GDPR). An invitation nobody accepts expires on its own after ${INVITATION_DEFAULT_DAYS} days by default and ${INVITATION_MAX_DAYS} at the most; once accepted, read access lasts until the project owner withdraws it; it is deleted with the project, and it is deleted if you delete a Clean-Core.io account carrying this address. You can ask us for access, rectification, erasure or restriction, you can object at any time (Art. 21 GDPR), and you can complain to a supervisory authority &mdash; ours is the Bayerisches Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany. Controller: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}. The full privacy policy is the page Privacy Policy on clean-core.io, section 8.`;

/** The Art. 14 notice in German — the same facts, the same guard (no caller value). */
const ART14_NOTICE_DE =
  'Die Person, die Sie eingeladen hat, hat Ihre Adresse eingegeben; Sie selbst haben sie uns nie gegeben. Wir speichern sie, um diese eine Mail zu senden und genau dieses eine Projekt für diese Adresse und keine andere zu öffnen; nehmen Sie an, speichern wir außerdem die Kennung Ihres Kontos und die Adresse dieses Kontos. Niemand außer dem Eigentümer, der Sie eingeladen hat, sieht etwas davon: Unsere Sicherheitsregeln lassen keinen Browser eine Einladung lesen. Zwei Auftragsverarbeiter verarbeiten sie für uns: Resend, das diese Mail zustellt, und Google Firebase, das die Datenbank betreibt, in der die Einladung gespeichert ist (Belgien, europe-west1). Beide sind US-Unternehmen, die unter dem EU-U.S. Data Privacy Framework zertifiziert sind; eine Übermittlung an sie stützt sich daher auf den Angemessenheitsbeschluss der Europäischen Kommission vom 10. Juli 2023 (Art. 45 DSGVO); wo er sie nicht erfasst, gelten die EU-Standardvertragsklauseln (Art. 46 DSGVO) und die Auftragsverarbeitungsbedingungen der Anbieter. ' +
  `Rechtsgrundlage ist unser berechtigtes Interesse am Betrieb einer Einladungsfunktion, um die ein Nutzer gebeten hat (Art. 6 Abs. 1 lit. f DSGVO). Eine Einladung, die niemand annimmt, läuft von selbst ab, standardmäßig nach ${INVITATION_DEFAULT_DAYS} Tagen und spätestens nach ${INVITATION_MAX_DAYS}; nach der Annahme gilt das Lesen, bis der Eigentümer des Projekts es entzieht; die Einladung wird mit dem Projekt gelöscht und wenn Sie ein Clean-Core.io-Konto mit dieser Adresse löschen. Sie können Auskunft, Berichtigung, Löschung oder Einschränkung verlangen, jederzeit widersprechen (Art. 21 DSGVO) und sich bei einer Aufsichtsbehörde beschweren &ndash; für uns ist das Bayerische Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Deutschland, zuständig. Verantwortlicher: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Deutschland, ${CONTACT_EMAIL}. Die vollständige Datenschutzerklärung ist die Seite Datenschutzerklärung auf clean-core.io, Abschnitt 8.`;

/* ----------------------------------------------------- the confirmation mail */

export interface AddressConfirmationEmailInput {
  /** HTML-escaped address the confirmation goes to. */
  recipient: string;
  /**
   * The confirmation link on the product's own domain: the Admin SDK's one-time
   * code behind `/auth/action` (`lib/auth-action-link.ts`, roadmap 3.0.9).
   */
  link: string;
}

export const ADDRESS_CONFIRMATION_SUBJECT = 'Confirm your email address for Clean-Core.io';

/**
 * Sent at the moment a password account tries to accept an invitation with an
 * address it has never confirmed — roadmap 5.3, and nowhere else.
 *
 * **Registration is untouched.** Nothing about signing up changes; an account
 * that never opens an invitation is never asked to confirm anything, exactly as
 * before (`docs/ROADMAP.md`: "Sign-up and account stay as they are"). What
 * changes is what an *unconfirmed* address is worth: it gets no insight into
 * anybody else's source code, because "the account says it is this address" and
 * "this address let it in" are different claims, and an invitation is bound to
 * the second one. A Google sign-in has already made the second claim, which is
 * why it counts as confirmed and gets no mail.
 */
export function buildAddressConfirmationEmail({ recipient, link }: AddressConfirmationEmailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      `This mail asks you to confirm that ${recipient} is your address. An account with this address was used to open an invitation to a project on Clean-Core.io. The project contains source code, so it opens only for a confirmed address.`,
    ],
    link: { lead: 'To confirm the address, open this link:', url: link },
    after: [
      'Then sign in again and open the invitation link once more. Nothing else about your account changes, and nothing is shared with anyone until you open that link.',
      `If you did not try to open an invitation, you can ignore this mail; the address then stays unconfirmed. Questions go to ${CONTACT_EMAIL}.`,
    ],
    footer: [
      `Sent to ${recipient} because an account with that address tried to open an invitation on Clean-Core.io.`,
    ],
  });
}

/* ------------------------------------- the confirmation mail for an inviter */

export const INVITER_CONFIRMATION_SUBJECT = 'Confirm your email address to invite readers on Clean-Core.io';

/**
 * Sent when an account with an unconfirmed address tries to invite a reader
 * (SEC-02, owner decision 22.10.2026): inviting sends a mail from clean-core.io
 * to an address the account types, so it needs an address the account has
 * shown it holds. Registration is untouched — an account that never invites is
 * never asked. `recipient` is HTML-escaped by the caller.
 */
export function buildInviterAddressConfirmationEmail({ recipient, link }: AddressConfirmationEmailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      `This mail asks you to confirm that ${recipient} is your address. An account with this address tried to invite someone to read a project on Clean-Core.io, and an invitation goes out only from a confirmed address.`,
    ],
    link: { lead: 'To confirm the address, open this link:', url: link },
    after: [
      'Then sign in again and send the invitation once more. Nothing else about your account changes.',
      `If you did not try to invite anyone, you can ignore this mail; the address then stays unconfirmed. Questions go to ${CONTACT_EMAIL}.`,
    ],
    footer: [
      `Sent to ${recipient} because an account with that address tried to invite a reader on Clean-Core.io.`,
    ],
  });
}
