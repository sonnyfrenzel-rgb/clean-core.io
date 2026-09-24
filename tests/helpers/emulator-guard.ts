import { connectAuthEmulator, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, type Firestore } from 'firebase/firestore';

/**
 * Fail-closed guard for specs that drive the client Firebase SDK.
 *
 * `firebase-config.json` names the real project. A spec that connected to the
 * emulators only `if (NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true')` and otherwise
 * carried on would create and sign in accounts against production whenever it
 * was run outside the Playwright config that sets the flag (QA review of
 * 81810c8026e0). These helpers throw instead: no flag, no Firebase call.
 */
export function requireEmulator(): void {
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR !== 'true') {
    throw new Error(
      'Refusing to run: NEXT_PUBLIC_USE_FIREBASE_EMULATOR is not "true". This spec drives the client ' +
        'Firebase SDK and must only ever talk to the local emulators, never the real project. ' +
        'Run it through playwright.config.ts, which sets the flag.',
    );
  }
}

/** Connects `auth` to the Auth emulator, or throws. Never returns an unconnected instance. */
export function connectAuthToEmulator(auth: Auth): Auth {
  requireEmulator();
  const host = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
  try {
    connectAuthEmulator(auth, `http://${host}`, { disableWarnings: true });
  } catch (err) {
    // "Already connected" is the one failure that is fine — and then the
    // emulator config is set. Anything else stops the spec.
    if (!auth.emulatorConfig) throw err;
  }
  if (!auth.emulatorConfig) {
    throw new Error('Auth is not connected to the emulator; refusing to continue.');
  }
  return auth;
}

/**
 * Password for accounts that exist only in the Auth emulator. Deliberately not
 * secret-looking: it protects nothing, because the account lives nowhere else.
 */
export const EMULATOR_PASSWORD = 'emulator-only-not-a-secret';

/**
 * A fresh address per run on a reserved, undeliverable TLD (RFC 2606), so no spec
 * ever signs in as, or collides with, a real-looking person. Admin rights come
 * from the `admin` custom claim and the `isAdmin` profile field the spec seeds,
 * never from the address.
 */
export function disposableEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@test.invalid`;
}

/**
 * Connects `db` to the Firestore emulator, or throws. The host comes from the
 * environment rather than being hard-coded: this machine can have more than one
 * emulator up, and a spec that reads a different database from the app under
 * test compares two unrelated states.
 */
export function connectFirestoreToEmulator(db: Firestore): Firestore {
  requireEmulator();
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  connectFirestoreEmulator(db, host || '127.0.0.1', Number(port) || 8080);
  return db;
}
