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
  /** Absolute URL of the invitation link. Built from `APP_BASE_URL`, never a Host header. */
  link: string;
  /** Human-readable expiry, e.g. "2 October 2026". */
  expires: string;
}

export const INVITATION_EMAIL_SUBJECT = 'You have been invited to read a project on Clean-Core.io';

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
export function buildInvitationEmail({ inviterName, recipient, link, expires }: InvitationEmailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      // The platform's own sentence first and in bold; the inviter's name, if
      // any, after it in plain text and labelled as unchecked (SEC-02).
      '<strong>You have been invited to read a project on Clean-Core.io.</strong>',
      ...(inviterName
        ? [`The invitation comes from a Clean-Core.io account whose holder entered the name ${inviterName}. Clean-Core.io has not checked that name.`]
        : []),
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
  `The basis is our legitimate interest in running an invitation feature a user asked for (Art. 6(1)(f) GDPR). An invitation nobody accepts expires on its own after ${INVITATION_DEFAULT_DAYS} days by default and ${INVITATION_MAX_DAYS} at the most; once accepted, read access lasts until the project owner withdraws it; it is deleted with the project, and it is deleted if you delete a Clean-Core.io account carrying this address. You can ask us for access, rectification, erasure or restriction, you can object at any time (Art. 21 GDPR), and you can complain to a supervisory authority &mdash; ours is the Bayerisches Landesamt f&uuml;r Datenschutzaufsicht (BayLDA), Promenade 18, 91522 Ansbach, Germany. Controller: Felix Frenzel, Hellerstra&szlig;e 9, 96047 Bamberg, Germany, ${CONTACT_EMAIL}. The full privacy policy is the page Privacy Policy on clean-core.io, section 8.`;

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
