/**
 * The rules of `tests/design-source-guard.spec.ts`, as pure functions.
 *
 * Pure on purpose: no `fs`, no network, no Playwright. The spec and the
 * baseline script (`scripts/design/baseline.ts`) both import this file, so the
 * number the guard compares and the number the script writes are computed by
 * the same code — a ceiling can never be lowered to a count the guard would not
 * reproduce.
 *
 * Every rule is a source heuristic, not a rendered measurement. It counts
 * occurrences per file; the counts are orders of magnitude, the rendered truth
 * belongs to `tests/design-rendered-guard.spec.ts` (D.2). What the heuristic
 * must be is *stable*: the same source always gives the same count, so a
 * ceiling means something.
 *
 * Where each rule comes from (DESIGN.md):
 *   R1  type below 11 px ............................ §1.2 "Untergrenze 11 px"
 *   R2  weight 900 .................................. §1.2 "900 gibt es im Arbeitsraum nicht"
 *   R3  hex / rgb() / hsl() literal ................. §1.1, §8 "Tokens statt Hex"
 *   R4  Tailwind palette class ...................... §1.1, §8
 *   R5  green palette class (subset of R4) .......... §1.1, ADR-007 "Grün heißt belegt"
 *   R6  native alert / confirm / prompt ............. §1.5, §2.6 Message Box
 *   R7  own-surface button or link .................. §1.5 "genau vier"
 *   R8  outline-none without a focus-visible ring ... §1.6
 *   R9  onClick on div/span/li/tr/td without role
 *       and key handler ............................. §1.6, §2 keyboard
 *   R10 hand-built overlay (fixed inset-0) .......... §2.6 Message Box / Dialog
 *   R11 raw <table> ................................. §2.4 CcTable
 *   R12 radius > 12 px, shadow lg+, gradient,
 *       backdrop-blur — workspace files only ........ §1.4
 *   R13 perpetual / entrance animation without
 *       motion-safe: ................................ §1.7
 *   R14 emoji ....................................... §3.1
 *   R15 model-work icon (Sparkles, Bot, Brain, Wand,
 *       Cpu) ........................................ §3.1
 *   R16 toLocale*String() without 'en' / 'en-US' .... §3 formats
 *   R17 free badge (small, padded, rounded, filled)
 *       outside components/cc ....................... §4 fixed lists
 *   R18 half spacing steps: 6/10/14 px always, 2 px
 *       outside chips/identifiers/icon alignment .... §1.3, ADR-048 (E-2)
 *   R19 arbitrary type size outside the scale
 *       11/12/13/14/15/22 px ........................ §1.2, ADR-047 (E-1)
 */

import ts from 'typescript';

export const RULE_IDS = [
  'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10',
  'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'R17', 'R18', 'R19',
] as const;
export type RuleId = (typeof RULE_IDS)[number];
export type RuleCounts = Partial<Record<RuleId, number>>;

export const RULE_TITLES: Record<RuleId, string> = {
  R1: 'type below 11 px',
  R2: 'font weight 900',
  R3: 'hex / rgb() / hsl() colour literal',
  R4: 'Tailwind palette colour class',
  R5: 'green palette class',
  R6: 'native alert/confirm/prompt',
  R7: 'button or link with its own surface outside CC_BUTTON_*/publicButton',
  R8: 'outline-none without a focus-visible replacement',
  R9: 'onClick on div/span/li/tr/td without role and key handler',
  R10: 'fixed inset-0 overlay outside CcMessageBox/CcDialog',
  R11: 'raw <table> outside CcTable and .doc-table',
  R12: 'workspace form: radius > 12 px, shadow lg+, gradient, backdrop-blur',
  R13: 'animate-pulse/bounce/ping/in without motion-safe:',
  R14: 'emoji',
  R15: 'model-work icon (Sparkles, Bot, Brain, Wand, Cpu)',
  R16: "toLocale*String() without 'en' or 'en-US'",
  R17: 'free status badge outside components/cc',
  R18: 'half spacing step (6/10/14 px; 2 px outside chip/identifier/icon)',
  R19: 'arbitrary type size outside the scale 11/12/13/14/15/22 px',
};

/** One hit, with the 1-based line it sits on, for a readable failure. */
export interface Hit {
  rule: RuleId;
  line: number;
  snippet: string;
}

// ---------------------------------------------------------------------------
// Which files, which group, which step
// ---------------------------------------------------------------------------

/**
 * The files the guard reads: every `.tsx` under `app/` and `components/`
 * (route handlers under `app/api/` are not UI), plus the `.ts` style modules
 * under `components/` (e.g. `components/cc/state.ts`, where class strings live).
 */
export function isUiFile(rel: string): boolean {
  if (rel.startsWith('app/api/')) return false;
  if (rel.startsWith('app/') && rel.endsWith('.tsx')) return true;
  if (rel.startsWith('components/') && /\.(tsx|ts)$/.test(rel) && !rel.endsWith('.d.ts')) return true;
  return false;
}

const S = 'app/(app)/project/[projectId]/';

/**
 * File → baseline group and the step (luecken-und-plan.md §4) that brings it to
 * zero. First match wins. One group per baseline file, and a group is only ever
 * edited by one lane at a time, so two parallel steps never write the same file.
 *
 * Groups deliberately split `workspace` (D.29) out of `library` (D.5a–d): both
 * are Lane A, but that way the library steps and the text-key step never race
 * on one JSON file.
 */
const GROUPS: { match: (rel: string) => boolean; group: string; step: string }[] = [
  // Lane A
  { match: (r) => r.startsWith('components/cc/') || r.startsWith('app/(app)/admin/design-system/'), group: 'library', step: 'D.5a' },
  {
    match: (r) =>
      r.startsWith('components/workspace/') ||
      r.startsWith('components/process-map/') ||
      r === `${S}page.tsx` ||
      r === 'components/demo/DemoWorkspaceShell.tsx' ||
      r === 'components/demo/DemoTourStop.tsx' ||
      r.startsWith('app/(app)/demo/workspace/'),
    group: 'workspace',
    step: 'D.29',
  },
  // Lane B — the seven tools
  {
    match: (r) =>
      [
        'StageHeader', 'Stepper', 'VerificationRail', 'NavigationButtons', 'BackLink', 'StaleNotice',
        'LegacyRunBanner', 'NotGenerated', 'SectionBoundary', 'ErrorBoundary', 'CollapsibleAccordion',
      ].some((n) => r === `components/${n}.tsx`) || (r.startsWith(S) && /\/(documentation|testing)\/error\.tsx$/.test(r)),
    group: 'stage-frame',
    step: 'D.9',
  },
  { match: (r) => r.startsWith(`${S}analyze/`), group: 'analyze-page', step: 'D.10a' },
  {
    match: (r) =>
      [
        'EvidenceSweep', 'SweepVerdictBar', 'SweepCodeViewer', 'ConstructFindings', 'UnassessedConstructs',
        'CodeInventoryTable', 'DataCouplingTable', 'AbcdClassificationPanel', 'CoverageVerdict', 'AnchoredNarrative',
        'PreAnalysisPreview', 'MissingDependencyPrompt', 'WhyScorePanel',
      ].some((n) => r === `components/analyze/${n}.tsx`),
    group: 'analyze-evidence',
    step: 'D.11',
  },
  {
    match: (r) =>
      ['GapsWorklist', 'GapsPrioritization', 'AtcFindingsPanel', 'AtcUpload', 'UsageUpload', 'UsageRiskMatrix', 'ModuleHeatmap', 'GapAccordionCard']
        .some((n) => r === `components/analyze/${n}.tsx`),
    group: 'analyze-worklists',
    step: 'D.12',
  },
  // Everything else under components/analyze is strategy (D.13 names all six).
  { match: (r) => r.startsWith('components/analyze/'), group: 'analyze-strategy', step: 'D.13' },
  { match: (r) => r.startsWith(`${S}design/`) || r === 'components/ArchitectSignOff.tsx', group: 'design', step: 'D.14a' },
  { match: (r) => r.startsWith('components/design/'), group: 'design', step: 'D.14b' },
  { match: (r) => r.startsWith(`${S}transformation/`) || r === 'components/CodeHighlighter.tsx', group: 'transformation', step: 'D.15' },
  { match: (r) => r.startsWith(`${S}documentation/`), group: 'documentation', step: 'D.16a' },
  {
    match: (r) =>
      r.startsWith('components/documentation/') ||
      r.startsWith('components/process-revisions/') ||
      ['PresentationViewer', 'DocumentSection', 'MermaidDiagram', 'ProcessFlow'].some((n) => r === `components/${n}.tsx`),
    group: 'documentation',
    step: 'D.16b',
  },
  { match: (r) => r.startsWith(`${S}testing/`) || r === 'components/TestingCharts.tsx', group: 'testing', step: 'D.17a' },
  { match: (r) => r.startsWith(`${S}tco/`) || r.startsWith('components/tco/'), group: 'tco', step: 'D.18' },
  {
    match: (r) =>
      r.startsWith(`${S}delivery/`) ||
      ['ComplianceReviewHints', 'PersonalDataHints', 'ReviewTasks', 'ModelStagesCard'].some((n) => r === `components/${n}.tsx`),
    group: 'delivery',
    step: 'D.19',
  },
  // Lane C — frame, account, public
  {
    match: (r) =>
      r === 'app/(app)/layout.tsx' ||
      r === 'app/layout.tsx' ||
      ['ShellHelpMenu', 'HeaderAuthButton', 'MaintenanceNotice'].some((n) => r === `components/${n}.tsx`),
    group: 'shell',
    step: 'D.6',
  },
  {
    match: (r) => ['UserOnboarding', 'TermsReacceptGate'].some((n) => r === `components/${n}.tsx`) || r === 'app/components/LegalOverlay.tsx',
    group: 'onboarding',
    step: 'D.7',
  },
  {
    match: (r) => ['GlossaryChatbot', 'GlossarySidebar', 'GlossaryTerm', 'QuickAnswer'].some((n) => r === `components/${n}.tsx`),
    group: 'glossary',
    step: 'D.8',
  },
  { match: (r) => r.startsWith('app/(app)/settings/'), group: 'settings', step: 'D.20a' },
  { match: (r) => r.startsWith('app/(app)/admin/') || r.startsWith('components/admin/'), group: 'admin', step: 'D.21' },
  {
    // The old dashboard and the orphans D.22 checks before deleting.
    match: (r) =>
      r.startsWith('app/(app)/dashboard/') ||
      r.startsWith('components/process-states/') ||
      r.startsWith('components/process-target/') ||
      ['FileList', 'FileUpload', 'JiraIntegrationModal', 'UpgradeToEnterpriseModal', 'StarterExamples', 'Skeleton', 'ProcessStrip']
        .some((n) => r === `components/${n}.tsx`),
    group: 'dashboard-legacy',
    step: 'D.22',
  },
  {
    // E-6 as changed by Sonny on 24.09.2026: the stage demo is rebuilt, not removed.
    match: (r) => r.startsWith('app/(app)/demo/') || r.startsWith('components/demo/'),
    group: 'demo-legacy',
    step: 'D.22b',
  },
  {
    match: (r) =>
      ['clean-core-explained', 'clean-core-score', 'how-it-works', 'sap-cloudification', 'abap-custom-code-analysis', 'sap-clean-core-object-classification']
        .some((n) => r.startsWith(`app/(app)/${n}/`)),
    group: 'knowledge',
    step: 'D.23a',
  },
  {
    match: (r) =>
      ['knowledge', 'how-to', 'about', 'trust', 'tenant-security', 'first-run', 'verify-pack', 'invitation'].some((n) => r.startsWith(`app/(app)/${n}/`)) ||
      ['KnowledgeClient', 'HowToClient', 'GuideShareBar', 'TrustBeforeUpload', 'InviteReaderDialog'].some((n) => r === `components/${n}.tsx`),
    group: 'knowledge',
    step: 'D.23b',
  },
  {
    match: (r) =>
      r === 'app/catalog/layout.tsx' ||
      r === 'app/features/layout.tsx' ||
      ['PublicHeader', 'SiteFooter', 'SapTrademarkNotice'].some((n) => r === `components/${n}.tsx`),
    group: 'public-header',
    step: 'D.24',
  },
  { match: (r) => r.startsWith('app/catalog/') || r.startsWith('components/catalog/') || r.startsWith('app/method/'), group: 'catalog', step: 'D.25a' },
  {
    match: (r) =>
      ['whitepaper', 'facts', 'reference-analysis', 'licenses', 'clean-core-explained-print', 'features'].some((n) => r.startsWith(`app/${n}/`)),
    group: 'public-content',
    step: 'D.25b',
  },
  {
    match: (r) =>
      ['terms', 'datenschutz', 'impressum', 'auth', 'survey', 'unsubscribe'].some((n) => r.startsWith(`app/${n}/`)) ||
      r === 'app/error.tsx' ||
      r === 'app/not-found.tsx',
    group: 'legal',
    step: 'D.26',
  },
  {
    match: (r) =>
      r === 'app/page.tsx' ||
      r.startsWith('components/landing/') ||
      [
        'LandingModals', 'SectionHeader', 'BenefitCard', 'FooterCTA', 'HeroCTA', 'LandingProcess', 'PilotWarningBanner',
        'PricingCTA', 'SamplePackageDownload', 'TransformationShowroom', 'TransformationReplay',
      ].some((n) => r === `components/${n}.tsx`),
    group: 'landing',
    step: 'D.27',
  },
];

export const GROUP_NAMES = [...new Set(GROUPS.map((g) => g.group))].sort();

/** The group and step a file belongs to, or `null` when no step owns it yet. */
export function groupOf(rel: string): { group: string; step: string } | null {
  const hit = GROUPS.find((g) => g.match(rel));
  return hit ? { group: hit.group, step: hit.step } : null;
}

/**
 * Groups whose files are public pages (§1.4 "Öffentliche Seiten": 22–28 px
 * radii, mesh, shadows "wie heute"). R12 does not apply there.
 */
const PUBLIC_GROUPS = new Set(['landing', 'public-header', 'catalog', 'public-content', 'legal', 'knowledge']);

/** R12 is a workspace rule: everything that is not a public page. */
export function isWorkspaceFile(rel: string): boolean {
  const g = groupOf(rel);
  if (g) return !PUBLIC_GROUPS.has(g.group);
  // An unmapped file under the authenticated shell is workspace; elsewhere public.
  return rel.startsWith('app/(app)/') || rel.startsWith('components/');
}

// ---------------------------------------------------------------------------
// Scanning helpers
// ---------------------------------------------------------------------------

/**
 * Blank out comments, keeping every newline so line numbers survive.
 *
 * With the TypeScript parser, not a regex: a regex cannot tell `//` in a
 * comment from `//` in `title="x//"`, a URL in JSX text or a template literal,
 * and it used to blank the rest of such a line — hiding whatever violation
 * stood after it (QA review of c07adecd2fb5, finding 01bcfd747ee8). The parser
 * knows where a string, an attribute or JSX text ends, so only trivia between
 * tokens is treated as comment. Still pure: `typescript` is a library, not I/O.
 */
export function stripComments(text: string, rel = 'probe.tsx'): string {
  const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.ts$/.test(rel) ? ts.ScriptKind.TS : ts.ScriptKind.TSX;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, false, kind);
  const ranges: ts.CommentRange[] = [];
  const seen = new Set<number>();
  const collect = (pos: number) => {
    if (seen.has(pos)) return;
    seen.add(pos);
    ranges.push(...(ts.getLeadingCommentRanges(text, pos) ?? []), ...(ts.getTrailingCommentRanges(text, pos) ?? []));
  };
  const visit = (node: ts.Node) => {
    // JSX text owns its whitespace and any `//` in it: it is copy, not trivia.
    if (node.kind === ts.SyntaxKind.JsxText) return;
    const children = node.getChildren(sf);
    if (children.length === 0) collect(node.pos);
    else children.forEach(visit);
  };
  visit(sf);

  const out = text.split('');
  for (const r of ranges) {
    for (let i = r.pos; i < r.end; i++) if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' ';
  }
  return out.join('');
}

interface Tag {
  name: string;
  start: number;
  end: number;
  text: string;
}

/**
 * Every JSX-looking opening tag, attributes included. `>` counts as the end
 * only at brace depth 0 and outside a quoted attribute, so `onClick={() => x}`
 * does not end the tag.
 */
function openingTags(code: string): Tag[] {
  const tags: Tag[] = [];
  const re = /<([A-Za-z][\w.]*)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    let depth = 0;
    let quote: string | null = null;
    let end = -1;
    const limit = Math.min(code.length, m.index + 6000);
    for (let j = m.index + m[0].length; j < limit; j++) {
      const c = code[j];
      if (quote) {
        if (c === quote) quote = null;
        continue;
      }
      if (depth === 0 && (c === '"' || c === "'")) {
        quote = c;
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    tags.push({ name: m[1], start: m.index, end, text: code.slice(m.index, end + 1) });
  }
  return tags;
}

/** The value of `className=` inside a tag: a string, or the whole `{…}` expression. */
function classAttr(tagText: string): string | null {
  const i = tagText.search(/\bclassName=/);
  if (i < 0) return null;
  const rest = tagText.slice(i + 'className='.length);
  if (rest[0] === '"' || rest[0] === "'") {
    const close = rest.indexOf(rest[0], 1);
    return close > 0 ? rest.slice(1, close) : null;
  }
  if (rest[0] === '{') {
    let depth = 0;
    for (let j = 0; j < rest.length; j++) {
      if (rest[j] === '{') depth++;
      else if (rest[j] === '}') {
        depth--;
        if (depth === 0) return rest.slice(1, j);
      }
    }
  }
  return null;
}

function classTokens(value: string): string[] {
  return value.replace(/\$\{/g, ' ').split(/[\s'"`,(){}?:]+/).filter(Boolean);
}

/** Local names imported from lucide-react, mapped to the lucide export name. */
function lucideImports(code: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]lucide-react['"]/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      if (!bits[0]) continue;
      out.set((bits[1] ?? bits[0]).trim(), bits[0].trim());
    }
  }
  return out;
}

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const COLOUR_UTILS = 'text|bg|border|border-[trblxy]|ring|ring-offset|divide|outline|decoration|accent|caret|fill|stroke|shadow|from|via|to|placeholder';
const RE_PALETTE = new RegExp(`(?<![\\w-])(?:${COLOUR_UTILS})-(${PALETTE})-\\d{2,3}(?:\\/\\d+)?(?![\\w-])`, 'g');
const RE_HEX = /(?<![\w&])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g;
const RE_RGB = /(?<![\w-])(?:rgba?|hsla?)\(\s*[\d.]/g;
const RE_FONT_ARB = /(?<![\w-])text-\[(\d+(?:\.\d+)?)(px|rem|em)\]/g;
const RE_FONT_STYLE = /\bfontSize:\s*['"]?(\d+(?:\.\d+)?)(px|rem|em)?['"]?/g;
const RE_BLACK = /(?<![\w-])font-black(?![\w-])|(?<![\w-])font-\[900\]|\bfontWeight:\s*['"]?900\b/g;
const RE_DIALOG = /(?<![\w.$])(?:window\.)?(?:alert|confirm|prompt)\s*\(|\bwindow\.(?:alert|confirm|prompt)\s*\(/g;
const RE_ANIM = /(?<![\w-])((?:[\w-]+:)*)animate-(pulse|bounce|ping|in)(?![\w-])/g;
const RE_EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2705}\u{274C}]/gu;
const RE_LOCALE = /\.toLocale(?:Date|Time)?String\(\s*(?!['"`]en(?:-US)?['"`])/g;
const RE_SPACING =
  /(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y)-(0\.5|1\.5|2\.5|3\.5|\[(\d+(?:\.\d+)?)px\])(?![\w-])/g;
const RE_BIG_RADIUS = /(?<![\w-])rounded(?:-[trblse]{1,2})?-(?:2xl|3xl|\[(\d+(?:\.\d+)?)(px|rem)\])(?![\w-])/g;
const RE_BIG_SHADOW = /(?<![\w-])shadow-(?:lg|xl|2xl)(?![\w-])/g;
const RE_GRADIENT = /(?<![\w-])bg-(?:gradient-to|linear|radial|conic)-|\b(?:linear|radial|conic)-gradient\(/g;
const RE_BLUR = /(?<![\w-])backdrop-blur(?:-[\w]+)?(?![\w-])/g;

/** DESIGN.md §1.2 plus ADR-047 (12 px meta/chip). */
export const TYPE_SCALE_PX = [11, 12, 13, 14, 15, 22] as const;

const AI_ICONS = new Set(['Sparkles', 'Sparkle', 'Bot', 'BotMessageSquare', 'Brain', 'BrainCircuit', 'Wand', 'Wand2', 'WandSparkles', 'Cpu']);
const NON_SURFACE_BG = /^bg-(?:transparent|none|inherit|current|cover|contain|center|top|bottom|left|right|fixed|local|scroll|repeat|no-repeat|repeat-x|repeat-y|origin-\w+|clip-\w+|opacity-\d+|blend-\w+|auto|\[url)/;

const px = (v: number, unit: string) => (unit === 'px' || !unit ? v : v * 16);

// ---------------------------------------------------------------------------
// The count
// ---------------------------------------------------------------------------

/**
 * Every hit of every rule in one file. `rel` decides the file-scoped
 * exceptions (the library defines the patterns other files may not write).
 */
export function scanFile(rel: string, source: string): Hit[] {
  const code = stripComments(source, rel);
  const hits: Hit[] = [];
  const lineStarts: number[] = [0];
  for (let i = 0; i < code.length; i++) if (code[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (pos: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const add = (rule: RuleId, pos: number, snippet: string) =>
    hits.push({ rule, line: lineOf(pos), snippet: snippet.replace(/\s+/g, ' ').trim().slice(0, 120) });
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(code))) fn(m);
  };

  const tags = openingTags(code);
  const lucide = lucideImports(code);
  const lucideLocal = new Set(lucide.keys());
  const enclosingTag = (pos: number): Tag | undefined => {
    let found: Tag | undefined;
    for (const t of tags) {
      if (t.start > pos) break;
      if (t.end >= pos) found = t;
    }
    return found;
  };
  const inLibrary = rel.startsWith('components/cc/');
  const workspace = isWorkspaceFile(rel);

  // R1 / R19 — type size
  each(RE_FONT_ARB, (m) => {
    const v = px(parseFloat(m[1]), m[2]);
    if (v < 11) add('R1', m.index, m[0]);
    // `em` is relative to the parent; only absolute sizes can be off the scale.
    else if (m[2] !== 'em' && !(TYPE_SCALE_PX as readonly number[]).includes(v)) add('R19', m.index, m[0]);
  });
  each(RE_FONT_STYLE, (m) => {
    const v = px(parseFloat(m[1]), m[2] ?? 'px');
    if (v <= 1) return; // unitless line-height-like ratios are not sizes
    if (v < 11) add('R1', m.index, m[0]);
    else if (!(TYPE_SCALE_PX as readonly number[]).includes(v)) add('R19', m.index, m[0]);
  });

  // R2 — 900
  each(RE_BLACK, (m) => add('R2', m.index, m[0]));

  // R3 — colour literals
  each(RE_HEX, (m) => add('R3', m.index, m[0]));
  each(RE_RGB, (m) => add('R3', m.index, m[0]));

  // R4 / R5 — palette
  each(RE_PALETTE, (m) => {
    add('R4', m.index, m[0]);
    if (/^(green|emerald|lime)$/.test(m[1])) add('R5', m.index, m[0]);
  });

  // R6 — native dialogs
  each(RE_DIALOG, (m) => add('R6', m.index, m[0]));

  // R13 — motion
  each(RE_ANIM, (m) => {
    if (!/(^|:)motion-safe:/.test(m[1]) && !/motion-reduce:/.test(m[1])) add('R13', m.index, m[0]);
  });

  // R14 — emoji
  each(RE_EMOJI, (m) => add('R14', m.index, m[0]));

  // R16 — locale-dependent formatting
  each(RE_LOCALE, (m) => add('R16', m.index, m[0]));

  // R18 — half spacing steps
  each(RE_SPACING, (m) => {
    if (m[2] !== undefined) {
      const v = parseFloat(m[2]);
      if (v % 4 === 0) return;
      if (v !== 2) return void add('R18', m.index, m[0]);
    } else if (m[1] !== '0.5') {
      return void add('R18', m.index, m[0]);
    }
    // 2 px: allowed inside chips/identifiers and for icon alignment (ADR-048).
    const tag = enclosingTag(m.index);
    if (tag && lucideLocal.has(tag.name)) return;
    const ctx = tag ? tag.text : code.slice(lineStarts[lineOf(m.index) - 1], code.indexOf('\n', m.index) >>> 0);
    if (/(?<![\w-])(shrink-0|flex-none|rounded(?:-[\w[\]]+)?|font-cc-mono)(?![\w-])/.test(ctx)) return;
    add('R18', m.index, m[0]);
  });

  // R12 — workspace form
  if (workspace) {
    each(RE_BIG_RADIUS, (m) => {
      if (m[1] !== undefined && px(parseFloat(m[1]), m[2]) <= 12) return;
      add('R12', m.index, m[0]);
    });
    each(RE_BIG_SHADOW, (m) => add('R12', m.index, m[0]));
    each(RE_GRADIENT, (m) => add('R12', m.index, m[0]));
    each(RE_BLUR, (m) => add('R12', m.index, m[0]));
  }

  // R15 — model-work icons: every use of a lucide AI icon's local name.
  for (const [local, exported] of lucide) {
    if (!AI_ICONS.has(exported)) continue;
    const re = new RegExp(`(?<![\\w.])${local}(?![\\w])`, 'g');
    const importSpan = /import\s*(?:type\s*)?\{[^}]*\}\s*from\s*['"]lucide-react['"]/g;
    const skip: [number, number][] = [...code.matchAll(importSpan)].map((x) => [x.index!, x.index! + x[0].length]);
    each(re, (m) => {
      if (skip.some(([a, b]) => m.index >= a && m.index < b)) return;
      add('R15', m.index, m[0]);
    });
  }

  // Tag-level rules
  for (const t of tags) {
    const cls = classAttr(t.text);
    const tokens = cls ? classTokens(cls) : [];

    // R7 — own-surface button/link
    if (t.name === 'button' || t.name === 'a' || t.name === 'Link') {
      if (cls && !/CC_BUTTON_|publicButton\s*\(/.test(cls)) {
        if (tokens.some((k) => /^bg-/.test(k) && !NON_SURFACE_BG.test(k))) add('R7', t.start, t.text.slice(0, 100));
      }
    }

    // R8 — outline removed without a visible-focus replacement
    if (/(?<![\w-])outline-none(?![\w-])|\boutline:\s*['"]?none/.test(t.text)) {
      if (!/focus-visible:(?:ring|outline|shadow|border)|focus:ring|focus:outline-(?!none)|focus-within:ring/.test(t.text)) {
        add('R8', t.start, t.text.slice(0, 100));
      }
    }

    // R9 — click on a non-interactive element
    // A scrim (`data-backdrop`, the library's `data-cc-scrim`) is dismissed by
    // Escape, and a `role="option"` row is driven by its combobox input.
    if (
      /^(div|span|li|tr|td)$/.test(t.name) &&
      /\bonClick=/.test(t.text) &&
      !/\bdata-(?:backdrop|cc-scrim)\b/.test(t.text) &&
      !/\brole=["']option["']/.test(t.text)
    ) {
      if (!/\brole=/.test(t.text) || !/\bonKey(?:Down|Up|Press)=/.test(t.text)) add('R9', t.start, t.text.slice(0, 100));
    }

    // R10 — hand-built overlay
    if (!/^components\/cc\/(MessageBox|Dialog)\.tsx$/.test(rel) && cls && tokens.includes('fixed') && tokens.includes('inset-0')) {
      add('R10', t.start, t.text.slice(0, 100));
    }

    // R11 — raw table
    if (t.name === 'table' && rel !== 'components/cc/Table.tsx' && !(cls && /\bdoc-table\b/.test(cls))) {
      add('R11', t.start, t.text.slice(0, 100));
    }

    // R17 — free badge
    if (!inLibrary && /^(span|div|p)$/.test(t.name) && cls && !/(?<![\w-])prose(?![\w-])/.test(cls)) {
      const pad = tokens.some((k) => /^px-(1|1\.5|2|2\.5|3)$/.test(k)) && tokens.some((k) => /^py-(0|0\.5|1)$/.test(k));
      const round = tokens.some((k) => /^rounded(-full|-md|-lg|-sm)?$/.test(k));
      const small = tokens.some((k) => /^text-(\[(7|8|9|10|11|12)px\]|xs)$/.test(k));
      const filled = tokens.some((k) => /^bg-(?!cc-|white$|transparent$)/.test(k) && !NON_SURFACE_BG.test(k));
      if (pad && round && small && filled) add('R17', t.start, t.text.slice(0, 100));
    }
  }

  return hits.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

export function countHits(hits: Hit[]): RuleCounts {
  const out: RuleCounts = {};
  for (const h of hits) out[h.rule] = (out[h.rule] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------
// Baseline files and the ratchet
// ---------------------------------------------------------------------------

export interface BaselineEntry extends RuleCounts {
  step: string;
}
export interface BaselineFile {
  $comment?: string;
  group: string;
  files: Record<string, BaselineEntry>;
}

export const STEP_PATTERN = /^D\.\d+[a-z]?$/;

export interface RatchetFinding {
  kind: 'over' | 'under' | 'unlisted' | 'stale' | 'malformed';
  rel: string;
  rule?: RuleId;
  count?: number;
  ceiling?: number;
  message: string;
}

/**
 * Compare measured counts against the ceilings. `counts` holds every UI file on
 * disk (zero-count files included); `baseline` is every group file merged.
 */
export function ratchet(
  counts: Map<string, RuleCounts>,
  baseline: Map<string, { group: string; entry: BaselineEntry }>,
): RatchetFinding[] {
  const out: RatchetFinding[] = [];
  for (const [rel, c] of counts) {
    const listed = baseline.get(rel);
    for (const rule of RULE_IDS) {
      const n = c[rule] ?? 0;
      const ceiling = listed ? (listed.entry[rule] ?? 0) : 0;
      if (n > ceiling) {
        out.push({
          kind: listed ? 'over' : 'unlisted',
          rel,
          rule,
          count: n,
          ceiling,
          message: `${rel}: ${rule} (${RULE_TITLES[rule]}) ${n} > ceiling ${ceiling}`,
        });
      } else if (n < ceiling) {
        out.push({
          kind: 'under',
          rel,
          rule,
          count: n,
          ceiling,
          message: `${rel}: ${rule} ${n} < ceiling ${ceiling} — lower it: npm run design:baseline -- --group ${listed!.group}`,
        });
      }
    }
  }
  for (const [rel, { group }] of baseline) {
    if (!counts.has(rel)) {
      out.push({ kind: 'stale', rel, message: `${rel}: listed in ${group}.json but not a UI file on disk — remove the entry` });
    }
  }
  return out;
}

/** Structural checks on one group file (test 4). */
export function validateBaseline(file: BaselineFile, fileName: string): string[] {
  const problems: string[] = [];
  if (`${file.group}.json` !== fileName) problems.push(`${fileName}: "group" is "${file.group}"`);
  for (const [rel, entry] of Object.entries(file.files ?? {})) {
    if (!STEP_PATTERN.test(entry.step ?? '')) problems.push(`${fileName} ${rel}: step "${entry.step}" does not name a step D.x`);
    const owner = groupOf(rel);
    if (!owner || owner.group !== file.group) problems.push(`${fileName} ${rel}: belongs to group ${owner?.group ?? '(none)'}, not ${file.group}`);
    const keys = Object.keys(entry).filter((k) => k !== 'step');
    if (keys.length === 0) problems.push(`${fileName} ${rel}: an entry without a rule is an empty exception — remove it`);
    for (const k of keys) {
      if (!(RULE_IDS as readonly string[]).includes(k)) problems.push(`${fileName} ${rel}: unknown rule ${k}`);
      const v = (entry as unknown as Record<string, unknown>)[k];
      if (!Number.isInteger(v) || (v as number) <= 0) problems.push(`${fileName} ${rel}: ${k} must be a positive integer (omit zero)`);
    }
  }
  return problems;
}

/** Serialise an entry with the step first and rules in order, zeros omitted. */
export function makeEntry(step: string, counts: RuleCounts): BaselineEntry | null {
  const entry: BaselineEntry = { step };
  let any = false;
  for (const r of RULE_IDS) {
    const n = counts[r] ?? 0;
    if (n > 0) {
      entry[r] = n;
      any = true;
    }
  }
  return any ? entry : null;
}
