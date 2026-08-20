/**
 * One-off fairness migration for v2.3.
 *
 * Every existing `transformationsUsed` counter was accumulated under the pre-v2.3
 * model, where each Gemini call cost one unit — so a single ABAP object burned 6–7
 * units and accounts hit their limit long before finishing one project. With the
 * metered unit now being the analysis run (see `reserveRunQuota`), those balances
 * are not comparable and every account starts over with its full allotment.
 *
 * What it does per user document:
 *   transformationsUsed -> 0
 *   chargedInputs       -> deleted (no fingerprint may look "already paid")
 * and appends one `audit_events` record per reset account.
 *
 * What it deliberately does NOT touch: `transformationsLimit`, `status`, `tier`.
 * A revoked account (limit 0) stays revoked; a pending account stays pending.
 *
 * Usage:
 *   node scripts/reset-quota-v23-fairness.mjs            # dry run, prints the plan
 *   node scripts/reset-quota-v23-fairness.mjs --apply    # writes
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = 'cleancore-491216';
// Production moved to europe-west1 on 2026-08-20; see docs/PLAN-FIRESTORE-MIGRATION.md.
const DATABASE_ID = 'clean-core-eu';
const APPLY = process.argv.includes('--apply');

if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST is set. This script targets production.');
  process.exit(1);
}

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore(app, DATABASE_ID);

const snap = await db.collection('users').get();
console.log(`Project ${PROJECT_ID} / database ${DATABASE_ID}`);
console.log(`${snap.size} user documents found.\n`);

const plan = [];
for (const d of snap.docs) {
  const u = d.data();
  const used = typeof u.transformationsUsed === 'number' ? u.transformationsUsed : 0;
  const fingerprints = u.chargedInputs ? Object.keys(u.chargedInputs).length : 0;
  plan.push({
    uid: d.id,
    email: u.email || '(no email)',
    tier: u.tier || 'pilot',
    status: u.status || 'pending',
    limit: typeof u.transformationsLimit === 'number' ? u.transformationsLimit : 5,
    used,
    fingerprints,
    needsWrite: used !== 0 || fingerprints > 0,
  });
}

plan.sort((a, b) => b.used - a.used);
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(pad('EMAIL', 40) + pad('TIER', 13) + pad('STATUS', 11) + pad('USED', 6) + pad('LIMIT', 7) + 'ACTION');
console.log('-'.repeat(88));
for (const p of plan) {
  console.log(
    pad(p.email, 40) + pad(p.tier, 13) + pad(p.status, 11) + pad(p.used, 6) + pad(p.limit, 7) +
    (p.needsWrite ? `reset ${p.used} -> 0` + (p.fingerprints ? ` (+${p.fingerprints} fingerprints)` : '') : 'already 0, skip'),
  );
}

const toWrite = plan.filter((p) => p.needsWrite);
const reclaimed = toWrite.reduce((sum, p) => sum + p.used, 0);
console.log(`\n${toWrite.length} of ${plan.length} accounts need a reset; ${reclaimed} units returned in total.`);

if (!APPLY) {
  console.log('\nDRY RUN — nothing was written. Re-run with --apply to execute.');
  process.exit(0);
}

let done = 0;
for (const p of toWrite) {
  const batch = db.batch();
  batch.update(db.collection('users').doc(p.uid), {
    transformationsUsed: 0,
    chargedInputs: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(db.collection('audit_events').doc(), {
    actorUid: 'migration:v2.3',
    actorEmail: 'system-migration',
    action: 'RESET_QUOTA_V23_FAIRNESS',
    targetUid: p.uid,
    previousUsed: p.used,
    timestamp: new Date(),
  });
  await batch.commit();
  done++;
  console.log(`reset ${p.email} (${p.used} -> 0)`);
}

console.log(`\nDone. ${done} accounts reset, ${reclaimed} units returned.`);
process.exit(0);
