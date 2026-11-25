/**
 * The HTTP half of the MCP beta (docs/design/mcp-beta.md): Streamable HTTP,
 * stateless. POST carries one JSON-RPC message and gets one JSON body back (or
 * 202 for a notification); GET and DELETE are 405, since this server offers no
 * stream and keeps no session.
 *
 * Order of the checks, each before anything more expensive:
 *   1. the beta is on here (`lib/mcp/access.ts`) and the key matches — else 404,
 *      the answer of a route that does not exist;
 *   2. a browser Origin other than this server's own — 403 (DNS rebinding);
 *   3. an `MCP-Protocol-Version` this server does not speak — 400 with a
 *      plain JSON-RPC error, which is how a client of a later revision learns
 *      to fall back to `initialize`;
 *   4. content type, then the body under a byte cap, then the JSON.
 * Only tool calls count against the global rate limit (60 an hour).
 *
 * Logged per request: method, tool, outcome, size bucket, duration. Never the
 * source, a file name, the key or an error's text.
 */
import { logger } from '../logger';
import { assertRateLimit } from '../rate-limit';
import { QuotaError } from '../firebase-admin';
import { betaKey, keyMatches, presentedKey, sizeBucket } from './access';
import { RPC, SUPPORTED_PROTOCOL_VERSIONS, ToolRefusal, handleMessage } from './protocol';

/** A source of 256 KiB, escaped as JSON, with room. */
export const MAX_BODY_BYTES = 1024 * 1024;
const BODY_TIMEOUT_MS = 20_000;

export const TOOL_CALLS_PER_HOUR = 60;

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...BASE_HEADERS, 'Content-Type': 'application/json', ...extra },
  });
}

function empty(status: number, extra: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { ...BASE_HEADERS, ...extra } });
}

function rpcError(code: number, message: string, status = 400): Response {
  return json({ jsonrpc: '2.0', id: null, error: { code, message } }, status);
}

class BodyTooLarge extends Error {}

/** The request body as text, cut off at {@link MAX_BODY_BYTES} whatever Content-Length claims. */
async function readBody(req: Request): Promise<string> {
  const declared = Number(req.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new BodyTooLarge();
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  const deadline = setTimeout(() => reader.cancel().catch(() => {}), BODY_TIMEOUT_MS);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(deadline);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

/** Null when the caller may proceed; otherwise the 404 every refusal of access looks like. */
function gate(req: Request, pathKey: string | null): Response | null {
  const key = betaKey();
  if (!key) return empty(404);
  if (!keyMatches(presentedKey(req.headers.get('authorization'), pathKey), key)) return empty(404);
  return null;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const own = new URL(req.url);
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || own.host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function logRequest(fields: { method: string; tool?: string; outcome: string; sourceBytes?: number; started: number; status: number }) {
  logger.info('mcp-beta', {
    route: 'api/mcp',
    method: fields.method,
    ...(fields.tool ? { tool: fields.tool } : {}),
    outcome: fields.outcome,
    ...(fields.sourceBytes !== undefined ? { size: sizeBucket(fields.sourceBytes) } : {}),
    status: fields.status,
    durationMs: Date.now() - fields.started,
  });
}

export async function handleMcpPost(req: Request, pathKey: string | null): Promise<Response> {
  const denied = gate(req, pathKey);
  if (denied) return denied;
  const started = Date.now();
  const done = (res: Response, method: string, outcome: string, extra: { tool?: string; sourceBytes?: number } = {}) => {
    logRequest({ method, outcome, started, status: res.status, ...extra });
    return res;
  };

  if (!sameOrigin(req)) return done(rpcError(RPC.INVALID_REQUEST, 'Requests from a browser origin are not accepted.', 403), '-', 'origin-refused');

  const version = req.headers.get('mcp-protocol-version');
  if (version && !(SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return done(
      rpcError(RPC.INVALID_REQUEST, `Unsupported protocol version. This server speaks ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')} and starts with initialize.`),
      '-',
      'protocol-version-refused',
    );
  }

  const contentType = req.headers.get('content-type') || '';
  if (!/^application\/json\b/i.test(contentType)) {
    return done(rpcError(RPC.INVALID_REQUEST, 'Content-Type must be application/json.', 415), '-', 'content-type-refused');
  }

  let raw: string;
  try {
    raw = await readBody(req);
  } catch (err) {
    if (err instanceof BodyTooLarge) {
      return done(rpcError(RPC.INVALID_REQUEST, `The request is larger than ${MAX_BODY_BYTES / 1024} KB. One call reads at most 256 KB of ABAP.`, 413), '-', 'body-too-large');
    }
    return done(rpcError(RPC.INVALID_REQUEST, 'The request body could not be read.'), '-', 'body-unreadable');
  }

  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return done(rpcError(RPC.PARSE_ERROR, 'Parse error: the body is not JSON.'), '-', 'parse-error');
  }
  if (Array.isArray(message)) {
    return done(rpcError(RPC.INVALID_REQUEST, 'Batches are not supported: send one JSON-RPC message per request.'), '-', 'batch-refused');
  }

  const result = await handleMessage(message, {
    beforeToolCall: async () => {
      try {
        await assertRateLimit('mcp-beta:tools-call', TOOL_CALLS_PER_HOUR, 60 * 60 * 1000, (s) =>
          `The beta allows ${TOOL_CALLS_PER_HOUR} tool calls an hour in total. Try again in ${s} seconds.`,
        );
      } catch (err) {
        if (err instanceof QuotaError) throw new ToolRefusal('rate-limited', err.message);
        logger.error('mcp-beta: rate limiter unavailable', { route: 'api/mcp', name: err instanceof Error ? err.name : typeof err });
        throw new ToolRefusal('unavailable', 'The service cannot take tool calls right now. Nothing was read or stored.');
      }
    },
  });
  const { log } = result;
  const extra = { tool: log.tool, sourceBytes: log.sourceBytes };
  if (!result.response) return done(empty(202), log.method, log.outcome, extra);
  const status = log.outcome === 'invalid-request' ? 400 : 200;
  return done(json(result.response, status), log.method, log.outcome, extra);
}

/** GET (no stream offered), DELETE (no session to end) and every other verb. */
export async function handleMcpOther(req: Request, pathKey: string | null): Promise<Response> {
  const denied = gate(req, pathKey);
  if (denied) return denied;
  const started = Date.now();
  const res = empty(405, { Allow: 'POST' });
  // One log line per authenticated request, as SECURITY.md says: the verb only, no body is read.
  logRequest({ method: `http:${req.method}`, outcome: 'method-not-allowed', started, status: res.status });
  return res;
}
