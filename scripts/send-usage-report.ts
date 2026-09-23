/**
 * Sends the weekly admin usage report.
 *
 * Runs from GitHub Actions every Friday at 12:00 Europe/Berlin (see
 * .github/workflows/usage-report.yml), and can be run by hand at any time.
 *
 * Each report is also stored in `usage_reports`, so a later version can chart a
 * trend longer than the two weeks the mail itself compares. Storing it costs one
 * document a week.
 *
 * Usage:
 *   npx tsx scripts/send-usage-report.ts              # dry run: prints the figures
 *   npx tsx scripts/send-usage-report.ts --apply      # send
 *   npx tsx scripts/send-usage-report.ts --apply --to someone@example.com
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildUsageReport } from '../lib/usage-report';
import {
  renderUsageReportEmail,
  renderUsageReportSubject,
  renderUsageReportText,
} from '../lib/usage-report-email';
import { FIRESTORE_DB_ID } from '../lib/constants';
import { reportRecipient } from './lib/report-recipient';

const PROJECT_ID = 'cleancore-491216';
// The address is no longer written down here — see scripts/lib/report-recipient.ts.
const FROM = 'Clean-Core.io Report <info@clean-core.io>';

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Reads a secret from the environment first, falling back to the local .env files. */
function readSecret(key: string): string {
  if (process.env[key]) return process.env[key] as string;
  for (const file of ['.env.local', '.env']) {
    const p = path.resolve(process.cwd(), file);
    if (!fs.existsSync(p)) continue;
    const line = fs
      .readFileSync(p, 'utf8')
      .replace(/\r/g, '')
      .split('\n')
      .find((l) => l.startsWith(`${key}=`));
    if (line) {
      const v = line.slice(key.length + 1).replace(/^["']|["']$/g, '').trim();
      if (v) return v;
    }
  }
  throw new Error(`${key} is not set (environment or .env.local)`);
}

async function main() {
  const to = argValue('--to') || reportRecipient();

  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const report = await buildUsageReport(db);
  const subject = renderUsageReportSubject(report);

  // The repository is public, and so is every Actions log. Until 23.09.2026 this
  // function printed the subject line ("9 von 43 Accounts aktiv"), the weekly
  // figures and the administrator's address straight into that
  // log — every Friday, readable by anyone (run 35333168862, KW 38). The survey
  // scripts had the same defect and were switched off for it on 15.09.2026; this
  // one was not covered by that fix.
  //
  // The figures are what the report is for, so they are not removed — they are
  // kept out of CI. Locally the whole table still prints, because a dry run that
  // shows nothing cannot be checked.
  // Same test as `send-survey-digest.ts:138`, deliberately: one rule for what a
  // public log may see, not two.
  const local = !process.env.CI && !process.env.GITHUB_ACTIONS;
  if (!local) {
    console.log(`report built for ${report.periodStart.toISOString().slice(0, 10)} — ` +
      `${report.periodEnd.toISOString().slice(0, 10)} (figures and recipient withheld: public log)`);
  }
  const say = (line: string) => { if (local) console.log(line); };

  say(subject);
  say('');
  say(`period      : ${report.periodStart.toISOString()} — ${report.periodEnd.toISOString()}`);
  say(`accounts    : ${report.totals.accounts} (${report.totals.activated} activated, ${report.totals.neverStarted} never started)`);
  say('');
  say('                        this week   last week');
  const row = (label: string, a: number, b: number) =>
    say(`  ${label.padEnd(22)}${String(a).padStart(9)}${String(b).padStart(12)}`);
  row('registrations', report.current.registrations, report.previous.registrations);
  row('activations', report.current.activations, report.previous.activations);
  row('runs', report.current.runs, report.previous.runs);
  row('projects', report.current.projects, report.previous.projects);
  row('units', report.current.units, report.previous.units);
  say('');
  say(`recipient   : ${to}`);

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing sent. Re-run with --apply.');
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${readSecret('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: 'info@clean-core.io',
      subject,
      html: renderUsageReportEmail(report),
      text: renderUsageReportText(report),
    }),
  });

  if (!res.ok) throw new Error(`Resend rejected the report: ${res.status} ${await res.text()}`);
  const { id } = (await res.json()) as { id: string };
  console.log('');
  console.log(`sent (${id})`);

  // Kept so a later version can show a longer trend than the mail's two weeks.
  await db.collection('usage_reports').add({
    ...report,
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    generatedAt: FieldValue.serverTimestamp(),
    recipient: to,
    providerId: id,
  });
  console.log('snapshot stored in usage_reports');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
