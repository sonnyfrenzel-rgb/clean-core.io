/**
 * Nothing that looks like a credential leaves the runner. The delta is sent to
 * a third party (OpenRouter), and a key committed by mistake would travel with
 * it. Gitleaks in Security CI catches most of these on the same push; this is
 * the second net, placed exactly where the data would otherwise leave.
 *
 * A hit is replaced before sending and reported as a finding — without the
 * value — because a committed secret is itself the most urgent bug in a delta.
 */

const PATTERNS = [
  { kind: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'OpenRouter key', re: /\bsk-or-v1-[0-9a-f]{64}\b/g },
  { kind: 'OpenAI-style key', re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g },
  { kind: 'xAI key', re: /\bxai-[A-Za-z0-9]{40,}\b/g },
  { kind: 'Resend key', re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}\b/g },
  { kind: 'GitHub token', re: /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/g },
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  // Assignment of a long literal to a name that says it is secret. Placeholders and env lookups do not match.
  {
    kind: 'secret-named literal',
    // `[A-Z0-9]_KEY` covers the project's own names for its review, signing and
    // encryption keys, which carry no provider prefix to recognise them by (QA
    // review of 2f9b128bafd4, finding a87199ab8c9e). Written without the literal
    // names: gitleaks read the list as an assignment (Security CI, 15.09.2026).
    re: /\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|PEPPER|[A-Z0-9]_KEY)[A-Za-z0-9_]*)\s*[:=]\s*(['"`])(?!test-|dummy|example|placeholder|your-|<)[^'"`\s]{24,}\2/gi,
  },
];

/**
 * `publicValues` holds the handful of values this repository publishes on purpose — the Firebase web API key,
 * which ships in every page. They are still replaced before anything leaves the runner; they are simply not
 * counted, so they are not reported as a committed credential. Without this the delta review raised the same
 * critical finding on every push: the path-based suppression in config.mjs cannot see a hit that this last net
 * reports under the path `outgoing message`.
 */
export function redactSecrets(text, publicValues = new Set()) {
  let out = String(text ?? '');
  const hits = [];
  for (const { kind, re } of PATTERNS) {
    let count = 0;
    out = out.replace(re, (match, name) => {
      // A name that says it holds a path or a file name holds a location, not a secret: `AUDIT_PUBLIC_KEY_PATH`
      // was redacted and reported as a committed credential (Sonny, 15.09.2026). A real key assigned to such a
      // name is still caught by the provider patterns above, which do not look at names.
      if (kind === 'secret-named literal' && /_(?:PATH|FILE)$/i.test(name)) return match;
      if (publicValues.has(match)) return `[REDACTED:${kind}]`;
      count++;
      return kind === 'secret-named literal' ? `${name}=[REDACTED:${kind}]` : `[REDACTED:${kind}]`;
    });
    if (count) hits.push({ kind, count });
  }
  return { text: out, hits };
}
