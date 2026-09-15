import { readFileSync } from 'node:fs';
import { SEVERITIES } from './config.mjs';

/**
 * What the reviewer is told. The role and the checklist live in
 * docs/qa/reviewer-brief.md so they can be read and changed without touching
 * code; this module only assembles the delta around them.
 */

export const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'summary', 'findings', 'acceptance', 'test_gaps', 'previous_findings', 'coverage_notes'],
  properties: {
    verdict: { type: 'string', enum: ['go', 'go_with_notes', 'no_go'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'category', 'file', 'line', 'title', 'failure_scenario', 'evidence', 'suggested_fix', 'confidence'],
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          category: {
            type: 'string',
            enum: ['correctness', 'security', 'data-integrity', 'regression', 'test-weakening', 'test-gap', 'claim-mismatch', 'performance', 'accessibility', 'simplification'],
          },
          file: { type: 'string' },
          line: { type: 'integer' },
          title: { type: 'string' },
          failure_scenario: { type: 'string' },
          evidence: { type: 'string' },
          suggested_fix: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    acceptance: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['criterion', 'status', 'reason'],
        properties: {
          criterion: { type: 'string' },
          status: { type: 'string', enum: ['met', 'not_met', 'not_verifiable_from_delta'] },
          reason: { type: 'string' },
        },
      },
    },
    test_gaps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['area', 'missing_test', 'risk'],
        properties: {
          area: { type: 'string' },
          missing_test: { type: 'string' },
          risk: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
    previous_findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['fingerprint', 'status', 'reason'],
        properties: {
          fingerprint: { type: 'string' },
          status: { type: 'string', enum: ['resolved', 'still_open', 'not_touched'] },
          reason: { type: 'string' },
        },
      },
    },
    coverage_notes: { type: 'string' },
  },
};

export function loadBrief(path = 'docs/qa/reviewer-brief.md') {
  return readFileSync(path, 'utf8');
}

const section = (title, body) => (body && String(body).trim() ? `## ${title}\n\n${String(body).trim()}\n` : '');

/**
 * One user message per batch. The shared parts (range, triage, claims, prior
 * findings) repeat in every batch so each call can judge its files on its own;
 * they are small next to the diffs.
 */
export function buildUserMessage({ range, batch, batchIndex, batchCount, triage, claims, previousOpen, refuted }) {
  const triageText = [
    `Risk tags: ${triage.tags.join(', ') || 'none'}`,
    `Code changed without any test file in the delta: ${triage.codeWithoutTests ? 'YES — check whether that is acceptable' : 'no'}`,
    triage.signals.length
      ? `Test-weakening signals (confirm or clear each):\n${triage.signals.map((s) => `- ${s.file}: ${s.signal} — \`${s.line}\``).join('\n')}`
      : 'Test-weakening signals: none',
  ].join('\n');

  const criteria = triage.criteria.length ? triage.criteria.map((c) => `- ${c}`).join('\n') : '(none quoted — derive what the commits claim and check that)';

  const previous = previousOpen.length
    ? previousOpen.map((f) => `- [${f.fingerprint}] ${f.severity} · ${f.file}:${f.line} · ${f.title}\n  scenario: ${f.failure_scenario}`).join('\n')
    : '';

  const refutedText = refuted.length ? refuted.map((r) => `- ${r.file} · ${r.title} — refuted: ${r.reason}`).join('\n') : '';

  const files = batch.files
    .map((f) => {
      const callers = f.callers?.length
        ? `\nCallers outside the delta:\n${f.callers.map((c) => `  ${c.symbol}: ${c.callers.map((x) => `${x.file}:${x.line} \`${x.text}\``).join(' | ')}`).join('\n')}`
        : '';
      return `### ${f.path} (${f.status}; tags: ${f.tags.join(', ') || '—'})${f.truncated ? ' — DIFF TRUNCATED' : ''}\n\n\`\`\`diff\n${f.diff}\n\`\`\`${callers}`;
    })
    .join('\n\n');

  return [
    section('Range', `${range.base || '(root)'}..${range.head} — base from ${range.baseReason}\nBatch ${batchIndex + 1} of ${batchCount}\n\nCommits:\n${range.commits.join('\n')}`),
    section('Deterministic triage', triageText),
    section('Acceptance criteria claimed by this delta', criteria),
    section('Claims added to prose files and commit messages', claims.slice(0, 20_000)),
    section('Findings still open from the previous review — report a status for each fingerprint', previous),
    section('Refuted earlier — do not raise again unless the delta invalidates the reason', refutedText),
    section('Delta', files),
  ].join('\n');
}
