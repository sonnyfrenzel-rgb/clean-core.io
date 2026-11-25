/**
 * Who may reach the MCP beta (docs/design/mcp-beta.md): nobody, unless
 *
 *   - `MCP_BETA_KEY` is set and at least {@link MIN_KEY_LENGTH} characters long, and
 *   - the deployment is not production — by service name (`K_SERVICE`), by
 *     database (`NEXT_PUBLIC_FIRESTORE_DB_ID`) or by public URL
 *     (`NEXT_PUBLIC_APP_URL`), the same markers `lib/dev-limits.ts` reads. Any
 *     one of them is enough to keep the route off, so the key reaching the
 *     production service by mistake does not open it;
 *
 * and the caller presents that key — as the last path segment of the connector
 * URL, or as `Authorization: Bearer <key>`. Compared in constant time; never
 * logged.
 */
import crypto from 'crypto';

type Env = Readonly<Record<string, string | undefined>>;

export const MIN_KEY_LENGTH = 32;

const PRODUCTION_SERVICE = 'clean-core';
const PRODUCTION_DB = 'clean-core-eu';
const PRODUCTION_URL = 'https://clean-core.io';

/** The server's own environment, with the build-time values Next inlines read by name. */
function serverEnv(): Env {
  return {
    MCP_BETA_KEY: process.env.MCP_BETA_KEY,
    K_SERVICE: process.env.K_SERVICE,
    NEXT_PUBLIC_FIRESTORE_DB_ID: process.env.NEXT_PUBLIC_FIRESTORE_DB_ID,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
}

export function isProductionDeployment(env: Env = serverEnv()): boolean {
  return (
    env.K_SERVICE === PRODUCTION_SERVICE ||
    env.NEXT_PUBLIC_FIRESTORE_DB_ID === PRODUCTION_DB ||
    (env.NEXT_PUBLIC_APP_URL || '').replace(/\/+$/, '') === PRODUCTION_URL
  );
}

/** The key the beta is open with, or null when the beta is off here. */
export function betaKey(env: Env = serverEnv()): string | null {
  const key = env.MCP_BETA_KEY;
  if (!key || key.length < MIN_KEY_LENGTH) return null;
  if (isProductionDeployment(env)) return null;
  return key;
}

/** Constant-time comparison of a presented key with the configured one (both hashed first, so lengths do not leak). */
export function keyMatches(presented: string | null | undefined, expected: string): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  const a = crypto.createHash('sha256').update(presented, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/** The key a request presents: the path segment when the route has one, else a Bearer token. */
export function presentedKey(authorization: string | null, pathKey: string | null): string | null {
  if (pathKey) return pathKey;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(authorization || '');
  return m ? m[1] : null;
}

/** The size of a source as a bucket — what the log records instead of the size, the name or the text. */
export function sizeBucket(bytes: number | undefined): string | undefined {
  if (bytes === undefined) return undefined;
  if (bytes < 4 * 1024) return '<4KB';
  if (bytes < 32 * 1024) return '4-32KB';
  if (bytes < 128 * 1024) return '32-128KB';
  if (bytes <= 256 * 1024) return '128-256KB';
  return '>256KB';
}
