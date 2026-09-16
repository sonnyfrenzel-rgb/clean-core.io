#!/usr/bin/env node
/**
 * Record a finding that did not survive verification, so the reviewer stops
 * raising it.
 *
 *   node scripts/qa/refute.mjs <fingerprint> "<why it is not a bug, with the evidence>"
 *
 * The reason has to be something a second reader could check — a file and line,
 * a test that proves the behaviour, a spec reference. "Not an issue" is not a
 * reason. The list is committed sealed (docs/qa/refuted-findings.enc.json).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_DIR, loadDotEnv, loadRefuted, saveRefuted } from './lib/store.mjs';

const [fingerprint, reason] = process.argv.slice(2);
if (!/^[0-9a-f]{12}$/.test(fingerprint || '') || !reason || reason.trim().length < 20) {
  console.error('Usage: node scripts/qa/refute.mjs <12-hex fingerprint> "<reason of at least 20 characters, with evidence>"');
  process.exit(1);
}

const secret = process.env.QA_REVIEW_KEY || loadDotEnv().QA_REVIEW_KEY;
if (!secret) {
  console.error('QA_REVIEW_KEY is not in the environment or .env.local.');
  process.exit(1);
}

// The finding comes from the newest decrypted review on this machine — the one
// just awaited. A release's full review lands as `<sha>.full.json` and shares
// this refuted list, so it is searched too; until it was, no finding of a full
// review could be refuted at all.
const reviews = readdirSync(LOCAL_DIR)
  .filter((f) => /\.(review|full)\.json$/.test(f))
  .map((f) => join(LOCAL_DIR, f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
const finding = reviews.map((p) => JSON.parse(readFileSync(p, 'utf8'))).flatMap((r) => r.findings.map((f) => ({ ...f, reviewedHead: r.range.head }))).find((f) => f.fingerprint === fingerprint);

if (!finding) {
  console.error(`No finding ${fingerprint} in the local reviews under ${LOCAL_DIR}/. Run scripts/qa/await.mjs first.`);
  process.exit(1);
}

const refuted = loadRefuted(secret).filter((r) => r.fingerprint !== fingerprint);
refuted.push({
  fingerprint,
  file: finding.file,
  title: finding.title,
  severity: finding.severity,
  reason: reason.trim(),
  reviewedHead: finding.reviewedHead,
  refutedAt: new Date().toISOString(),
});
saveRefuted(refuted, secret);
console.log(`Refuted ${fingerprint} (${finding.file} · ${finding.title}). ${refuted.length} refuted in total — commit docs/qa/refuted-findings.enc.json.`);
