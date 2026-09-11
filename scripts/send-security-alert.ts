/**
 * Mails the admin when a scheduled Security CI run fails.
 *
 * Called by the `alert-admin` job in .github/workflows/security-ci.yml. Needs
 * nothing but the Resend key: no Firestore, no Google Cloud. The run context
 * arrives as environment variables, never as interpolated shell text.
 *
 * Usage:
 *   npx tsx scripts/send-security-alert.ts            # dry run: prints the mail
 *   npx tsx scripts/send-security-alert.ts --apply    # send
 *
 * Environment: RESEND_API_KEY, NEEDS_JSON (the workflow's `needs` context as
 * JSON), RUN_URL, TEST_ALERT ('true' for a manual test of the path).
 */

import { renderSecurityAlert, failedJobsFrom } from '../lib/security-alert-email';

// The same admin address and sender as the weekly usage report.
const RECIPIENT = 'sonny.frenzel@googlemail.com';
const FROM = 'Clean-Core.io Security <info@clean-core.io>';

async function main() {
  const failedJobs = failedJobsFrom(process.env.NEEDS_JSON);
  const mail = renderSecurityAlert({
    failedJobs,
    runUrl: process.env.RUN_URL || '(no run URL)',
    runStartedAt: new Date().toISOString(),
    test: process.env.TEST_ALERT === 'true',
  });

  console.log(`to      : ${RECIPIENT}`);
  console.log(`subject : ${mail.subject}`);
  console.log('');
  console.log(mail.text);

  if (!process.argv.includes('--apply')) {
    console.log('\nDRY RUN — nothing sent. Re-run with --apply.');
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [RECIPIENT], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  // A failed send has to fail the job: an alert that could not be delivered is
  // exactly the silence this exists to end, and a red job is at least visible.
  if (!res.ok) throw new Error(`Resend rejected the alert: ${res.status} ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  console.log(`\nsent (${id})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
