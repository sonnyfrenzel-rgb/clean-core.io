import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth as firebaseGetAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, Firestore, doc, getDocFromServer, setLogLevel, connectFirestoreEmulator } from 'firebase/firestore';
import firebaseConfig from '../firebase-config.json';

// F-09: Firestore SDK noise is silenced via the SDK's own logger below.
// Transient stream errors ("CANCELLED", "Disconnecting idle stream", ...) are
// filtered at the point they are handled (see handleFirestoreError), instead of
// globally overriding console.warn/console.error — which previously swallowed
// unrelated warnings/errors app-wide and hurt observability.
setLogLevel('silent');

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

export function getFirebaseApps() {
    if (!app) {
        app = initializeApp(firebaseConfig);
    }
    return app;
}

export function getDb(): Firestore {
    if (typeof window === 'undefined') {
        return null as any;
    }
    if (!dbInstance) {
        const dbId = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || firebaseConfig.firestoreDatabaseId;

        // Enable experimentalForceLongPolling on both client and server to prevent Node.js SSR event loop hangs
        const firestoreSettings = {
            experimentalForceLongPolling: true,
        };

        dbInstance = initializeFirestore(getFirebaseApps(), firestoreSettings, dbId);

        if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
            const host = '127.0.0.1';
            console.log(`[FIREBASE] Connecting Firestore to emulator on ${host}:8080...`);
            try {
                connectFirestoreEmulator(dbInstance, host, 8080);
            } catch (err) {
                console.warn('[FIREBASE] Firestore emulator connection warning/already connected:', err);
            }
        }
    }
    return dbInstance;
}

export function getAuth(): Auth {
    if (typeof window === 'undefined') {
        return null as any;
    }
    if (!authInstance) {
        authInstance = firebaseGetAuth(getFirebaseApps());
        if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
            const host = '127.0.0.1';
            console.log(`[FIREBASE] Connecting Auth to emulator on ${host}:9099...`);
            try {
                connectAuthEmulator(authInstance, `http://${host}:9099`, { disableWarnings: true });
            } catch (err) {
                console.warn('[FIREBASE] Auth emulator connection warning/already connected:', err);
            }
        }
    }
    return authInstance;
}

// Validate Connection to Firestore
export async function testConnection() {
  try {
    await getDocFromServer(doc(getDb(), 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. The client is offline.");
    }
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * What a Firestore failure is allowed to say about who hit it.
 *
 * It used to carry the signed-in account's e-mail address, every linked
 * provider's display name, e-mail and photo URL, and the tenant id — into
 * `console.error` **and** into the `Error.message` that `ErrorBoundary.tsx`
 * then renders on screen. A support screenshot of a failed save therefore
 * carried the person's identity, and so did any browser log shipped anywhere
 * (security audit of v2.14.0, SEC-2026-352; GDPR Art. 5(1)(c) data
 * minimisation).
 *
 * What debugging actually needs from the account is whether someone was signed
 * in and whether the token was verified — which uid, which address and which
 * provider identities do not change what the reader does next. The uid stays:
 * it is the key the server logs use, and it is not a person's name.
 */
interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    signedIn: boolean;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    providerIds: string[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const message = error instanceof Error ? error.message : String(error);

  // Ignore "Cancelled" errors as they are often transient stream disconnects
  if (message.toLowerCase().includes('cancelled') || message.toLowerCase().includes('disconnecting idle stream')) {
    console.warn('Firestore transient error ignored:', message);
    return;
  }

  const auth = getAuth();
  const errInfo: FirestoreErrorInfo = {
    error: message,
    authInfo: {
      userId: auth.currentUser?.uid,
      signedIn: !!auth.currentUser,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      // Which provider, not which identity at that provider.
      providerIds: auth.currentUser?.providerData.map((provider) => provider.providerId) || [],
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
