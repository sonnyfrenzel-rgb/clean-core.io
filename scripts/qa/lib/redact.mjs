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
    // `[A-Z0-9]_KEY` covers the project's own key names — QA_REVIEW_KEY,
    // AUDIT_SIGNING_KEY, S4_ENCRYPTION_KEY — which carry no provider prefix to
    // recognise them by (QA review of 2f9b128bafd4, finding a87199ab8c9e).
    re: /\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|PEPPER|[A-Z0-9]_KEY)[A-Za-z0-9_]*)\s*[:=]\s*(['"`])(?!test-|dummy|example|placeholder|your-|<)[^'"`\s]{24,}\2/gi,
  },
];

export function redactSecrets(text) {
  let out = String(text ?? '');
  const hits = [];
  for (const { kind, re } of PATTERNS) {
    let count = 0;
    out = out.replace(re, (match, name) => {
      count++;
      return kind === 'secret-named literal' ? `${name}=[REDACTED:${kind}]` : `[REDACTED:${kind}]`;
    });
    if (count) hits.push({ kind, count });
  }
  return { text: out, hits };
}
