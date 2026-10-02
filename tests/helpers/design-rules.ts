/**
 * The rules of `tests/design-source-guard.spec.ts`, as pure functions.
 *
 * Pure on purpose: no `fs`, no network, no Playwright — the spec feeds them the
 * files on disk and, for its negative probes, sources written in memory.
 *
 * Every rule is a source heuristic, not a rendered measurement; the rendered
 * truth belongs to `tests/design-rendered-guard.spec.ts` (D.2). Since D.30 the
 * guard asks for zero hits in every file. From D.1 to D.30 it held a ceiling
 * per file and rule in `tests/design-baseline/<group>.json`, lowered step by
 * step; the lists reached zero and were deleted with D.30. What remains are the
 * named exceptions below, each a rule with its reason rather than a list entry.
 *
 * Where each rule comes from (DESIGN.md):
 *   R1  type below 11 px ............................ §1.2 "lower limit 11 px"
 *   R2  weight 900 .................................. §1.2 "there is no 900 in the workspace"
 *   R3  hex / rgb() / hsl() literal ................. §1.1, §8 "tokens instead of hex"
 *   R4  Tailwind palette class ...................... §1.1, §8
 *   R5  green palette class (subset of R4) .......... §1.1, ADR-007 "green means evidenced"
 *   R6  native alert / confirm / prompt ............. §1.5, §2.6 Message Box
 *   R7  own-surface button or link .................. §1.5 "exactly four"
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
// Which files, and the named exceptions
// ---------------------------------------------------------------------------

/**
 * Standalone exports (block D, D.28) — the one exception for colour literals.
 *
 * The Confluence/HTML exports of Analyze, Design and Documentation and the
 * audit pack's Word summary are files a reader opens outside the application,
 * where the CSS variables of `app/globals.css` do not exist. Their colours are
 * therefore written out once, as named values equal to the tokens, in
 * `lib/export-style.ts`: R3 does not apply to that file ("Standalone-Export").
 * The templates that use it are read as well and hold no colour literal of
 * their own — so a hex cannot hide in `lib/` — but they may write a raw
 * `<table>` (R11): a document has no `CcTable`. Every other rule applies.
 */
export const STANDALONE_EXPORT_STYLE = 'lib/export-style.ts';
export const STANDALONE_EXPORT_TEMPLATES = [
  'lib/analysis-export.ts',
  'lib/design-export.ts',
  'lib/documentation-export.ts',
  'lib/audit-pack.ts',
] as const;
export const STANDALONE_EXPORT_FILES = [STANDALONE_EXPORT_STYLE, ...STANDALONE_EXPORT_TEMPLATES] as const;

/**
 * Named rule exceptions for the library (block D, D.33). The library holds
 * itself to every rule; these are the two places where DESIGN.md itself says a
 * rule does not apply, written as a rule with its reason rather than as an
 * entry in a baseline list. Each is as narrow as its case: one attribute in one
 * file, one piece of arithmetic. (The looks §1.5 fixes outside the four
 * buttons — icon button "wie ghost", the segmented control — need none: they
 * are shared constants in the library, like `CC_BUTTON_*`.)
 *
 * TABLE_ROW_OPEN (R9) — DESIGN.md §2.4 and `CcTable`: `onOpen` on a row is a
 *   mouse shortcut beside a real link in a cell, never the only way in, so the
 *   row has no role and no key handler on purpose (a role on a `<tr>` would
 *   break the table for a screen reader). Only the `<tr data-cc-table-row>` in
 *   `components/cc/Table.tsx`.
 *
 * TOUCH_TARGET_COMPENSATION (R18) — DESIGN.md §2.9/§2.10 (WG-03): the "Why?"
 *   target is 24 px and grows to 44 px on a phone and under a coarse pointer; a
 *   negative margin of exactly (44 − 24) / 2 = 10 px (`-m-2.5`) under the same
 *   variant keeps the row from growing. That is arithmetic on a hit area, not a
 *   spacing step, so it passes only in a tag that is `h-6 w-6` and `h-11 w-11`
 *   under the very variant that carries the margin.
 */
export const TABLE_ROW_OPEN = { file: 'components/cc/Table.tsx', attribute: 'data-cc-table-row' } as const;
export const TOUCH_TARGET_COMPENSATION = { margin: '-m-2.5', base: ['h-6', 'w-6'], grown: ['h-11', 'w-11'] } as const;

/** True when a `-m-2.5` at `index` is TOUCH_TARGET_COMPENSATION inside `tagText`. */
function compensatesTouchTarget(code: string, index: number, tagText: string | undefined): boolean {
  if (!tagText) return false;
  // The variant prefix written right before the margin, e.g. `max-[600px]:`.
  let start = index;
  while (start > 0 && !/[\s'"`{}]/.test(code[start - 1])) start--;
  const variant = code.slice(start, index);
  if (!variant || !variant.endsWith(':')) return false;
  const tokens = new Set(tagText.split(/[\s'"`{}()+,]+/).filter(Boolean));
  return (
    TOUCH_TARGET_COMPENSATION.base.every((k) => tokens.has(k)) &&
    TOUCH_TARGET_COMPENSATION.grown.every((k) => tokens.has(`${variant}${k}`))
  );
}

/**
 * The files the guard reads: every `.tsx` under `app/` and `components/`
 * (route handlers under `app/api/` are not UI), plus the `.ts` style modules
 * under `components/` (e.g. `components/cc/state.ts`, where class strings live).
 */
export function isUiFile(rel: string): boolean {
  if ((STANDALONE_EXPORT_FILES as readonly string[]).includes(rel)) return true;
  if (rel.startsWith('app/api/')) return false;
  if (rel.startsWith('app/') && rel.endsWith('.tsx')) return true;
  if (rel.startsWith('components/') && /\.(tsx|ts)$/.test(rel) && !rel.endsWith('.d.ts')) return true;
  return false;
}

/**
 * Public pages (§1.4 "public pages": 22–28 px radii, mesh, shadows "as
 * today", E-5). R12 is a workspace rule and does not apply to them. The list is
 * the public surfaces of the plan's Lane C: landing, public header and footer,
 * catalogue and method, public content, legal and account-action pages, and the
 * knowledge pages.
 */
const PUBLIC_SURFACE: ((rel: string) => boolean)[] = [
  // landing (D.27), the landing mesh included
  (r) =>
    r === 'app/page.tsx' ||
    r.startsWith('components/landing/') ||
    [
      'LandingModals', 'SectionHeader', 'BenefitCard', 'FooterCTA', 'HeroCTA', 'LandingProcess', 'PilotWarningBanner',
      'PricingCTA', 'SamplePackageDownload', 'TransformationShowroom', 'TransformationReplay',
    ].some((n) => r === `components/${n}.tsx`),
  // public header and footer (D.24)
  (r) =>
    r === 'app/catalog/layout.tsx' ||
    r === 'app/features/layout.tsx' ||
    ['PublicHeader', 'SiteFooter', 'SapTrademarkNotice'].some((n) => r === `components/${n}.tsx`),
  // catalogue and level method (D.25a)
  (r) => r.startsWith('app/catalog/') || r.startsWith('components/catalog/') || r.startsWith('app/method/'),
  // public content (D.25b)
  (r) =>
    ['whitepaper', 'facts', 'reference-analysis', 'licenses', 'clean-core-explained-print', 'features'].some((n) => r.startsWith(`app/${n}/`)),
  // legal and account-action pages (D.26), `app/datenschutz/de` included
  (r) =>
    ['terms', 'datenschutz', 'impressum', 'auth', 'survey', 'unsubscribe'].some((n) => r.startsWith(`app/${n}/`)) ||
    r === 'app/error.tsx' ||
    r === 'app/not-found.tsx',
  // knowledge pages (D.23a/b)
  (r) =>
    [
      'clean-core-explained', 'clean-core-score', 'how-it-works', 'sap-cloudification', 'abap-custom-code-analysis',
      'sap-clean-core-object-classification', 'knowledge', 'how-to', 'about', 'trust', 'tenant-security', 'first-run',
      'verify-pack', 'invitation',
    ].some((n) => r.startsWith(`app/(app)/${n}/`)) ||
    ['KnowledgeClient', 'HowToClient', 'GuideShareBar', 'TrustBeforeUpload', 'InviteReaderDialog'].some((n) => r === `components/${n}.tsx`),
];

/** True for a public page (§1.4); see PUBLIC_SURFACE. */
export function isPublicFile(rel: string): boolean {
  return PUBLIC_SURFACE.some((m) => m(rel));
}

/**
 * R12 is a workspace rule: everything that is not a public page and belongs to
 * the application — the authenticated shell, the components, the root layout
 * and `app/components/`. The standalone exports under `lib/` are documents, not
 * workspace.
 */
export function isWorkspaceFile(rel: string): boolean {
  if (isPublicFile(rel)) return false;
  return (
    rel.startsWith('app/(app)/') ||
    rel.startsWith('components/') ||
    rel.startsWith('app/components/') ||
    rel === 'app/layout.tsx'
  );
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
  const standaloneExport = (STANDALONE_EXPORT_FILES as readonly string[]).includes(rel);
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

  // R3 — colour literals (not in the export stylesheet, see STANDALONE_EXPORT_STYLE)
  if (rel !== STANDALONE_EXPORT_STYLE) {
    each(RE_HEX, (m) => add('R3', m.index, m[0]));
    each(RE_RGB, (m) => add('R3', m.index, m[0]));
  }

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
    if (m[0] === TOUCH_TARGET_COMPENSATION.margin && compensatesTouchTarget(code, m.index, enclosingTag(m.index)?.text)) return;
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
    // `rounded(-…)` with dashes inside the suffix too: `rounded-cc-row` is a
    // chip's radius as much as `rounded-sm` is (D.5e).
    if (/(?<![\w-])(shrink-0|flex-none|rounded(?:-[\w[\]-]+)?|font-cc-mono)(?![\w-])/.test(ctx)) return;
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

    // R7 — own-surface button/link (§1.5). `hover:bg-*` counts too, on
    // purpose: `p-2 rounded-lg hover:bg-gray-100` is a hand-built icon button
    // and `px-4 py-2 hover:bg-gray-100` a hand-built ghost, and neither is one
    // of the four — the surface only appears later. What does not count is a
    // menu item or a listbox option (D.5e): those are rows of a list with a
    // look of their own, not buttons in the sense of §1.5, and before this the
    // shell menus had to move their item classes to the parent to get past it.
    if (t.name === 'button' || t.name === 'a' || t.name === 'Link') {
      const listRow = /\brole=["'](?:menuitem|menuitemradio|menuitemcheckbox|option)["']/.test(t.text);
      if (cls && !listRow && !/CC_BUTTON_|publicButton\s*\(/.test(cls)) {
        if (tokens.some((k) => /^bg-/.test(k) && !NON_SURFACE_BG.test(k))) add('R7', t.start, t.text.slice(0, 100));
      }
    }

    // R8 — outline removed without a visible-focus replacement.
    // In Tailwind v4 `outline-none` sets `outline-style: none` (and
    // `--tw-outline-style: none`), and a width or colour utility under
    // `focus-visible:` reads that variable — so `outline-none
    // focus-visible:outline-2` draws nothing. An outline counts as a
    // replacement only with a style of its own (`outline-solid`, `-dashed`, …);
    // a ring, a shadow or a border always does (D.5e, from D.3).
    if (/(?<![\w-])outline-none(?![\w-])|\boutline:\s*['"]?none/.test(t.text)) {
      if (
        !/focus-visible:(?:ring|shadow|border)|focus:ring|focus-within:ring|(?:focus-visible|focus):outline-(?:solid|dashed|dotted|double)(?![\w-])/.test(
          t.text,
        )
      ) {
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
      !/\brole=["']option["']/.test(t.text) &&
      !(rel === TABLE_ROW_OPEN.file && t.name === 'tr' && t.text.includes(`${TABLE_ROW_OPEN.attribute}=`))
    ) {
      if (!/\brole=/.test(t.text) || !/\bonKey(?:Down|Up|Press)=/.test(t.text)) add('R9', t.start, t.text.slice(0, 100));
    }

    // R10 — hand-built overlay
    if (!/^components\/cc\/(MessageBox|Dialog)\.tsx$/.test(rel) && cls && tokens.includes('fixed') && tokens.includes('inset-0')) {
      add('R10', t.start, t.text.slice(0, 100));
    }

    // R11 — raw table
    if (t.name === 'table' && !standaloneExport && rel !== 'components/cc/Table.tsx' &&!(cls && /\bdoc-table\b/.test(cls))) {
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
