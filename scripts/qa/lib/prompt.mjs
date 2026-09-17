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
 * What a batch is told about earlier rounds: only what concerns the files it holds.
 *
 * Until 18.09.2026 every batch carried the whole register — every open finding of
 * the previous report and every refutation — and the register only grows. On
 * 17.09.2026 it held 262 open findings (110,695 characters as rendered here) and
 * 97 refutations (58,805). With the brief, the claims and the triage, the part
 * every batch repeats was larger than one call's budget before a single diff was
 * added, so the reviews of 5f84bb2, 9edb37f, e3817ce and c812085 packed no batch,
 * made no model call and read nothing.
 *
 * So a batch now hears about the open findings and refutations whose file is one
 * of its own (a renamed file answers for its old name too), each long field capped,
 * plus a count of the rest. Those characters travel with their file (`carriedChars`,
 * counted in pack.mjs), so the shared part stays the same size however long the
 * register gets. Nothing is dropped from the register itself: a finding whose file
 * no batch holds is carried open by report.mjs, and a batch can only resolve what
 * it was shown (`shown`, checked in buildReport). A refutation of a file outside
 * the batch is not needed there — the reviewer reports on the batch's files.
 */
export const CARRIED_LIMITS = { title: 200, text: 600 };

const cap = (value, max) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

export const renderOpenFinding = (f) => `- [${f.fingerprint}] ${f.severity} · ${f.file}:${f.line} · ${cap(f.title, CARRIED_LIMITS.title)}\n  scenario: ${cap(f.failure_scenario, CARRIED_LIMITS.text)}`;

export const renderRefutation = (r) => `- ${r.file} · ${cap(r.title, CARRIED_LIMITS.title)} — refuted: ${cap(r.reason, CARRIED_LIMITS.text)}`;

/** The part of the register that concerns these files, and how much is left out. */
export function carriedFor(files, { previousOpen = [], refuted = [] } = {}) {
  const paths = new Set(files.flatMap((f) => [f.path, f.oldPath]).filter(Boolean));
  const open = previousOpen.filter((f) => paths.has(f.file));
  const refutations = refuted.filter((r) => paths.has(r.file));
  return { open, refutations, otherOpen: previousOpen.length - open.length, otherRefuted: refuted.length - refutations.length };
}

/** Characters one file adds to whichever batch it lands in, so packing counts them where they are sent. */
export function carriedChars(file, register) {
  const { open, refutations } = carriedFor([file], register);
  return [...open.map(renderOpenFinding), ...refutations.map(renderRefutation)].reduce((n, line) => n + line.length + 1, 0);
}

/** The register sections of one batch: its own entries, then one line counting the rest. */
export function carriedSections(files, register) {
  const c = carriedFor(files, register);
  const elsewhere = (n, what) => (n ? `(${n} ${what} concern files outside this batch — not yours to judge; they are carried unchanged.)` : '');
  return {
    open: c.open,
    previous: [c.open.map(renderOpenFinding).join('\n'), elsewhere(c.otherOpen, 'more open findings')].filter(Boolean).join('\n'),
    refuted: [c.refutations.map(renderRefutation).join('\n'), elsewhere(c.otherRefuted, 'more refutations')].filter(Boolean).join('\n'),
  };
}

/**
 * One user message per batch. Range, triage and claims repeat in every batch so
 * each call can judge its files on its own; the register does not (carriedFor).
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

  const carried = carriedSections(batch.files, { previousOpen, refuted });

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
    section('Findings still open from the previous review in the files of this batch — report a status for each fingerprint listed', carried.previous),
    section('Refuted earlier in the files of this batch — do not raise again unless the delta invalidates the reason', carried.refuted),
    section('Delta', files),
  ].join('\n');
}
