import crypto from 'crypto';
import { FIRESTORE_DB_ID } from '@/lib/constants';

// ── Envelope-/symmetrische Verschlüsselung (AES-256-GCM) ────────────────────
// Schlüssel als 32-Byte base64 in S4_ENCRYPTION_KEY (Secret Manager / Env).
// Erzeugen: `openssl rand -base64 32`  oder  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const MIN_PAYLOAD_LENGTH = IV_LENGTH + TAG_LENGTH + 1;

function getKey(): Buffer {
  const b64 = process.env.S4_ENCRYPTION_KEY;
  if (!b64) throw new Error('S4_ENCRYPTION_KEY is not configured.');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('S4_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv, { authTagLength: TAG_LENGTH });
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Layout: iv(12) | tag(16) | ciphertext
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < MIN_PAYLOAD_LENGTH) {
    throw new Error('Invalid encrypted payload.');
  }

  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ct = raw.subarray(IV_LENGTH + TAG_LENGTH);

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH || ct.length === 0) {
    throw new Error('Invalid encrypted payload.');
  }

  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ── Admin-Firestore-Handle (server-only) ────────────────────────────────────
let adminAppModule: any = null;
let adminFirestoreModule: any = null;

async function getAdminDb() {
  if (!adminAppModule) adminAppModule = await import('firebase-admin/app');
  if (!adminFirestoreModule) adminFirestoreModule = await import('firebase-admin/firestore');
  
  const isEmulatorMode = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  if (isEmulatorMode) {
    if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    }
    if (!process.env.FIRESTORE_EMULATOR_HOST) {
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    }
  }

  if (adminAppModule.getApps().length === 0) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (sa && !isEmulatorMode) {
      adminAppModule.initializeApp({ credential: adminAppModule.cert(JSON.parse(sa)) });
    } else {
      adminAppModule.initializeApp({ projectId: 'cleancore-491216' });
    }
  }
  const app = adminAppModule.getApps()[0];
  return {
    db: adminFirestoreModule.getFirestore(app, FIRESTORE_DB_ID),
    FieldValue: adminFirestoreModule.FieldValue,
  };
}

// ── Typen ───────────────────────────────────────────────────────────────────
export interface S4ConfigInput {
  url: string;
  username?: string;
  password?: string;
  authType: 'basic' | 'oauth2' | 'sap_hub' | 'btp_destination' | 'none';
  tokenUrl?: string;
  btpDestinationJson?: string;
}

/** Vollständige Config inkl. entschlüsselter Secrets — NUR serverseitig verwenden. */
export type S4ConfigResolved = S4ConfigInput;

/** Nicht-geheime Metadaten für UI/Profil. */
export interface S4Meta {
  configured: boolean;
  url: string;
  username: string;
  authType: string;
  tokenUrl: string;
}

// ── Speichern (verschlüsselt, server-only Collection) ───────────────────────
export async function saveS4Credentials(uid: string, cfg: S4ConfigInput): Promise<S4Meta> {
  if (!cfg.url || !/^https:\/\//i.test(cfg.url)) {
    throw new Error('S/4HANA URL must use HTTPS.');
  }
  const { db, FieldValue } = await getAdminDb();

  const secretBundle = JSON.stringify({
    password: cfg.password || '',
    btpDestinationJson: cfg.btpDestinationJson || '',
  });

  await db.collection('s4_credentials').doc(uid).set({
    url: cfg.url,
    username: cfg.username || '',
    authType: cfg.authType,
    tokenUrl: cfg.tokenUrl || '',
    secretEnc: encrypt(secretBundle),
    updatedAt: FieldValue.serverTimestamp(),
  });

  // Nur nicht-geheime Metadaten ins (client-lesbare) Profil; Klartext-Feld entfernen.
  await db.collection('users').doc(uid).set(
    {
      s4Meta: {
        configured: true,
        url: cfg.url,
        username: cfg.username || '',
        authType: cfg.authType,
        tokenUrl: cfg.tokenUrl || '',
      },
      s4Config: FieldValue.delete(), // Alt-Klartext entfernen
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return {
    configured: true,
    url: cfg.url,
    username: cfg.username || '',
    authType: cfg.authType,
    tokenUrl: cfg.tokenUrl || '',
  };
}

/** Server-seitiges Laden inkl. Entschlüsselung. Gibt null zurück, wenn nicht konfiguriert. */
export async function loadS4ConfigForUser(uid: string): Promise<S4ConfigResolved | null> {
  const { db } = await getAdminDb();
  const snap = await db.collection('s4_credentials').doc(uid).get();
  if (!snap.exists) return null;
  const d = snap.data();
  let password = '';
  let btpDestinationJson = '';
  try {
    const secrets = JSON.parse(decrypt(d.secretEnc));
    password = secrets.password || '';
    btpDestinationJson = secrets.btpDestinationJson || '';
  } catch {
    throw new Error('Stored S/4 credentials could not be decrypted (key mismatch?).');
  }
  return {
    url: d.url,
    username: d.username || '',
    password,
    authType: d.authType,
    tokenUrl: d.tokenUrl || '',
    btpDestinationJson,
  };
}

/** Löschen (GDPR-Erasure / Disconnect). */
export async function deleteS4Credentials(uid: string): Promise<void> {
  const { db, FieldValue } = await getAdminDb();
  await db.collection('s4_credentials').doc(uid).delete().catch(() => {});
  await db.collection('users').doc(uid).set(
    { s4Meta: FieldValue.delete(), s4Config: FieldValue.delete() },
    { merge: true },
  ).catch(() => {});
}
