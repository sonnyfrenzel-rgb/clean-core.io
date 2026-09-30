/**
 * Re-seals every stored BYOK key under `BYOK_ENCRYPTION_KEY` (roadmap 3.0.13 g).
 *
 * Until 3.0.13 a stored model key was encrypted with `S4_ENCRYPTION_KEY` and
 * carried no key version (`lib/byok-key.ts` calls that version 0). The app
 * still reads version 0 and never writes it; this script moves the stored
 * records to the current version, after which the S/4 key opens no model key.
 *
 * Usage:
 *   npx tsx scripts/byok-rekey.ts                      # dry run: counts only, nothing written
 *   npx tsx scripts/byok-rekey.ts --uid <uid>          # dry run for one account (a canary)
 *   BYOK_REKEY_CONFIRM=<database-id> npx tsx scripts/byok-rekey.ts --apply [--uid <uid>]
 *
 * Needs, in the environment of the shell that runs it:
 *   - `S4_ENCRYPTION_KEY`   — to open the version-0 records (the production value);
 *   - `BYOK_ENCRYPTION_KEY` — the new key, **the same value the deployed app has**;
 *   - Application Default Credentials for cleancore-491216, or
 *     `FIRESTORE_EMULATOR_HOST` to run against the emulator;
 *   - `NEXT_PUBLIC_FIRESTORE_DB_ID` for the database (default `clean-core-eu`,
 *     production; dev is `ai-studio-030e1ee1-7e1d-4208-beda-28735bc1a360`).
 *
 * What it will not do:
 *   - run in CI (`CI` or `GITHUB_ACTIONS` set) — it holds production keys;
 *   - write without `--apply` **and** `BYOK_REKEY_CONFIRM` equal to the target
 *     database id, so the confirmation names what is about to change;
 *   - print a key, a ciphertext or an account id — only counts;
 *   - overwrite a record that changed since it was read (the owner saved a new
 *     key in the meantime): that record is skipped and counted;
 *   - keep a record it cannot read back: every re-sealed record is read again
 *     and opened with the new key, and restored to its old form if the result
 *     differs from what was sealed.
 *
 * Exit code 0 when every record is (now) current, 1 when any record failed or
 * was left behind, 2 when it refused to run.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import {
  BYOK_KEY_VERSION,
  BYOK_LEGACY_KEY_VERSION,
  byokEncryptionConfigured,
  byokRecordVersion,
  openByokSecret,
  sealByokSecret,
} from '../lib/byok-key';

const PROJECT_ID = 'cleancore-491216';
const DATABASE_ID = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || 'clean-core-eu';
const APPLY = process.argv.includes('--apply');
const flagValue = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next && !next.startsWith('--') ? next : undefined;
};
const ONLY_UID = flagValue('uid');

function refuse(message: string): never {
  console.error(`REFUSED: ${message}`);
  process.exit(2);
}

interface Counts {
  records: number;
  current: number;
  legacy: number;
  otherVersion: number;
  legacyReadable: number;
  legacyUnreadable: number;
  resealed: number;
  skippedChanged: number;
  failedReadBack: number;
  failedWrite: number;
}

async function main() {
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    refuse('this script holds production keys and does not run in CI.');
  }
  const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
  const target = emulator ? `emulator ${process.env.FIRESTORE_EMULATOR_HOST}, database ${DATABASE_ID}` : `project ${PROJECT_ID}, database ${DATABASE_ID}`;
  console.log(`target       : ${target}`);
  console.log(`mode         : ${APPLY ? 'APPLY' : 'dry run (nothing is written)'}${ONLY_UID ? ', one account' : ''}`);
  console.log(`S4 key       : ${process.env.S4_ENCRYPTION_KEY ? 'set' : 'NOT SET'}`);
  console.log(`BYOK key     : ${byokEncryptionConfigured() ? 'set, 32 bytes' : 'NOT SET or not 32 bytes'}`);

  if (APPLY) {
    if (!byokEncryptionConfigured()) refuse('BYOK_ENCRYPTION_KEY is not set or does not decode to 32 bytes.');
    if (!process.env.S4_ENCRYPTION_KEY) refuse('S4_ENCRYPTION_KEY is not set, so no version-0 record can be opened.');
    if (process.env.BYOK_REKEY_CONFIRM !== DATABASE_ID) {
      refuse(`--apply needs BYOK_REKEY_CONFIRM set to the target database id (${DATABASE_ID}).`);
    }
  }

  if (!getApps().length) {
    initializeApp(emulator ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID });
  }
  const db = getFirestore(getApps()[0], DATABASE_ID);

  const accounts: DocumentReference[] = ONLY_UID
    ? [db.collection('user_secrets').doc(ONLY_UID)]
    : await db.collection('user_secrets').listDocuments();

  const c: Counts = {
    records: 0, current: 0, legacy: 0, otherVersion: 0, legacyReadable: 0, legacyUnreadable: 0,
    resealed: 0, skippedChanged: 0, failedReadBack: 0, failedWrite: 0,
  };

  for (const account of accounts) {
    const uid = account.id;
    const providers = await account.collection('providers').get();
    for (const doc of providers.docs) {
      const data = doc.data() as { encryptedApiKey?: unknown; keyVersion?: unknown };
      if (typeof data.encryptedApiKey !== 'string' || !data.encryptedApiKey) continue;
      c.records++;
      const version = byokRecordVersion(data);
      if (version === BYOK_KEY_VERSION) { c.current++; continue; }
      if (version !== BYOK_LEGACY_KEY_VERSION) { c.otherVersion++; continue; }
      c.legacy++;

      const where = { uid, provider: doc.id };
      let plaintext: string;
      try {
        plaintext = openByokSecret({ encryptedApiKey: data.encryptedApiKey }, where);
        c.legacyReadable++;
      } catch {
        c.legacyUnreadable++;
        continue;
      }
      if (!APPLY) continue;

      const old = data.encryptedApiKey;
      const sealed = sealByokSecret(plaintext, where);
      let written = false;
      try {
        written = await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          const now = fresh.data() as { encryptedApiKey?: unknown; keyVersion?: unknown } | undefined;
          // Changed since it was read — the owner saved or deleted a key. Their
          // new record was written by the app, under the new key; leave it.
          if (!now || now.encryptedApiKey !== old || byokRecordVersion(now) !== BYOK_LEGACY_KEY_VERSION) return false;
          tx.update(doc.ref, {
            encryptedApiKey: sealed.encryptedApiKey,
            keyVersion: sealed.keyVersion,
            rekeyedAt: FieldValue.serverTimestamp(),
          });
          return true;
        });
      } catch {
        c.failedWrite++;
        continue;
      }
      if (!written) { c.skippedChanged++; continue; }

      // Read back and open with the new key. A record that does not give back
      // exactly what was sealed goes back to its old form — the app still reads
      // version 0 — rather than stay unreadable.
      let ok = false;
      try {
        const back = (await doc.ref.get()).data() as { encryptedApiKey: string; keyVersion?: unknown };
        ok = byokRecordVersion(back) === BYOK_KEY_VERSION && openByokSecret(back, where) === plaintext;
      } catch {
        ok = false;
      }
      if (ok) { c.resealed++; continue; }
      c.failedReadBack++;
      try {
        await db.runTransaction(async (tx) => {
          const fresh = await tx.get(doc.ref);
          if (fresh.data()?.encryptedApiKey !== sealed.encryptedApiKey) return;
          tx.update(doc.ref, { encryptedApiKey: old, keyVersion: FieldValue.delete(), rekeyedAt: FieldValue.delete() });
        });
      } catch {
        c.failedWrite++;
      }
    }
  }

  console.log(`records      : ${c.records}`);
  console.log(`  current (v${BYOK_KEY_VERSION}) : ${c.current}`);
  console.log(`  legacy  (v0) : ${c.legacy} — readable ${c.legacyReadable}, unreadable ${c.legacyUnreadable}`);
  if (c.otherVersion) console.log(`  other version: ${c.otherVersion}`);
  if (APPLY) {
    console.log(`re-sealed    : ${c.resealed}`);
    console.log(`skipped      : ${c.skippedChanged} (changed while running — already written by the app)`);
    console.log(`failed       : ${c.failedReadBack} read-back (restored to v0), ${c.failedWrite} write`);
  } else {
    console.log('DRY RUN — nothing changed. Re-run with --apply and BYOK_REKEY_CONFIRM to re-seal.');
  }

  const leftBehind = APPLY
    ? c.legacyUnreadable + c.failedReadBack + c.failedWrite + c.otherVersion
    : 0;
  process.exit(leftBehind > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  // The class only — an error here can quote a document.
  console.error(`FAILED: ${err instanceof Error ? err.name : typeof err}`);
  process.exit(1);
});
