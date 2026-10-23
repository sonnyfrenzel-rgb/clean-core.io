import { CONTACT_EMAIL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import { INVITATION_DEFAULT_DAYS, INVITATION_MAX_DAYS } from '@/lib/invitations';
import { INVITATION_ONE_MAIL_SENTENCE } from '@/lib/invitation-email';
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

export const PORTFOLIO_INVITATION_SUBJECT = 'You have been invited to read a portfolio overview on Clean-Core.io';

export const PORTFOLIO_SCOPE_SENTENCE_RECIPIENT = CONSENT_TEXTS.portfolioInvitation.scope.en;

export const PORTFOLIO_LIMITS_SENTENCE_RECIPIENT =
  'Reading only. Nothing in the overview is signed, and the owner can withdraw your access at any time.';

const ART14_PORTFOLIO_NOTICE =
  'The person who invited you typed your address; you never gave it to us. We store it to send this one mail and to open that one portfolio overview for this address and no other, and if you accept, we also store your account&rsquo;s id and the address on that account. Nobody sees any of it but the owner who invited you: our security rules let no browser read an invitation at all. Two processors handle it on our behalf: Resend, which delivers this mail, and Google Firebase, which hosts the database the invitation is stored in (Belgium, europe-west1). Both are US companies certified under the EU-U.S. Data Privacy Framework, so a transfer to them rests on the European Commission&rsquo;s adequacy decision of 10 July 2023 (Art. 45 GDPR); where that does not cover it, the EU Standard Contractual Clauses (Art. 46 GDPR) and the providers&rsquo; data-processing terms apply. ' +
  `The basis is our legitimate interest in running an invitation feature a user asked for (Art. 6(1)(f) GDPR). An invitation nobody accepts expires on its own after ${INVITATION_DEFAULT_DAYS} days by default and ${INVITATION_MAX_DAYS} at the most; once accepted, read access lasts until the owner withdraws it; it is deleted with the portfolio, and it is deleted if you delete a Clean-Core.io account carrying this address. You can ask us for access, rectification, erasure or restriction, you can object at any time (Art. 21 GDPR), and you can complain to a supervisory authority &mdash; ours is the Bayerisches Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany. Controller: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}. The full privacy policy is the page Privacy Policy on clean-core.io, section 8.`;

export interface PortfolioInvitationEmailInput {
  /** HTML-escaped name from `inviterNameForMail`, or `''` to name nobody. */
  inviterName: string;
  /** HTML-escaped invited address. */
  recipient: string;
  /** Absolute URL of the invitation link. */
  link: string;
  expires: string;
  /** The unsubscribe link (`invitationUnsubscribeUrl`). */
  unsubscribeUrl: string;
}

export function buildPortfolioInvitationEmail(input: PortfolioInvitationEmailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      '<strong>You have been invited to read a portfolio overview on Clean-Core.io.</strong>',
      ...(input.inviterName
        ? [`The invitation comes from a Clean-Core.io account whose holder entered the name ${input.inviterName}. Clean-Core.io has not checked that name.`]
        : []),
      PORTFOLIO_SCOPE_SENTENCE_RECIPIENT,
      PORTFOLIO_LIMITS_SENTENCE_RECIPIENT,
      CONSENT_TEXTS.portfolioInvitation.about.en,
      `<strong>The link only opens for you.</strong> It opens for a Clean-Core.io account signed in with <strong>${input.recipient}</strong> and no other. Forwarding it gives nobody anything: the address on the account has to be this one, and it has to be confirmed. If you have no account, you can create one with this address &mdash; you do not have to; the link brings you back here afterwards.`,
      `This invitation expires on ${input.expires}.`,
    ],
    link: { lead: 'Open the invitation:', url: input.link },
    after: [
      `Did you not expect this? Then ignore the mail &mdash; nothing happens until you open the link and sign in. Questions go to ${CONTACT_EMAIL}.`,
    ],
    footer: [
      `<strong>How we got your address &mdash; Art. 14 GDPR.</strong> ${ART14_PORTFOLIO_NOTICE}`,
      `Sent to ${input.recipient} because a Clean-Core.io user invited that address to read a portfolio overview. You do not have an account with us because of this mail, and we added none.`,
      INVITATION_ONE_MAIL_SENTENCE,
    ],
    unsubscribeUrl: input.unsubscribeUrl,
  });
}

/** The path the mail points at. A path; the caller prefixes `APP_BASE_URL`. */
export function portfolioInvitationLinkPath(selectionId: string, invitationId: string): string {
  return `/portfolio/invitation/${selectionId}/${invitationId}`;
}
