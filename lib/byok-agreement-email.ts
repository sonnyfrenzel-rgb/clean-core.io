import { APP_BASE_URL } from '@/lib/constants';
import { buildUserMail } from '@/lib/user-mail';
import type { ByokAgreementEnding } from '@/lib/byok-addendum';

/**
 * The confirmation of the end of the Additional Agreement on Own Model Keys
 * (roadmap 3.0.21; legal review E14/E24, acceptance T03). The acceptance is
 * confirmed by the contract confirmation C5 (`lib/contract-confirmation-email.ts`),
 * in the language version accepted and with the full wording. A record
 * for both sides, not a condition of anything — a mail that does not go out
 * changes nothing about the key or the agreement, and there is deliberately no
 * resend and no "delivery failed" notice (E25 struck both).
 *
 * The plain user-mail layout (`lib/user-mail.ts`): paragraphs and one link,
 * the published wording of the accepted language version.
 *
 * `recipient` must be HTML-escaped by the caller.
 */

export const BYOK_AGREEMENT_ENDED_SUBJECT = 'Clean-Core.io — your Additional Agreement on Own Model Keys has ended';

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
