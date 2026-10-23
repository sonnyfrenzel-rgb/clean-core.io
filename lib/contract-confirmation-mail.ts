import { wrapEmailDocument } from '@/lib/email-layout';
import { sendTransactionalMail } from '@/lib/transactional-mail';
import type { TermsLanguage } from '@/lib/terms-versions';
import type { ByokAddendumAcceptance } from '@/lib/byok-addendum';
import { acceptedWording, buildContractConfirmationMail, type ConfirmationOccasion } from '@/lib/contract-confirmation-email';
import { logger, providerErrorShape } from '@/lib/logger';

/**
 * Sends the contract confirmation (C5; Terms 1.3, 10.2; Additional Agreement
 * clause 12; acceptance test T03). Server-only, best effort: a failure is
 * logged as a code, never fails the request and is not retried (E14/E25).
 *
 * The wording is rendered from the same source and with the same function as
 * the archive file (`scripts/legal/archive-terms.ts`;
 * `tests/legal-archive-sync.spec.ts` holds the two equal), and the mail goes
 * out only when its SHA-256 is the digest the record names — a confirmation
 * whose text and digest disagreed would be a false statement about what was
 * accepted. `to` is the verified address, never a body value.
 */

export async function sendContractConfirmationMail(input: {
  to: string | null | undefined;
  uid: string;
  occasion: ConfirmationOccasion;
  language: TermsLanguage;
  firstName?: string | null;
  acceptedAt?: string;
  addendum?: ByokAddendumAcceptance;
}): Promise<void> {
  if (!input.to) return;
  try {
    const accepted = acceptedWording(input.occasion, input.language, input.addendum?.version);
    if (!accepted) {
      logger.critical('contract confirmation not sent: the wording does not match its archived digest', {
        occasion: input.occasion,
        language: input.language,
      });
      return;
    }
    const { subject, html } = buildContractConfirmationMail({
      occasion: input.occasion,
      language: input.language,
      recipient: input.to,
      firstName: input.firstName ?? null,
      ...accepted,
      acceptedAt: input.acceptedAt ?? new Date().toISOString(),
    });
    await sendTransactionalMail({
      to: input.to,
      subject,
      html: wrapEmailDocument(html, subject),
      label: `contract-confirmation-${input.occasion}`,
      uid: input.uid,
    });
  } catch (err) {
    logger.warn('contract confirmation not sent', { occasion: input.occasion, error: providerErrorShape(err) });
  }
}
