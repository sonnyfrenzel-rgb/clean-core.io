/**
 * Turns on TOTP multi-factor authentication for the Firebase project — once,
 * after the project has been upgraded to Firebase Authentication with Identity
 * Platform in the console (Authentication → Settings → Upgrade). There is no
 * console switch for TOTP; the provider is enabled through the Admin SDK.
 *
 * Usage:
 *   npx tsx scripts/mfa-enable-totp.ts            # shows the current config
 *   npx tsx scripts/mfa-enable-totp.ts --apply    # enables TOTP (adjacent intervals: 5)
 *
 * Needs Application Default Credentials for cleancore-491216 (`gcloud auth
 * application-default login`), the same as the other scripts here.
 */

import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = 'cleancore-491216';
const APPLY = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const manager = getAuth().projectConfigManager();

  const before = await manager.getProjectConfig();
  console.log('current multi-factor config:', JSON.stringify(before.multiFactorConfig ?? null, null, 2));

  if (!APPLY) {
    console.log('DRY RUN — nothing changed. Re-run with --apply to enable TOTP.');
    return;
  }

  const after = await manager.updateProjectConfig({
    multiFactorConfig: {
      state: 'ENABLED',
      providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }],
    },
  });
  console.log('multi-factor config now:', JSON.stringify(after.multiFactorConfig ?? null, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
