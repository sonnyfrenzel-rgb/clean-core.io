import { APP_BASE_URL, CONTACT_EMAIL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import { BYOK_ADDENDUM_LANGUAGE_LABEL, BYOK_ADDENDUM_PATH, type ByokAddendumLanguage, type ByokAgreementEnding } from '@/lib/byok-addendum';

/**
 * The confirmation of the Additional Agreement on Own Model Keys (roadmap
 * 3.0.21; legal review E14/E24, acceptance T03): one mail when an Anthropic key
 * is stored with the agreement accepted, one when the agreement ends. A record
 * for both sides, not a condition of anything — a mail that does not go out
 * changes nothing about the key or the agreement, and there is deliberately no
 * resend and no "delivery failed" notice (E25 struck both).
 *
 * The plain user-mail layout (`lib/user-mail.ts`): paragraphs and one link,
 * the published wording of the accepted language version.
 *
 * `recipient` must be HTML-escaped by the caller.
 */

export const BYOK_AGREEMENT_ACCEPTED_SUBJECT = 'Clean-Core.io — your Additional Agreement on Own Model Keys';
export const BYOK_AGREEMENT_ENDED_SUBJECT = 'Clean-Core.io — your Additional Agreement on Own Model Keys has ended';

export interface AgreementAcceptedMailInput {
  recipient: string;
  version: string;
  language: ByokAddendumLanguage;
  /** SHA-256 of the accepted wording, or null while it is not archived. */
  contentSha256: string | null;
  /** ISO time of the acceptance as the server recorded it. */
  acceptedAt: string;
}

export function buildAgreementAcceptedMail(input: AgreementAcceptedMailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      'You stored an Anthropic API key on Clean-Core.io and accepted the Additional Agreement on Own Model Keys. This mail is the record of that acceptance.',
      [
        `<strong>Version:</strong> ${input.version}`,
        `<strong>Language version accepted:</strong> ${BYOK_ADDENDUM_LANGUAGE_LABEL[input.language]}`,
        `<strong>SHA-256 of the wording:</strong> ${input.contentSha256 ?? 'not pinned for this version'}`,
        `<strong>Accepted at:</strong> ${input.acceptedAt}`,
      ].join('<br>'),
      `You can end the agreement at any time: with &ldquo;Delete key and end agreement&rdquo; in Settings, or by writing to ${CONTACT_EMAIL}. Your account and your projects stay.`,
    ],
    link: { lead: 'The full wording you accepted:', url: `${APP_BASE_URL}${BYOK_ADDENDUM_PATH[input.language]}` },
    footer: [`Sent to ${input.recipient} because an Anthropic key was stored for this account on Clean-Core.io.`],
  });
}

export interface AgreementEndedMailInput {
  recipient: string;
  ending: ByokAgreementEnding;
  /** ISO time of the ending as the server recorded it. */
  endedAt: string;
}

const ENDING_WORDS: Record<ByokAgreementEnding, string> = {
  settings: 'you chose &ldquo;Delete key and end agreement&rdquo; in Settings',
  'text-form': 'you ended it by a declaration in text form, and the operator deleted the key',
  replaced: 'you replaced the Anthropic key with a Google Gemini key',
};

export function buildAgreementEndedMail(input: AgreementEndedMailInput): string {
  return buildUserMail({
    greeting: 'Hello,',
    paragraphs: [
      `Your Additional Agreement on Own Model Keys has ended: ${ENDING_WORDS[input.ending]}.`,
      `<strong>Ended at:</strong> ${input.endedAt}`,
      input.ending === 'replaced'
        ? 'From now on, every model call of your account goes to Google Gemini on your own key. No call goes to Anthropic.'
        : 'Your Anthropic key is deleted, and no call goes to Anthropic any more. Further model steps run on the platform key within your quota, unless you store another own key. Your account and your projects stay.',
    ],
    link: { lead: 'Your settings:', url: `${APP_BASE_URL}/settings` },
    footer: [`Sent to ${input.recipient} because the agreement for an Anthropic key on this account ended.`],
  });
}
