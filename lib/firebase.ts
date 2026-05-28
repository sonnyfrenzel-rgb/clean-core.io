import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth as firebaseGetAuth, Auth } from 'firebase/auth';
import { initializeFirestore, Firestore, doc, getDocFromServer, setLogLevel } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Set Firestore log level to silent to reduce noise
setLogLevel('silent');

let app: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;

// Suppress transient Firestore stream errors that are common in iframe/proxy environments
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  const originalError = console.error;

  console.warn = (...args: any[]) => {
    const message = args.map(String).join(' ');
    if (message.includes('CANCELLED') || 
        message.includes('Disconnecting idle stream') ||
        message.includes('Timed out waiting for new targets')) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    const message = args.map(String).join(' ');
    if (message.includes('CANCELLED') || 
        message.includes('Disconnecting idle stream') ||
        message.includes('Timed out waiting for new targets')) {
      return;
    }
    originalError.apply(console, args);
  };
}

export function getFirebaseApps() {
    if (!app) {
        app = initializeApp(firebaseConfig);
    }
    return app;
}

export function getDb(): Firestore {
    if (!dbInstance) {
        const dbId = process.env.NEXT_PUBLIC_FIRESTORE_DB_ID || firebaseConfig.firestoreDatabaseId;
        dbInstance = initializeFirestore(getFirebaseApps(), {
            experimentalForceLongPolling: true,
            useFetchStreams: false,
        }, dbId);
    }
    return dbInstance;
}

export function getAuth(): Auth {
    if (!authInstance) {
        authInstance = firebaseGetAuth(getFirebaseApps());
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

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
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
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
