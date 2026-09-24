/**
 * What an upstream error body looked like, as one word from a closed list.
 *
 * The S/4 routes read the body of a token or metadata endpoint that refused
 * them. Its text is not ours: an OAuth error page can echo the client id or the
 * submitted form, an SAP error page can carry user names, host names and
 * session ids. Quoting it into the server log moved that text from the caller's
 * screen into Cloud Logging (QA review of 46a7d64baad3), which is a smaller
 * audience, not a safe one. The log gets this word instead: enough to tell an
 * OAuth refusal from an HTML login page from an empty answer, and nothing the
 * upstream wrote itself.
 *
 * The OAuth codes are the ones RFC 6749 §5.2 defines. A code outside that list
 * is reported as `json`, never passed through — the list is the whole point.
 */
const OAUTH_ERROR_CODES = [
  'invalid_request',
  'invalid_client',
  'invalid_grant',
  'unauthorized_client',
  'unsupported_grant_type',
  'invalid_scope',
] as const;

export type UpstreamBodyShape =
  | 'empty'
  | (typeof OAUTH_ERROR_CODES)[number]
  | 'json'
  | 'xml'
  | 'html'
  | 'text';

export function upstreamBodyShape(body: string): UpstreamBodyShape {
  const t = (body || '').trim();
  if (!t) return 'empty';
  if (t.startsWith('{') || t.startsWith('[')) {
    try {
      const parsed = JSON.parse(t) as { error?: unknown } | null;
      const code = parsed && typeof parsed === 'object' ? parsed.error : undefined;
      const known = OAUTH_ERROR_CODES.find((c) => c === code);
      return known ?? 'json';
    } catch {
      return 'text';
    }
  }
  if (/^<!doctype html|^<html[\s>]/i.test(t)) return 'html';
  if (t.startsWith('<')) return 'xml';
  return 'text';
}
