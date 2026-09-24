import { assertS4TenantAccess, getAdminDb } from '@/lib/firebase-admin';
import { loadS4ConfigForUser } from '@/lib/s4-credentials';
import { safeFetch } from '@/lib/url-validation';
import { verifyGoogleIdToken } from '@/lib/google-id-token';
import { capabilityKeyFromEnv } from '@/lib/s4-proxy-capability';
import { admitProxyRequest } from '@/lib/s4-proxy-capability-store';
import { handleS4ProxyRequest, readS4ProxyConfig, type S4ProxyDeps } from '@/lib/s4-proxy';
import { logger } from '@/lib/logger';

/**
 * GET|HEAD /api/s4-proxy/{capability}/sap/…
 *
 * The credential proxy of live test runs (roadmap 8.9). Called by the isolated
 * live runner's relay and by nothing else: every request needs a Google ID
 * token of `RUNNER_SERVICE_ACCOUNT` for this app's audience **and** the
 * capability `/api/run-tests` minted for one running test run. No Firebase user
 * token reaches this route — the user's session, second factor and tenant
 * approval were checked when the run was started, and the approval is checked
 * again here on every request (`assertS4TenantAccess`).
 *
 * The whole decision is `lib/s4-proxy.ts`; this file only wires it to
 * Firestore, the credential vault and the SSRF-safe fetch.
 */

export const dynamic = 'force-dynamic';

function deps(): S4ProxyDeps {
  return {
    config: readS4ProxyConfig(),
    verifyIdToken: (token, expected) => verifyGoogleIdToken(token, expected),
    capabilityKey: () => capabilityKeyFromEnv(),
    admit: async (claims) => {
      const { db } = await getAdminDb();
      return admitProxyRequest(db, claims);
    },
    assertTenantAccess: (uid) => assertS4TenantAccess(uid),
    loadConnection: (uid) => loadS4ConfigForUser(uid),
    // No redirect is followed: `safeFetch` with zero hops refuses a 3xx with a
    // location, and it re-checks the SSRF allowlist and pins the resolved IP.
    forward: (url, init) => safeFetch(url, init, 0),
    now: () => Date.now(),
    log: (message, fields) => logger.info(message, { route: 'api/s4-proxy', ...fields }),
  };
}

type Ctx = { params: Promise<{ capability: string; path: string[] }> };

export async function GET(req: Request, ctx: Ctx) {
  return handleS4ProxyRequest(req, await ctx.params, deps());
}

export async function HEAD(req: Request, ctx: Ctx) {
  return handleS4ProxyRequest(req, await ctx.params, deps());
}
