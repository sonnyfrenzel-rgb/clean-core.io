let adminAppModule: any = null;
let adminAuthModule: any = null;

async function ensureInitialized() {
  if (!adminAppModule) {
    adminAppModule = await import('firebase-admin/app');
    adminAuthModule = await import('firebase-admin/auth');
  }

  if (adminAppModule.getApps().length > 0) return;

  // Connect Admin SDK to Auth emulator in test/dev mode
  const isEmulatorMode = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true';
  if (isEmulatorMode && !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      adminAppModule.initializeApp({ credential: adminAppModule.cert(serviceAccount) });
      return;
    } catch {
      console.warn('[firebase-admin] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to ADC.');
    }
  }

  if (isEmulatorMode) {
    // In emulator mode without service account (CI), init with just projectId
    adminAppModule.initializeApp({ projectId: 'cleancore-491216' });
    return;
  }

  // Fallback: Application Default Credentials (gcloud auth)
  adminAppModule.initializeApp();
}

/**
 * Verify a Firebase ID token from the client.
 * Returns the decoded token or throws.
 */
export async function verifyIdToken(idToken: string) {
  await ensureInitialized();
  return adminAuthModule.getAuth().verifyIdToken(idToken);
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
