import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth as firebaseGetAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import firebaseConfig from '../firebase-config.json';

/**
 * The Firebase app and Auth instance, without Firestore.
 *
 * `lib/firebase.ts` re-exports both and adds Firestore; this module exists so a
 * page that only needs to know who is signed in — the public header, the
 * landing page's calls to action — does not download the Firestore SDK with
 * it. Firestore was ~150 kB of compressed JavaScript on the start page, loaded
 * before first paint, for a write that happens only when someone registers
 * (docs/perf/REPORT.md).
 *
 * There is one app and one Auth instance either way: `lib/firebase.ts` hands
 * out these same functions, so a page that imports both modules shares them.
 */

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;

export function getFirebaseApps() {
    if (!app) {
        app = initializeApp(firebaseConfig);
    }
    return app;
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
