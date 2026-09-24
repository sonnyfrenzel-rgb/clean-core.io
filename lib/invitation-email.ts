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
  /** HTML-escaped display name of the person who invited. */
  inviterName: string;
  /** HTML-escaped invited address; shown in the transactional footer. */
  recipient: string;
  /** Absolute URL of the invitation link. Built from `APP_BASE_URL`, never a Host header. */
  link: string;
  /** Human-readable expiry, e.g. "2 October 2026". */
  expires: string;
}

export const INVITATION_EMAIL_SUBJECT = 'You have been invited to read a project on Clean-Core.io';

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
export function buildInvitationEmail({ inviterName, recipient, link, expires }: InvitationEmailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      `<strong>${inviterName} invited you to read a project on Clean-Core.io.</strong>`,
      INVITATION_SCOPE_SENTENCE_RECIPIENT,
      INVITATION_LIMITS_SENTENCE_RECIPIENT,
      `<strong>The link only opens for you.</strong> It opens for a Clean-Core.io account signed in with <strong>${recipient}</strong> and no other. Forwarding it gives nobody anything: the address on the account has to be this one, and it has to be confirmed. If you have no account yet, create one with this address &mdash; the link brings you back here afterwards.`,
      `This invitation expires on ${expires}.`,
    ],
    link: { lead: 'Open the invitation:', url: link },
    after: [
      `Did you not expect this? Then ignore the mail &mdash; nothing happens until you open the link and sign in. Questions go to ${CONTACT_EMAIL}; the page Trust &amp; Transparency on clean-core.io explains how the platform handles code.`,
    ],
    footer: [
      `<strong>How we got your address &mdash; Art. 14 GDPR.</strong> ${ART14_NOTICE}`,
      `Sent to ${recipient} because a Clean-Core.io user invited that address to read one of their projects. You do not have an account with us because of this mail, and we added none.`,
    ],
  });
}

/**
 * The Art. 14 notice itself. No caller value is interpolated into it — the
 * guard in `tests/invitation-email-guard.spec.ts` builds the mail with hostile
 * input and compares this part byte for byte. The privacy policy is named, not
 * linked: the one link of a user mail is the invitation (`lib/user-mail.ts`).
 */
const ART14_NOTICE =
  'The person who invited you typed your address; you never gave it to us. We store it to send this one mail and to open that one project for this address and no other, and if you accept, we also store your account&rsquo;s id and the address on that account. Nobody sees any of it but the owner who invited you: our security rules let no browser read an invitation at all. Two processors handle it on our behalf: Resend, which delivers this mail, and Google Firebase, which hosts the database the invitation is stored in (Belgium, europe-west1). Both are US companies certified under the EU-U.S. Data Privacy Framework, so a transfer to them rests on the European Commission&rsquo;s adequacy decision of 10 July 2023 (Art. 45 GDPR); where that does not cover it, the EU Standard Contractual Clauses (Art. 46 GDPR) and the providers&rsquo; data-processing terms apply. ' +
  `The basis is our legitimate interest in running an invitation feature a user asked for (Art. 6(1)(f) GDPR). An invitation expires on its own after ${INVITATION_DEFAULT_DAYS} days by default and ${INVITATION_MAX_DAYS} at the most; it is deleted with the project, and it is deleted if you delete a Clean-Core.io account carrying this address. You can ask us for access, rectification, erasure or restriction, you can object at any time (Art. 21 GDPR), and you can complain to a supervisory authority &mdash; ours is the Bayerisches Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany. Controller: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}. The full privacy policy is the page Privacy Policy on clean-core.io, section 8.`;

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
 * before (`docs/ROADMAP.md`: "Anmeldung und Konto bleiben, wie sie sind"). What
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
