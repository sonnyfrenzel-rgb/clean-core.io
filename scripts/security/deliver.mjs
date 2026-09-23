#!/usr/bin/env node
/**
 * Delivers the sealed security audit to the owner's inbox — the CI entry point
 * (.github/workflows/security-audit.yml, job `deliver`).
 *
 * This job holds the private key and the mail key, and runs no model. It opens
 * the report, renders it in German and sends it. A failed send fails the job:
 * an audit that did not arrive is exactly the silence it exists to end.
 *
 *   node scripts/security/deliver.mjs           CI: send
 *   node scripts/security/deliver.mjs --dry     print subject and text locally, send nothing
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { openWith, privateKeyFrom } from './lib/envelope.mjs';
import { FROM, recipient, renderAuditMail } from './lib/mail.mjs';

const DRY = process.argv.includes('--dry');
const SEALED = process.env.SEALED_PATH || '.security-audit/out/security-audit.enc.json';

async function main() {
  const sealedRaw = readFileSync(SEALED, 'utf8');
  const payload = openWith(JSON.parse(sealedRaw), privateKeyFrom(process.env.SECURITY_AUDIT_PRIVATE_KEY));
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const mail = renderAuditMail(payload, {
    version: `v${version}`,
    runUrl: process.env.RUN_URL || '(lokal)',
    sealedSha256: createHash('sha256').update(sealedRaw).digest('hex'),
  });

  if (DRY) {
    console.log(`${mail.subject}\n\n${mail.text}`);
    return;
  }

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [recipient()], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  // Status only: the body of a rejection can echo the mail, and this log is public.
  if (!res.ok) throw new Error(`Resend rejected the audit mail: HTTP ${res.status}`);
  console.log(`Security audit mail sent (${mail.findings.length} finding(s) — details only in the mail).`);
}

main().catch((err) => {
  console.error(`Security audit delivery failed: ${String(err?.message || err).split('\n')[0]}`);
  process.exit(1);
});
