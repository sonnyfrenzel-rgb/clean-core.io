import { initializeApp, getApps, cert, type ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

/**
 * Singleton Firebase Admin SDK initialisation.
 * 
 * In production (Vercel), uses GOOGLE_APPLICATION_CREDENTIALS or
 * FIREBASE_SERVICE_ACCOUNT_KEY env var.
 * Falls back to Application Default Credentials (ADC) for local dev.
 */
function ensureInitialized() {
  if (getApps().length > 0) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountJson) {
    try {
      const serviceAccount: ServiceAccount = JSON.parse(serviceAccountJson);
      initializeApp({ credential: cert(serviceAccount) });
      return;
    } catch {
      console.warn('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to ADC.');
    }
  }

  // Fallback: Application Default Credentials (gcloud auth)
  initializeApp();
}

ensureInitialized();

/**
 * Verify a Firebase ID token from the client.
 * Returns the decoded token or throws.
 */
export async function verifyIdToken(idToken: string) {
  ensureInitialized();
  return getAuth().verifyIdToken(idToken);
}

/**
 * Extract and verify the Bearer token from request headers.
 * Returns the decoded token or null if missing/invalid.
 */
export async function verifyRequestAuth(req: Request) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  if (!token) return null;

  try {
    return await verifyIdToken(token);
  } catch {
    return null;
  }
}
