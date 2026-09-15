import { readFileSync } from 'node:fs';
import { CATEGORIES, DIMENSIONS, SEVERITIES } from './config.mjs';

/**
 * What the UX reviewer is told. Role, method and severity scale live in
 * docs/ux/ux-brief.md; this module assembles the material around it and defines
 * the one shape the answer may take.
 */

export const BRIEF_PATH = 'docs/ux/ux-brief.md';

export const loadBrief = () => readFileSync(BRIEF_PATH, 'utf8');

const str = { type: 'string' };
const obj = (properties) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const arr = (items) => ({ type: 'array', items });

export const UX_SCHEMA = obj({
  ux_health: { type: 'string', enum: ['good', 'needs_attention', 'poor'] },
  summary: str,
  findings: arr(
    obj({
      severity: { type: 'string', enum: SEVERITIES },
      category: { type: 'string', enum: CATEGORIES },
      title: str,
      journey: str,
      location: obj({ file: str, line: { type: 'integer' }, route: str, screenshot: str }),
      observation: str,
      user_impact: str,
      evidence: str,
      recommendation: str,
      effort: { type: 'string', enum: ['S', 'M', 'L'] },
      roadmap_hint: str,
      confidence: { type: 'number' },
    }),
  ),
  consistency: arr(obj({ dimension: { type: 'string', enum: DIMENSIONS }, status: { type: 'string', enum: ['consistent', 'drifting', 'inconsistent'] }, evidence: str, recommendation: str })),
  design_decisions: arr(obj({ decision: str, question: str, alternatives: str, recommendation: str })),
  new_features: arr(obj({ feature: str, user_view: str, gaps: str })),
  strengths: arr(str),
  priorities: arr(obj({ rank: { type: 'integer' }, change: str, fingerprints: arr(str), why: str })),
  previous_findings: arr(obj({ fingerprint: str, status: { type: 'string', enum: ['resolved', 'still_open', 'not_touched'] }, reason: str })),
  coverage_notes: str,
});

const section = (title, body) => (body ? `## ${title}\n\n${body}\n` : '');

const findingLine = (f) => `${f.fingerprint} · ${f.severity} · ${f.area || '—'} · ${f.title} · ${[f.location?.file && `${f.location.file}:${f.location.line}`, f.location?.route, f.location?.screenshot].filter(Boolean).join(' · ') || '—'}`;

/**
 * The text part of one call. Screenshots follow as image parts; their names are
 * listed here too so the reviewer knows what it was given before it sees them.
 */
export function buildText({ mode, batch, scanText, range, shots, previousOpen = [], refuted = [], areaFindings = [], notes = [] }) {
  const head = [
    `Mode: ${mode}`,
    batch?.title ? `Area: ${batch.title}${batch.part ? ` (part ${batch.part})` : ''}` : null,
    range ? `Commits: ${range.base ? `${range.base.slice(0, 12)}..` : ''}${range.head.slice(0, 12)}${range.commits?.length ? ` — ${range.commits.length} commit(s)` : ''}` : null,
    ...notes,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    `# Review request\n\n${head}\n`,
    section('Commits in this release', range?.commits?.length ? range.commits.slice(0, 40).join('\n') : ''),
    section('Design scan', scanText),
    section('Screenshots provided (in order, after this text)', shots.length ? shots.map((s) => s.name).join('\n') : 'none — the capture did not produce any for this call; say so in coverage_notes'),
    section('Open findings from earlier reviews (fingerprint · severity · area · title · location)', previousOpen.map(findingLine).join('\n')),
    section('Refuted — do not raise again unless the source invalidates the reason', refuted.map((r) => `${r.fingerprint} · ${r.title} — ${r.reason}`).join('\n')),
    section('Findings of the area reviews (fingerprint · severity · area · title · location)', areaFindings.map(findingLine).join('\n')),
    section('Source', batch?.blocks?.join('\n') || ''),
  ]
    .filter(Boolean)
    .join('\n');
}
