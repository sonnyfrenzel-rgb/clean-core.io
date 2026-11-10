import { CONTACT_EMAIL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import { INVITATION_DEFAULT_DAYS, INVITATION_MAX_DAYS } from '@/lib/invitations';
import {
  BILINGUAL_GREETING,
  BILINGUAL_SIGNATURE,
  INVITATION_ONE_MAIL_SENTENCE,
  INVITATION_ONE_MAIL_SENTENCE_DE,
  bilingualLinkLead,
  bilingualParagraphs,
  germanMailDate,
  inLanguageOrder,
  type MailLanguage,
} from '@/lib/invitation-email';
import { CONSENT_TEXTS } from '@/lib/legal/consent-texts';

/**
 * The mail that invites one address to read a portfolio overview — C12 of the
 * legal texts (Fassung 1.1, owner decision 23.10.2026), roadmap 3.0.21 (4).
 *
 * The rules of the project invitation (C10, `lib/invitation-email.ts`):
 * exactly one mail per invitation, no reminder, no advertising; the inviting
 * person recognisable — the platform's sentence first, then the name the
 * inviting account entered, plain, bounded and labelled as unchecked (SEC-02,
 * the caller passes it through `inviterNameForMail`); one link; an
 * unsubscribe link that puts a keyed hash of the address on the suppression
 * list shared with project invitations (`lib/invitation-suppression.ts`); and
 * the Art. 14 GDPR notice, because the address came from the owner, not from
 * its holder.
 *
 * **What differs, and why it is its own text:** a portfolio invitation opens
 * the overview only — names, scores, levels, groups and the SAP objects across
 * the listed projects — and **no project and no source code** (owner decision
 * 23.10.2026). The project mail's sentences say "including the ABAP source
 * code" and its notice says "that one project"; reusing them would tell the
 * recipient something untrue. Like the project mail it names neither the
 * portfolio nor its projects: a selection name or a project title can carry a
 * customer name, and the address is whatever the owner typed.
 *
 * Every interpolated value must be HTML-escaped by the caller.
 */

export const PORTFOLIO_INVITATION_SUBJECT =
  'Einladung zum Lesen einer Portfolio-Übersicht auf Clean-Core.io · You have been invited to read a portfolio overview on Clean-Core.io';

export const PORTFOLIO_SCOPE_SENTENCE_RECIPIENT = CONSENT_TEXTS.portfolioInvitation.scope.en;
const PORTFOLIO_SCOPE_SENTENCE_RECIPIENT_DE = CONSENT_TEXTS.portfolioInvitation.scope.de;

export const PORTFOLIO_LIMITS_SENTENCE_RECIPIENT =
  'Reading only. Nothing in the overview is signed, and the owner can withdraw your access at any time.';
const PORTFOLIO_LIMITS_SENTENCE_RECIPIENT_DE =
  'Nur Lesen. Nichts in der Übersicht ist signiert, und der Eigentümer kann Ihren Zugriff jederzeit entziehen.';

const ART14_PORTFOLIO_NOTICE =
  'The person who invited you typed your address; you never gave it to us. We store it to send this one mail and to open that one portfolio overview for this address and no other, and if you accept, we also store your account&rsquo;s id and the address on that account. Nobody sees any of it but the owner who invited you: our security rules let no browser read an invitation at all. Two processors handle it on our behalf: Resend, which delivers this mail, and Google Firebase, which hosts the database the invitation is stored in (Belgium, europe-west1). Both are US companies certified under the EU-U.S. Data Privacy Framework, so a transfer to them rests on the European Commission&rsquo;s adequacy decision of 10 July 2023 (Art. 45 GDPR); where that does not cover it, the EU Standard Contractual Clauses (Art. 46 GDPR) and the providers&rsquo; data-processing terms apply. ' +
  `The basis is our legitimate interest in running an invitation feature a user asked for (Art. 6(1)(f) GDPR). An invitation nobody accepts expires on its own after ${INVITATION_DEFAULT_DAYS} days by default and ${INVITATION_MAX_DAYS} at the most; once accepted, read access lasts until the owner withdraws it; it is deleted with the portfolio, and it is deleted if you delete a Clean-Core.io account carrying this address. You can ask us for access, rectification, erasure or restriction, you can object at any time (Art. 21 GDPR), and you can complain to a supervisory authority &mdash; ours is the Bayerisches Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany. Controller: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}. The full privacy policy is the page Privacy Policy on clean-core.io, section 8.`;

const ART14_PORTFOLIO_NOTICE_DE =
  'Die Person, die Sie eingeladen hat, hat Ihre Adresse eingegeben; Sie selbst haben sie uns nie gegeben. Wir speichern sie, um diese eine Mail zu senden und genau diese eine Portfolio-Übersicht für diese Adresse und keine andere zu öffnen; nehmen Sie an, speichern wir außerdem die Kennung Ihres Kontos und die Adresse dieses Kontos. Niemand außer dem Eigentümer, der Sie eingeladen hat, sieht etwas davon: Unsere Sicherheitsregeln lassen keinen Browser eine Einladung lesen. Zwei Auftragsverarbeiter verarbeiten sie für uns: Resend, das diese Mail zustellt, und Google Firebase, das die Datenbank betreibt, in der die Einladung gespeichert ist (Belgien, europe-west1). Beide sind US-Unternehmen, die unter dem EU-U.S. Data Privacy Framework zertifiziert sind; eine Übermittlung an sie stützt sich daher auf den Angemessenheitsbeschluss der Europäischen Kommission vom 10. Juli 2023 (Art. 45 DSGVO); wo er sie nicht erfasst, gelten die EU-Standardvertragsklauseln (Art. 46 DSGVO) und die Auftragsverarbeitungsbedingungen der Anbieter. ' +
  `Rechtsgrundlage ist unser berechtigtes Interesse am Betrieb einer Einladungsfunktion, um die ein Nutzer gebeten hat (Art. 6 Abs. 1 lit. f DSGVO). Eine Einladung, die niemand annimmt, läuft von selbst ab, standardmäßig nach ${INVITATION_DEFAULT_DAYS} Tagen und spätestens nach ${INVITATION_MAX_DAYS}; nach der Annahme gilt das Lesen, bis der Eigentümer es entzieht; die Einladung wird mit dem Portfolio gelöscht und wenn Sie ein Clean-Core.io-Konto mit dieser Adresse löschen. Sie können Auskunft, Berichtigung, Löschung oder Einschränkung verlangen, jederzeit widersprechen (Art. 21 DSGVO) und sich bei einer Aufsichtsbehörde beschweren &ndash; für uns ist das Bayerische Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Deutschland, zuständig. Verantwortlicher: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Deutschland, ${CONTACT_EMAIL}. Die vollständige Datenschutzerklärung ist die Seite Datenschutzerklärung auf clean-core.io, Abschnitt 8.`;

export interface PortfolioInvitationEmailInput {
  /** HTML-escaped name from `inviterNameForMail`, or `''` to name nobody. */
  inviterName: string;
  /** HTML-escaped invited address. */
  recipient: string;
  /** Absolute URL of the invitation link. */
  link: string;
  expires: string;
  /** The expiry as an ISO time, for the German date. */
  expiresAt?: string;
  /** The unsubscribe link (`invitationUnsubscribeUrl`). */
  unsubscribeUrl: string;
  /** German first unless the inviting person uses the English interface; there is no per-account language yet, so: German. */
  firstLanguage?: MailLanguage;
}

/** Bilingual, like the project invitation (legal texts Fassung 1.1, C12). */
export function buildPortfolioInvitationEmail(input: PortfolioInvitationEmailInput): string {
  const first: MailLanguage = input.firstLanguage ?? 'de';
  const second: MailLanguage = first === 'de' ? 'en' : 'de';
  const de = [
    '<strong>Sie wurden eingeladen, eine Portfolio-Übersicht auf Clean-Core.io zu lesen.</strong>',
    ...(input.inviterName
      ? [`Die Einladung kommt von einem Clean-Core.io-Konto, dessen Inhaber den Namen ${input.inviterName} eingetragen hat. Clean-Core.io hat diesen Namen nicht geprüft.`]
      : []),
    PORTFOLIO_SCOPE_SENTENCE_RECIPIENT_DE,
    PORTFOLIO_LIMITS_SENTENCE_RECIPIENT_DE,
    CONSENT_TEXTS.portfolioInvitation.about.de,
    `<strong>Der Link öffnet sich nur für Sie.</strong> Er öffnet sich für ein Clean-Core.io-Konto, das mit <strong>${input.recipient}</strong> angemeldet ist, und für kein anderes. Wer ihn weiterleitet, gibt niemandem etwas: Die Adresse des Kontos muss diese sein, und sie muss bestätigt sein. Haben Sie kein Konto, können Sie eines mit dieser Adresse anlegen &ndash; Sie müssen nicht; der Link bringt Sie danach hierher zurück.`,
    `Diese Einladung läuft am ${germanMailDate(input.expiresAt, input.expires)} ab.`,
  ];
  const en = [
    '<strong>You have been invited to read a portfolio overview on Clean-Core.io.</strong>',
    ...(input.inviterName
      ? [`The invitation comes from a Clean-Core.io account whose holder entered the name ${input.inviterName}. Clean-Core.io has not checked that name.`]
      : []),
    PORTFOLIO_SCOPE_SENTENCE_RECIPIENT,
    PORTFOLIO_LIMITS_SENTENCE_RECIPIENT,
    CONSENT_TEXTS.portfolioInvitation.about.en,
    `<strong>The link only opens for you.</strong> It opens for a Clean-Core.io account signed in with <strong>${input.recipient}</strong> and no other. Forwarding it gives nobody anything: the address on the account has to be this one, and it has to be confirmed. If you have no account, you can create one with this address &mdash; you do not have to; the link brings you back here afterwards.`,
    `This invitation expires on ${input.expires}.`,
  ];
  return buildUserMail({
    greeting: `${BILINGUAL_GREETING[first]} &middot; ${BILINGUAL_GREETING[second]}`,
    paragraphs: bilingualParagraphs(first, de, en),
    link: { lead: bilingualLinkLead(first), url: input.link },
    after: inLanguageOrder(
      first,
      [`Haben Sie das nicht erwartet? Dann ignorieren Sie die Mail &ndash; es geschieht nichts, solange Sie den Link nicht öffnen und sich anmelden. Fragen an ${CONTACT_EMAIL}.`],
      [`Did you not expect this? Then ignore the mail &mdash; nothing happens until you open the link and sign in. Questions go to ${CONTACT_EMAIL}.`],
    ),
    signature: BILINGUAL_SIGNATURE,
    footer: inLanguageOrder(
      first,
      [
        `<strong>Woher wir Ihre Adresse haben &ndash; Art. 14 DSGVO.</strong> ${ART14_PORTFOLIO_NOTICE_DE}`,
        `Gesendet an ${input.recipient}, weil ein Clean-Core.io-Nutzer diese Adresse eingeladen hat, eine Portfolio-Übersicht zu lesen. Durch diese Mail haben Sie kein Konto bei uns, und wir haben keines angelegt.`,
        INVITATION_ONE_MAIL_SENTENCE_DE,
      ],
      [
        `<strong>How we got your address &mdash; Art. 14 GDPR.</strong> ${ART14_PORTFOLIO_NOTICE}`,
        `Sent to ${input.recipient} because a Clean-Core.io user invited that address to read a portfolio overview. You do not have an account with us because of this mail, and we added none.`,
        INVITATION_ONE_MAIL_SENTENCE,
      ],
    ),
    unsubscribeUrl: input.unsubscribeUrl,
  });
}
/** The path the mail points at. A path; the caller prefixes `APP_BASE_URL`. */
export function portfolioInvitationLinkPath(selectionId: string, invitationId: string): string {
  return `/portfolio/invitation/${selectionId}/${invitationId}`;
}
