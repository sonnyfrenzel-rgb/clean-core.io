import { safeFetch, SsrfError, isSafeODataServicePath } from './url-validation';

/**
 * The connection test against a user's S/4HANA system — what it requests and
 * what it says about the answer (`POST /api/test-s4-connection`).
 *
 * Owner decision 17.10.2026 (data protection): testing a connection reads no
 * business record. The test proves three things and nothing more — the host is
 * reachable, the credentials are accepted, the OData service exists — and it
 * does so with the one request in OData V2 that by definition carries no
 * entity data: the service's `$metadata` document, which describes entity
 * types and their properties and holds no rows.
 *
 * It used to send HEAD (and, on refusal, GET) to the saved URL exactly as typed.
 * The form asks for a system address, but nothing stopped that address from
 * naming an entity set — `…/API_BUSINESS_PARTNER/A_BusinessPartner?$top=1` — and
 * a Gateway answers HEAD by running the read and dropping the body, the GET
 * fallback by sending it. The body was cancelled unread, so nothing reached the
 * log, Firestore or the browser, but the tenant still read records for a
 * request whose only purpose was to say "connected". Now the address is reduced
 * to its origin and a plain path prefix, the query and fragment are dropped, a
 * service named in it is cut to `/sap/opu/odata/{namespace}/{service}`, and the
 * request is one GET on that service's `$metadata` — nothing else is ever built.
 *
 * Reading records stays a separate, explicitly started action
 * (`/api/test-s4-odata-read`, "Read one record from the tenant"), behind the
 * same tenant-access gate; it is not part of this test.
 */

/** The service checked when the saved address names none — the siblings' default too. */
export const DEFAULT_PROBE_SERVICE_PATH = '/sap/opu/odata/sap/API_BUSINESS_PARTNER';

const ODATA_V2_ROOT = '/sap/opu/odata/';

/** A path prefix in front of the OData root, such as `/s4hanacloud` on the API Hub sandbox. */
const PLAIN_PREFIX = /^(\/[A-Za-z0-9._~-]+)*$/;

export type ProbeTarget =
  | { ok: true; probeUrl: string; servicePath: string }
  | { ok: false; reason: string };

/**
 * The one URL the connection test requests: `{origin}{prefix}{servicePath}/$metadata`.
 *
 * - The query and the fragment of the saved address are dropped — `$top`,
 *   `$filter` or a key never travel.
 * - A path that contains `/sap/opu/odata/` keeps exactly the namespace and the
 *   service segment after it; whatever follows (an entity set, a key, a
 *   navigation) is discarded.
 * - Any other path is kept only as a plain prefix (letters, digits, `._~-`);
 *   one that names another OData root (`odata4`, `$`, parentheses) is refused
 *   rather than guessed at.
 */
export function connectionProbeTarget(rawUrl: string): ProbeTarget {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { ok: false, reason: 'The system address is not a valid URL.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, reason: 'The system address must use HTTPS.' };
  }

  const path = u.pathname.replace(/\/+$/, '');
  let prefix = path;
  let servicePath = DEFAULT_PROBE_SERVICE_PATH;

  const at = (path + '/').toLowerCase().indexOf(ODATA_V2_ROOT);
  if (at !== -1) {
    prefix = path.slice(0, at);
    const rest = path.slice(at + ODATA_V2_ROOT.length).split('/').filter(Boolean);
    if (rest.length < 2) {
      return { ok: false, reason: 'The system address names an OData root without a service. Enter the system address only, or a full service path (/sap/opu/odata/{namespace}/{service}).' };
    }
    servicePath = `${ODATA_V2_ROOT}${rest[0]}/${rest[1]}`;
  }

  if (!PLAIN_PREFIX.test(prefix) || prefix.split('/').includes('..') || /odata/i.test(prefix)) {
    return { ok: false, reason: 'The system address has a path the connection test cannot use. Enter the system address only (for example https://my000000-api.s4hana.cloud.sap).' };
  }
  if (!isSafeODataServicePath(servicePath)) {
    return { ok: false, reason: 'The OData service named in the system address cannot be tested. Enter the system address only.' };
  }

  return { ok: true, probeUrl: `${u.origin}${prefix}${servicePath}/$metadata`, servicePath };
}

/** The `fetch` the probe uses — `safeFetch` in the route, a mock in the spec. */
export type ProbeFetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The sentence the caller gets for a failed request: a network error code such
 * as ECONNREFUSED or ENOTFOUND when the error carries one, the application's own
 * SsrfError wording, and otherwise nothing of the error's text.
 */
export function connectionFailure(err: unknown): string {
  if (err instanceof SsrfError) return err.message;
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.cause?.code ?? e?.code;
  const shown = typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? ` (${code})` : '';
  return `Connection failed${shown}. Verify the URL, network configuration, and firewall rules.`;
}

const TIMED_OUT = 'Connection timed out after 15 seconds. Verify the URL is correct and the system is reachable.';

/**
 * Requests the service's `$metadata` with one GET and returns the status — never the body.
 *
 * GET on `<service-root>/$metadata` (owner specification 17.10.2026): the
 * document is schema only, every SAP Gateway serves it to GET, and a 200
 * confirms both authentication and the authorisation for the service. No HEAD
 * with a fallback, no CSRF-token fetch, no `$top`, no `$count` — a count is
 * not a row but it is still information from the system. The body is cancelled
 * unread while the deadline is still armed, so a slow or streaming answer
 * cannot hold the connection, and no byte of it reaches a log, Firestore or the
 * browser.
 */
export async function probeService(
  probeUrl: string,
  headers: Record<string, string>,
  fetchImpl: ProbeFetch = safeFetch,
): Promise<{ httpStatus: number }> {
  // $metadata is an XML document; a Gateway may refuse it under Accept: json.
  const probeHeaders = { ...headers, Accept: 'application/xml' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  let response: Response;
  try {
    response = await fetchImpl(probeUrl, {
      method: 'GET',
      headers: probeHeaders,
      signal: controller.signal,
    });
  } catch (getError: unknown) {
    clearTimeout(timeout);
    if ((getError as { name?: string } | null)?.name === 'AbortError') throw new Error(TIMED_OUT);
    // An SSRF refusal is the application's own wording and stays a refusal.
    if (getError instanceof SsrfError) throw getError;
    throw new Error(connectionFailure(getError));
  }

  // Only the status is used. Cancelled while the deadline still runs (QA full
  // review of fc787674705f, b8dfbd24e73a).
  await response.body?.cancel().catch(() => {});
  clearTimeout(timeout);
  return { httpStatus: response.status };
}

export interface ProbeVerdict {
  status: 'connected' | 'failed';
  message: string;
  httpStatus: number;
  /** What the test established. `recordsRead` is always false: it reads none. */
  checked: {
    reachable: boolean;
    signedIn: boolean | null;
    serviceFound: boolean;
    servicePath: string;
    recordsRead: false;
  };
}

/**
 * What the status means, in the words the interface shows. The 401 and
 * 5xx answers keep the verdicts they had before (a rejected credential is
 * "reachable, credentials rejected", a 5xx is a failure); a 403 (access refused) and a redirect fail; what is new is that
 * every answer says which service was checked and that no record was read.
 */
export function describeProbeStatus(httpStatus: number, authMethod: string, servicePath: string): ProbeVerdict {
  const authLabel = authMethod === 'oauth2'
    ? 'OAuth 2.0 Bearer Token'
    : authMethod === 'basic'
      ? 'Basic Auth'
      : authMethod === 'sap_hub'
        ? 'SAP API Hub Key'
        : 'No Auth (reachability only)';
  const anonymous = !['oauth2', 'basic', 'sap_hub'].includes(authMethod);
  const service = servicePath.split('/').filter(Boolean).pop() || servicePath;
  const noRecord = 'No record was read.';
  const checked = (reachable: boolean, signedIn: boolean | null, serviceFound: boolean) => ({
    reachable, signedIn, serviceFound, servicePath, recordsRead: false as const,
  });

  if (httpStatus >= 200 && httpStatus < 300) {
    return {
      status: 'connected',
      message: anonymous
        ? `Reachable, service ${service} found — no credential was sent. Checked: the service description ($metadata, schema only) answered HTTP ${httpStatus}. ${noRecord}`
        : `Reachable, signed in via ${authLabel}, service ${service} found and authorised. Checked: the service description ($metadata, schema only) answered HTTP ${httpStatus}. ${noRecord}`,
      httpStatus,
      checked: checked(true, anonymous ? null : true, true),
    };
  }
  // A redirect (often to a login page) confirms nothing about the service, so it is no "connected" (QA review of
  // 33d378a056fd); a 403 is a refused access, not a rejected credential — the user may be signed in without the
  // authorisation for this service.
  if (httpStatus >= 300 && httpStatus < 400) {
    return {
      status: 'failed',
      message: `Endpoint reachable (HTTP ${httpStatus}) via ${authLabel}, but it redirected instead of describing service ${service} — the service was not confirmed. ${noRecord}`,
      httpStatus,
      checked: checked(true, null, false),
    };
  }
  if (httpStatus === 403) {
    return {
      status: 'failed',
      message: `Endpoint reachable (HTTP 403) via ${authLabel}, but access to service ${service} was forbidden — check that the service is part of your communication arrangement and that the user is authorised for it. ${noRecord}`,
      httpStatus,
      checked: checked(true, null, false),
    };
  }
  if (httpStatus === 401) {
    return {
      status: 'connected',
      message: `Endpoint reachable (HTTP ${httpStatus}) via ${authLabel}. Authentication credentials were rejected — verify your credentials. ${noRecord}`,
      httpStatus,
      checked: checked(true, false, false),
    };
  }
  if (httpStatus === 404) {
    return {
      status: 'failed',
      message: `Endpoint returned HTTP 404 (Not Found): service ${service} was not found at ${servicePath}. Verify the system address and that the service is part of your communication arrangement. ${noRecord}`,
      httpStatus,
      checked: checked(true, null, false),
    };
  }
  if (httpStatus >= 500) {
    return {
      status: 'failed',
      message: `S/4HANA system returned a server error (HTTP ${httpStatus}). The system may be undergoing maintenance. ${noRecord}`,
      httpStatus,
      checked: checked(true, null, false),
    };
  }
  return {
    status: 'failed',
    message: `Unexpected response: HTTP ${httpStatus}. ${noRecord}`,
    httpStatus,
    checked: checked(true, null, false),
  };
}
