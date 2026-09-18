/**
 * Rescues the survey answers that landed in a field whose *name* contains a dot.
 *
 * Between the survey going out and the fix, `/api/survey/vote` wrote
 * ``set({ [`answers.${q}`]: value }, { merge: true })``. A dot in a key of
 * `set()` is not a field path — so every answer became a top-level field
 * literally named `answers.ran`, `answeredAt.ran` and so on, while the nested
 * `answers` map the digest and the survey page read stayed undefined. The
 * endpoint answered `ok: true` throughout. `lib/survey/store.ts` carries the
 * full account; the writing side is fixed and new answers arrive nested.
 *
 * What is left is the answers already given. They are still in the documents,
 * whole, under the wrong names.
 *
 * **The trap, and why this script exists rather than four lines in a console.**
 * The obvious cleanup — `update({ 'answers.ran': FieldValue.delete() })` —
 * deletes the *nested* answer that was just rescued, because `update()` reads a
 * dotted string key as a path. The literal field is only reachable through
 * `new FieldPath('answers.ran')`, which is one segment that happens to contain a
 * dot. Getting this backwards destroys exactly the data the script is here to
 * save, and it looks like it worked.
 *
 * Order of operations, deliberately: back up every document to a file, write the
 * rescued values into the nested maps, read them back, and only then delete the
 * dotted fields. A crash anywhere in that sequence leaves the data duplicated
 * rather than gone.
 *
 * Usage:
 *   npx tsx scripts/survey-repair-dotted-answers.ts                 # dry run
 *   npx tsx scripts/survey-repair-dotted-answers.ts --backup <file> # dry run, backup elsewhere
 *   npx tsx scripts/survey-repair-dotted-answers.ts --apply         # rescue, verify, then delete
 *   npx tsx scripts/survey-repair-dotted-answers.ts --apply --keep-dotted   # rescue only
 *
 * Authentication is Application Default Credentials, like the other production
 * scripts here (`gcloud auth application-default login`).
 *
 * **It prints no e-mail addresses and no free-text comments.** The survey
 * scripts leaked addresses into a public Actions log once (15.09.2026); this one
 * counts and names document ids, and nothing a person wrote.
 */

import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import { FIRESTORE_DB_ID } from '../lib/constants';

const PROJECT_ID = 'cleancore-491216';
const COLLECTION = 'survey_responses';

const APPLY = process.argv.includes('--apply');
const KEEP_DOTTED = process.argv.includes('--keep-dotted');

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** `answers.ran` → { map: 'answers', key: 'ran' }; anything else → null. */
function splitDotted(field: string): { map: 'answers' | 'answeredAt'; key: string } | null {
  for (const map of ['answers', 'answeredAt'] as const) {
    const prefix = `${map}.`;
    if (field.startsWith(prefix) && field.length > prefix.length) {
      return { map, key: field.slice(prefix.length) };
    }
  }
  return null;
}

async function main(): Promise<void> {
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], FIRESTORE_DB_ID);

  const snap = await db.collection(COLLECTION).get();
  console.log(`${COLLECTION}: ${snap.size} document(s) in ${PROJECT_ID}/${FIRESTORE_DB_ID}`);

  const backupPath = path.resolve(
    argValue('--backup') ||
      path.join(process.cwd(), `survey-backup-${new Date().toISOString().slice(0, 10)}.json`),
  );

  // The backup is written on every run, dry or not. A dry run that cannot write
  // its backup is a run that must not be repeated with --apply.
  const backup = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`backup written: ${backupPath} (${backup.length} document(s))`);

  type Plan = {
    id: string;
    rescue: { answers: Record<string, unknown>; answeredAt: Record<string, unknown> };
    dotted: string[];
    skippedBecauseNested: string[];
  };
  const plans: Plan[] = [];

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const nestedAnswers = (data.answers as Record<string, unknown> | undefined) || {};
    const nestedStamps = (data.answeredAt as Record<string, unknown> | undefined) || {};

    const rescue = { answers: {} as Record<string, unknown>, answeredAt: {} as Record<string, unknown> };
    const dotted: string[] = [];
    const skippedBecauseNested: string[] = [];

    for (const field of Object.keys(data)) {
      const parts = splitDotted(field);
      if (!parts) continue;
      dotted.push(field);
      const already = parts.map === 'answers' ? nestedAnswers : nestedStamps;
      // A nested value is a later answer, given after the endpoint was fixed. It
      // wins: the stranded one is the older of the two, and overwriting a
      // person's newer answer with their older one would be a second bug wearing
      // the first one's clothes.
      if (Object.prototype.hasOwnProperty.call(already, parts.key)) {
        skippedBecauseNested.push(field);
        continue;
      }
      rescue[parts.map][parts.key] = data[field];
    }

    if (dotted.length === 0) continue;
    plans.push({ id: doc.id, rescue, dotted, skippedBecauseNested });
  }

  const totalDotted = plans.reduce((n, p) => n + p.dotted.length, 0);
  const totalRescued = plans.reduce(
    (n, p) => n + Object.keys(p.rescue.answers).length + Object.keys(p.rescue.answeredAt).length,
    0,
  );
  const totalSkipped = plans.reduce((n, p) => n + p.skippedBecauseNested.length, 0);

  console.log('');
  console.log(`documents with stranded fields: ${plans.length}`);
  console.log(`stranded fields in total:       ${totalDotted}`);
  console.log(`  to be rescued:                ${totalRescued}`);
  console.log(`  already answered again:       ${totalSkipped} (nested value kept)`);
  for (const p of plans) {
    console.log(`  ${p.id}: ${p.dotted.join(', ')}`);
  }

  if (!APPLY) {
    console.log('');
    console.log('DRY RUN — nothing was written. Re-run with --apply to rescue.');
    return;
  }

  let rescuedDocs = 0;
  for (const p of plans) {
    const payload: Record<string, unknown> = {};
    if (Object.keys(p.rescue.answers).length) payload.answers = p.rescue.answers;
    if (Object.keys(p.rescue.answeredAt).length) payload.answeredAt = p.rescue.answeredAt;
    if (Object.keys(payload).length === 0) continue;
    // Nested maps with merge — Firestore merges them key by key, so one
    // question's answer never overwrites another's.
    await db.collection(COLLECTION).doc(p.id).set(payload, { merge: true });
    rescuedDocs++;
  }
  console.log(`rescued into the nested maps: ${rescuedDocs} document(s)`);

  // Read back before deleting anything. The delete below is the irreversible
  // half, and it runs only against what was verified present a moment earlier.
  for (const p of plans) {
    const after = (await db.collection(COLLECTION).doc(p.id).get()).data() as Record<string, unknown>;
    const nested = (after?.answers as Record<string, unknown> | undefined) || {};
    for (const key of Object.keys(p.rescue.answers)) {
      if (!Object.prototype.hasOwnProperty.call(nested, key)) {
        throw new Error(
          `${p.id}: "${key}" is not in the nested answers after the write — nothing was deleted, the backup is at ${backupPath}`,
        );
      }
    }
  }
  console.log('read-back: every rescued answer is in the nested map');

  if (KEEP_DOTTED) {
    console.log('--keep-dotted: the dotted fields are left in place.');
    return;
  }

  let deleted = 0;
  for (const p of plans) {
    for (const field of p.dotted) {
      // `new FieldPath(field)` is ONE segment that contains a dot. A plain
      // string here would be read as a path and would delete the nested answer
      // that was just rescued.
      await db.collection(COLLECTION).doc(p.id).update(new FieldPath(field), FieldValue.delete());
      deleted++;
    }
  }
  console.log(`deleted ${deleted} stranded field(s) from ${plans.length} document(s)`);
  console.log(`backup for the record: ${backupPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
