/**
 * The design scan — what a design-system audit counts before anyone looks at a
 * screen. Deterministic and token-free: the model gets exact numbers to
 * interpret instead of recounting classes badly.
 *
 * It judges nothing. It says how many colours, sizes, radii, shadows and button
 * styles the product actually uses, where accessibility heuristics hit, and — for
 * a release — which tokens the release introduced that the rest of the product
 * hardly uses.
 */

const VARIANTS = String.raw`(?:[a-z0-9-]+:|\[[^\]]+\]:)*`;
const FAMILIES = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black';
const COLOR_PROPS = 'text|bg|border|border-[xytrbl]|ring|ring-offset|outline|fill|stroke|from|via|to|divide|decoration|placeholder|accent|caret|shadow';

const RE = {
  color: new RegExp(String.raw`(?<![\w-])${VARIANTS}(${COLOR_PROPS})-(${FAMILIES})(?:-(\d{2,3}))?(?:\/\d{1,3})?(?![\w-])`, 'g'),
  darkVariant: /(?<![\w-])dark:/g,
  arbitraryColor: /(?<![\w-])(?:text|bg|border|ring|fill|stroke|from|via|to|shadow|outline)-\[(#[0-9a-fA-F]{3,8}|rgba?\([^\]]*\)|hsla?\([^\]]*\)|oklch\([^\]]*\)|var\([^\]]*\))\]/g,
  hexLiteral: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])/g,
  fontSize: new RegExp(String.raw`(?<![\w-])${VARIANTS}text-(xs|sm|base|lg|xl|[2-9]xl)(?![\w-])`, 'g'),
  arbitraryFontSize: /(?<![\w-])text-\[(\d+(?:\.\d+)?(?:px|rem|em))\]/g,
  fontWeight: new RegExp(String.raw`(?<![\w-])${VARIANTS}font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)(?![\w-])`, 'g'),
  fontFamily: /(?<![\w-])font-(sans|serif|mono)(?![\w-])|fontFamily\s*:/g,
  tracking: /(?<![\w-])tracking-(tighter|tight|normal|wide|wider|widest|\[[^\]]+\])/g,
  letterCase: /(?<![\w-])(uppercase|lowercase|capitalize|normal-case)(?![\w-])/g,
  radius: new RegExp(String.raw`(?<![\w-])${VARIANTS}rounded(?:-(?:t|r|b|l|tl|tr|br|bl|s|e|ss|se|es|ee))?(?:-(none|xs|sm|md|lg|xl|2xl|3xl|4xl|full|\[[^\]]+\]))?(?![\w-])`, 'g'),
  shadow: new RegExp(String.raw`(?<![\w-])${VARIANTS}shadow(?:-(2xs|xs|sm|md|lg|xl|2xl|inner|none|\[[^\]]+\]))?(?![\w-])`, 'g'),
  arbitrarySpacing: /(?<![\w-])(?:p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|w|h|min-w|max-w|min-h|max-h|top|left|right|bottom|inset)-\[([^\]]+)\]/g,
  lucideImport: /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/g,
  otherIconLib: /from\s*['"](react-icons[^'"]*|@heroicons\/[^'"]+|@radix-ui\/react-icons|@mui\/icons-material[^'"]*)['"]/g,
  iconSize: /\bsize=\{(\d+)\}/g,
  emoji: /\p{Extended_Pictographic}/gu,
};

const A11Y = [
  { id: 'img-without-alt', label: '<img> ohne alt', re: /<img\b(?![^>]*\balt=)[^>]*>/g },
  { id: 'click-on-non-interactive', label: 'onClick auf div/span ohne role', re: /<(div|span|li|td)\b(?![^>]*\brole=)[^>]*\bonClick=/g },
  { id: 'icon-button-without-label', label: 'Icon-Button ohne aria-label', re: /<button\b(?![^>]*aria-label)[^>]*>\s*<[A-Z][A-Za-z0-9]*\b[^<>]*\/>\s*<\/button>/g },
  { id: 'outline-none-without-focus-style', label: 'outline-none ohne focus-Stil in derselben Klasse', re: /className=["'`{][^"'`]*\boutline-none\b(?![^"'`]*\bfocus(?:-visible)?:)[^"'`]*/g },
  { id: 'tiny-text', label: 'Schrift unter 12 px (text-[9–11px])', re: /(?<![\w-])text-\[(?:9|10|11)(?:\.\d+)?px\]/g },
  { id: 'positive-tabindex', label: 'tabIndex > 0', re: /tabIndex=\{?["']?[1-9]/g },
];

const GERMAN = /[äöüÄÖÜß]|\b(und|oder|nicht|mit|für|ist|wird|werden|keine?|Sie|Ihre?|der|die|das|zum|zur|noch|jetzt|bitte)\b/;
const ENGLISH = /\b(the|and|or|not|with|for|is|are|your|you|this|to|of|no|now|please|will)\b/;

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function countInto(map, key, n = 1) {
  map.set(key, (map.get(key) || 0) + n);
}

const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

/** JSX text between tags, and string props users read. Rough by design: it only needs to tell languages apart. */
function uiTexts(text) {
  const out = [];
  for (const m of text.matchAll(/>\s*([^<>{}\n]*[A-Za-zÄÖÜäöüß][^<>{}\n]*?)\s*</g)) if (m[1].trim().split(/\s+/).length >= 2) out.push(m[1]);
  for (const m of text.matchAll(/\b(?:title|placeholder|aria-label|label|description)=["']([^"']{6,})["']/g)) out.push(m[1]);
  return out;
}

/** Class strings of an element type, normalised to their base classes so hover and dark variants do not count as a different style. */
function classSignatures(text, tag) {
  const out = [];
  const re = new RegExp(String.raw`<${tag}\b[^>]*?className=(?:"([^"]*)"|'([^']*)'|\{\s*(?:cn|clsx|twMerge)?\(?\s*[\`'"]([^\`'"]*)[\`'"])`, 'g');
  for (const m of text.matchAll(re)) {
    const classes = (m[1] ?? m[2] ?? m[3] ?? '')
      .split(/\s+/)
      .filter((c) => c && !c.includes(':') && !c.includes('${'))
      .sort();
    if (classes.length) out.push(classes.join(' '));
  }
  return out;
}

function tokensOf(text) {
  const tokens = new Map();
  for (const m of text.matchAll(RE.color)) countInto(tokens, `${m[2]}-${m[3] ?? ''}`.replace(/-$/, ''));
  for (const m of text.matchAll(RE.radius)) countInto(tokens, `rounded-${m[1] ?? 'base'}`);
  for (const m of text.matchAll(RE.shadow)) countInto(tokens, `shadow-${m[1] ?? 'base'}`);
  for (const m of text.matchAll(RE.fontSize)) countInto(tokens, `text-${m[1]}`);
  for (const m of text.matchAll(RE.arbitraryFontSize)) countInto(tokens, `text-[${m[1]}]`);
  for (const m of text.matchAll(RE.fontWeight)) countInto(tokens, `font-${m[1]}`);
  for (const m of text.matchAll(RE.arbitraryColor)) countInto(tokens, `[${m[1]}]`);
  for (const m of text.matchAll(RE.arbitrarySpacing)) countInto(tokens, `[${m[1]}]`);
  return tokens;
}

/** @param files [{ path, text }] */
export function designScan(files) {
  const s = {
    files: files.length,
    colorFamilies: new Map(),
    colorShades: new Map(),
    darkVariants: 0,
    arbitraryColors: new Map(),
    hexInTsx: 0,
    hexAt: [],
    fontSizes: new Map(),
    arbitraryFontSizes: new Map(),
    fontWeights: new Map(),
    fontFamilies: new Map(),
    tracking: new Map(),
    letterCase: new Map(),
    radii: new Map(),
    shadows: new Map(),
    arbitrarySpacing: new Map(),
    lucideIcons: new Set(),
    otherIconLibs: new Map(),
    iconSizes: new Map(),
    emoji: [],
    buttons: new Map(),
    buttonCount: 0,
    inputs: new Map(),
    inputCount: 0,
    a11y: Object.fromEntries(A11Y.map((a) => [a.id, { label: a.label, count: 0, at: [] }])),
    language: { german: 0, english: 0, mixedFiles: [] },
    headers: { stageHeader: 0, sectionHeader: 0 },
    tokens: new Map(),
  };

  for (const { path, text } of files) {
    const isStyle = /\.css$/.test(path);
    const isMail = /^lib\/email-/.test(path);

    for (const m of text.matchAll(RE.color)) {
      countInto(s.colorFamilies, m[2]);
      if (m[3]) countInto(s.colorShades, `${m[2]}-${m[3]}`);
    }
    s.darkVariants += (text.match(RE.darkVariant) || []).length;
    for (const m of text.matchAll(RE.arbitraryColor)) countInto(s.arbitraryColors, m[1]);
    if (!isStyle && !isMail) {
      for (const m of text.matchAll(RE.hexLiteral)) {
        s.hexInTsx++;
        if (s.hexAt.length < 8) s.hexAt.push(`${path}:${lineOf(text, m.index)}`);
      }
    }
    for (const m of text.matchAll(RE.fontSize)) countInto(s.fontSizes, m[1]);
    for (const m of text.matchAll(RE.arbitraryFontSize)) countInto(s.arbitraryFontSizes, m[1]);
    for (const m of text.matchAll(RE.fontWeight)) countInto(s.fontWeights, m[1]);
    for (const m of text.matchAll(RE.fontFamily)) countInto(s.fontFamilies, m[1] || 'fontFamily (inline)');
    for (const m of text.matchAll(RE.tracking)) countInto(s.tracking, m[1]);
    for (const m of text.matchAll(RE.letterCase)) countInto(s.letterCase, m[1]);
    for (const m of text.matchAll(RE.radius)) countInto(s.radii, m[1] ?? 'base');
    for (const m of text.matchAll(RE.shadow)) countInto(s.shadows, m[1] ?? 'base');
    for (const m of text.matchAll(RE.arbitrarySpacing)) countInto(s.arbitrarySpacing, m[1]);
    for (const m of text.matchAll(RE.lucideImport)) for (const name of m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0]).filter(Boolean)) s.lucideIcons.add(name);
    for (const m of text.matchAll(RE.otherIconLib)) countInto(s.otherIconLibs, m[1]);
    for (const m of text.matchAll(RE.iconSize)) countInto(s.iconSizes, m[1]);
    if (!isStyle && !isMail) {
      const emoji = (text.match(RE.emoji) || []).length;
      if (emoji) s.emoji.push(`${path} (${emoji})`);
    }

    for (const sig of classSignatures(text, 'button')) {
      s.buttonCount++;
      countInto(s.buttons, sig);
    }
    for (const sig of classSignatures(text, 'input')) {
      s.inputCount++;
      countInto(s.inputs, sig);
    }

    for (const a of A11Y) {
      for (const m of text.matchAll(a.re)) {
        const entry = s.a11y[a.id];
        entry.count++;
        if (entry.at.length < 8) entry.at.push(`${path}:${lineOf(text, m.index)}`);
      }
    }

    if (!isStyle && !isMail) {
      let de = 0;
      let en = 0;
      for (const t of uiTexts(text)) {
        if (GERMAN.test(t)) de++;
        else if (ENGLISH.test(t)) en++;
      }
      s.language.german += de;
      s.language.english += en;
      if (de >= 3 && en >= 3) s.language.mixedFiles.push(`${path} (de ${de} · en ${en})`);
    }

    s.headers.stageHeader += (text.match(/<StageHeader\b/g) || []).length;
    s.headers.sectionHeader += (text.match(/<SectionHeader\b/g) || []).length;
    for (const [k, v] of tokensOf(text)) countInto(s.tokens, k, v);
  }
  return s;
}

/**
 * Tokens a release adds that the product hardly uses elsewhere — the raw
 * material of drift. `baseline` is the scan of the whole product at the new head,
 * so a token counts as rare when, including this release, it appears at most
 * `rareAt` times.
 */
export function introducedTokens(addedText, baseline, rareAt = 3) {
  return [...tokensOf(addedText).entries()]
    .map(([token, added]) => ({ token, added, total: baseline.tokens.get(token) || added }))
    .filter((t) => t.total <= rareAt)
    .sort((a, b) => a.total - b.total || a.token.localeCompare(b.token));
}

const list = (entries) => entries.map(([k, v]) => `${k} ${v}`).join(' · ') || '—';

/** The scan as compact text for the prompt — a few thousand characters, not the raw maps. */
export function renderScan(s, { introduced = null } = {}) {
  const buttonsTop = top(s.buttons, 5).map(([sig, n]) => `  ${n}× ${sig.slice(0, 160)}`);
  const lines = [
    `Design scan over ${s.files} UX files (exact counts).`,
    `Colour families (utility uses): ${list(top(s.colorFamilies, 24))}`,
    `Distinct colour shades: ${s.colorShades.size}; most used: ${list(top(s.colorShades, 20))}`,
    `dark: variants: ${s.darkVariants}`,
    `Arbitrary colours (class-[…]): ${s.arbitraryColors.size ? list(top(s.arbitraryColors, 12)) : 'none'}`,
    `Hex literals in TSX (outside CSS and mails): ${s.hexInTsx}${s.hexAt.length ? ` — e.g. ${s.hexAt.join(', ')}` : ''}`,
    `Font sizes: ${list(top(s.fontSizes, 12))}; arbitrary: ${s.arbitraryFontSizes.size ? list(top(s.arbitraryFontSizes, 12)) : 'none'}`,
    `Font weights: ${list(top(s.fontWeights, 9))}`,
    `Font families: ${list(top(s.fontFamilies, 5))}`,
    `Tracking: ${list(top(s.tracking, 8))} · letter case: ${list(top(s.letterCase, 4))}`,
    `Radii: ${list(top(s.radii, 14))}`,
    `Shadows: ${list(top(s.shadows, 10))}`,
    `Arbitrary spacing/size values: ${s.arbitrarySpacing.size} distinct; most used: ${list(top(s.arbitrarySpacing, 12))}`,
    `Icons: lucide-react ${s.lucideIcons.size} distinct; other icon libraries: ${s.otherIconLibs.size ? list(top(s.otherIconLibs, 5)) : 'none'}; size={N}: ${list(top(s.iconSizes, 8))}`,
    `Emoji in UI files: ${s.emoji.length ? s.emoji.slice(0, 10).join(', ') : 'none'}`,
    `Buttons: ${s.buttonCount} with a class string, ${s.buttons.size} distinct base styles. Most frequent:`,
    ...buttonsTop,
    `Inputs: ${s.inputCount} with a class string, ${s.inputs.size} distinct base styles.`,
    `Headers: <StageHeader> ${s.headers.stageHeader} · <SectionHeader> ${s.headers.sectionHeader}`,
    'Accessibility heuristics (candidates to check, not verdicts):',
    ...Object.values(s.a11y).map((a) => `  ${a.label}: ${a.count}${a.at.length ? ` — ${a.at.join(', ')}` : ''}`),
    `UI language signals: German ${s.language.german} · English ${s.language.english}; files with both: ${s.language.mixedFiles.length ? s.language.mixedFiles.slice(0, 12).join('; ') : 'none'}`,
  ];
  if (introduced) {
    lines.push(introduced.length ? `Introduced by this release and rare in the product (token · added · total): ${introduced.slice(0, 30).map((t) => `${t.token} ${t.added}/${t.total}`).join(' · ')}` : 'Introduced by this release and rare in the product: none');
  }
  return lines.join('\n');
}
