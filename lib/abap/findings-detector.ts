import type { ClassModel, SupportFinding } from './class-model';
import {
  SUPPORT_MATRIX, howItWorksUrl, rollupLevel,
  type ConstructType, type SupportLevel,
} from './support-matrix';
import { detectComplexJoinFindings } from './complex-join-findings';

/**
 * Findings detector — turns the resolved IR + raw ABAP source into SupportFinding[].
 *
 * Two classes of detection:
 *   - STRUCTURAL (exact, from the IR): deep-inheritance, missing-dependency.
 *   - BODY-LEVEL (heuristic, regex over source): badi, complex-join, dynamic-call,
 *     dynpro, kernel-call, rtti. Heuristics are intentionally conservative — they
 *     flag for review; they never silently upgrade.
 *
 * All findings inherit their default level / sign-off / docs link from SUPPORT_MATRIX,
 * so the in-product output and the public how-it-works page cannot diverge.
 */

export interface SourceFile { file: string; content: string; }

function baseFinding(
  construct: ConstructType,
  extra: Partial<SupportFinding> & { detail: string; recommendation: string },
): SupportFinding {
  const e = SUPPORT_MATRIX[construct];
  return {
    construct,
    level: extra.level ?? e.level,
    title: e.title,
    detail: extra.detail,
    recommendation: extra.recommendation,
    howItWorks: howItWorksUrl(construct),
    requiresSignOff: extra.requiresSignOff ?? e.requiresSignOff,
    location: extra.location,
    targetAnchor: extra.targetAnchor,
    confidence: extra.confidence,
  };
}

// Body-level detection signals. Each pattern flags its construct at the match line.
const BODY_PATTERNS: { construct: ConstructType; re: RegExp; why: string }[] = [
  {
    construct: 'badi-enhancement',
    re: /\b(GET\s+BADI|CALL\s+BADI|cl_exithandler|ENHANCEMENT-POINT|ENHANCEMENT-SECTION|ENHANCEMENT\s+\d|INTERFACES\s+if_badi\w*)\b/i,
    why: 'BAdI/enhancement wiring detected; method body logic requires manual review.',
  },
  {
    construct: 'dynamic-call',
    // CALL FUNCTION not followed by a quoted literal => dynamic; dynamic PERFORM
    re: /\bCALL\s+FUNCTION\s+(?!')[\w(]|\bPERFORM\s*\(/i,
    why: 'Call target is not a literal and cannot be resolved at parse time.',
  },
  {
    construct: 'dynpro-screen',
    re: /\b(CALL\s+SCREEN|SET\s+SCREEN|LOOP\s+AT\s+SCREEN|PROCESS\s+BEFORE\s+OUTPUT|PROCESS\s+AFTER\s+INPUT|MODULE\s+\w+\s+(OUTPUT|INPUT))\b/i,
    why: 'Dynpro/screen-flow construct; UI layer requires manual Fiori/UI5 redesign.',
  },
  {
    construct: 'rtti-dynamic-type',
    re: /\b(CL_ABAP_TYPEDESCR|CL_ABAP_CLASSDESCR|CL_ABAP_DATADESCR)\b|\bCREATE\s+(DATA|OBJECT)\s+\w+\s+TYPE\s*\(/i,
    why: 'Runtime type information / dynamic instantiation; cannot be resolved statically.',
  },
  {
    construct: 'kernel-call',
    re: /\b(SYSTEM-CALL|CALL\s+'(SYSTEM|THUSBINGO|GRAPH)')\b/i,
    why: 'ABAP kernel/system-internal call; no public API equivalent exists.',
  },
];

/** Helper to clean comments from a raw source line to prevent false positives. */
function cleanComments(line: string): string {
  // Full-line comment starting with '*'
  if (/^\s*\*/.test(line)) return '';
  
  // Strip inline comments starting with '"' (respecting single quotes and backticks)
  let clean = '';
  let inSingleQuote = false;
  let inBacktick = false;
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (ch === "'" && !inBacktick) inSingleQuote = !inSingleQuote;
    if (ch === "`" && !inSingleQuote) inBacktick = !inBacktick;
    if (ch === '"' && !inSingleQuote && !inBacktick) {
      break; // rest is comment
    }
    clean += ch;
  }
  return clean;
}

/** Structural findings derived directly from the resolved IR. */
function detectStructural(model: ClassModel): SupportFinding[] {
  const findings: SupportFinding[] = [];

  // Missing dependencies (each one is also surfaced as its own finding).
  for (const m of model.missing) {
    findings.push(baseFinding('missing-dependency', {
      level: 'partial',
      detail: `Source of ${m.ref} (${m.kind}) referenced by ${m.referencedBy} was not provided.`,
      recommendation: `Upload the source of ${m.ref} to complete hierarchy resolution.`,
      location: m.at,
      requiresSignOff: true,
    }));
  }

  // Deep inheritance: fully resolved vs blocked.
  const hasInheritance = Object.values(model.nodes).some((n) => n.superClass || n.interfaces.length);
  if (hasInheritance) {
    const blocked = model.missing.some((m) => m.impact === 'blocks-resolution');
    findings.push(baseFinding('deep-inheritance', {
      level: blocked ? 'partial' : 'fully',
      detail: blocked
        ? 'Inheritance chain incomplete — at least one ancestor source is missing.'
        : `Inheritance chain fully resolved (${model.linearization.length} types in the hierarchy).`,
      recommendation: blocked
        ? 'Provide the missing ancestor sources listed above, then re-run.'
        : 'No action required; structure mirrored 1:1 in TypeScript.',
      requiresSignOff: blocked,
      location: model.nodes[model.root]?.source ?? undefined,
    }));
  }
  return findings;
}

export function detectFindings(model: ClassModel, sources: SourceFile[]): SupportFinding[] {
  const findings: SupportFinding[] = [...detectStructural(model)];

  for (const src of sources) {
    const lines = src.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = cleanComments(rawLine);
      if (!line.trim()) continue;

      for (const p of BODY_PATTERNS) {
        if (p.re.test(line)) {
          findings.push(baseFinding(p.construct, {
            detail: p.why,
            recommendation: SUPPORT_MATRIX[p.construct].notes,
            location: { file: src.file, line: i + 1 },
          }));
        }
      }
    }
  }
  findings.push(...detectComplexJoinFindings(sources));

  return findings;
}

export interface SupportSummary {
  counts: { fully: number; partial: number; notSupported: number };
  overall: SupportLevel;
  blocked: boolean;
  signOffRequired: boolean;
}

export function summarize(findings: SupportFinding[], model: ClassModel): SupportSummary {
  const counts = { fully: 0, partial: 0, notSupported: 0 };
  for (const f of findings) {
    if (f.level === 'fully') counts.fully++;
    else if (f.level === 'partial') counts.partial++;
    else counts.notSupported++;
  }
  return {
    counts,
    overall: rollupLevel(findings.map((f) => f.level)),
    blocked: model.missing.some((m) => m.impact === 'blocks-resolution'),
    signOffRequired: findings.some((f) => f.requiresSignOff),
  };
}
