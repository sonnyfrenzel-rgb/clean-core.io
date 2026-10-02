/**
 * The rendered half of the design guard — Block D, step D.2.
 *
 * `tests/design-source-guard.spec.ts` (D.1) reads the source. Source cannot say
 * what a reader sees: a class that Tailwind does not emit, a colour inherited
 * from three levels up, a heading level that depends on which branch rendered.
 * This file holds what the rendered walk (`tests/design-rendered-guard.spec.ts`)
 * needs besides the browser: the routes it visits and the six checks. Until
 * D.30 each route had ceilings in a baseline folder and a ratchet over them;
 * since D.30 every route stands at zero and the guard asks for zero.
 *
 * The six checks are the gallery's (`cc-token-guard`, `cc-style-guard`,
 * `cc-library-addenda`), carried from `[data-cc-gallery]` to whole pages:
 *
 *   small       text below the 11 px floor (DESIGN.md §1.2)
 *   contrast    text below 4.5:1 (3:1 when large) against the colour actually
 *               behind it, translucent layers composited and the `opacity` of
 *               the text and its ancestors applied (§1.1)
 *   focus       a Tab stop that shows no indicator: focusing it changes neither
 *               an outline of at least 2 px nor a visible ring (box-shadow) —
 *               a shadow the element wears anyway is decoration (§1.6)
 *   headings    a heading more than one level below the one before it; the
 *               outline starts at level 0, so a page that opens on h2 has one (§2.3)
 *   heavy       text heavier than 800 (§1.2: 900 does not exist; public pages
 *               follow with 3.0, §1.7)
 *   colourOnly  a state colour (red, amber, green) on a dot, bar or icon with no
 *               word next to it and no accessible name (§2.3 "never only colour")
 *
 * Every count is of *elements*, not of pixels or of occurrences, so a page that
 * repeats one bad row twenty times counts twenty — that is what a reader meets.
 */
export const CHECK_IDS = ['small', 'contrast', 'focus', 'headings', 'heavy', 'colourOnly'] as const;
export type CheckId = (typeof CHECK_IDS)[number];
export type CheckCounts = Partial<Record<CheckId, number>>;

export const CHECK_LABEL: Record<CheckId, string> = {
  small: 'type < 11 px',
  contrast: 'text contrast below floor',
  focus: 'Tab stop without a visible ring',
  headings: 'heading level skipped',
  heavy: 'weight > 800',
  colourOnly: 'state colour without text',
};

/**
 * Which session opens a route: `public` in a fresh, signed-out context (what a
 * visitor sees), `signed-in` as an administrator with the Terms accepted (the
 * admin console needs the role; `/project/[id]` needs only an account since
 * roadmap 3.0.1).
 */
export type Session = 'public' | 'signed-in';

export interface RouteDef {
  /** A short name for the route, e.g. the probe route `trust`. */
  key: string;
  /** The route as the plan names it. */
  route: string;
  session: Session;
  /** The URL; `{project}` is the seeded project. */
  url: string;
  /** Each present once the page's content — not its skeleton — has rendered. */
  ready: string[];
}

/** The catalogue object the walk opens: a table every S/4 system has. */
export const CATALOG_OBJECT = 'vbak';

/** The workspace's first look has built up (`components/workspace/FirstLook.tsx`), as `workspace-a11y` waits for it. */
const FIRST_LOOK_DONE = '[data-first-look="end-state"], [data-first-look="complete"]';

export const STAGES = ['analyze', 'design', 'transformation', 'documentation', 'testing', 'tco', 'delivery'] as const;

export const ROUTES: RouteDef[] = [
  { key: 'landing', route: '/', session: 'public', url: '/', ready: ['[data-section-heading]'] },
  { key: 'catalog', route: '/catalog', session: 'public', url: '/catalog', ready: ['h1'] },
  { key: 'catalog-object', route: '/catalog/[object]', session: 'public', url: `/catalog/${CATALOG_OBJECT}`, ready: ['h1'] },
  { key: 'knowledge', route: '/knowledge', session: 'public', url: '/knowledge', ready: ['h1'] },
  { key: 'clean-core-explained', route: '/clean-core-explained', session: 'public', url: '/clean-core-explained', ready: ['h1'] },
  { key: 'trust', route: '/trust', session: 'public', url: '/trust', ready: ['h1'] },
  { key: 'how-to', route: '/how-to', session: 'public', url: '/how-to', ready: ['h1'] },
  { key: 'demo-analyze', route: '/demo/[stage] (analyze)', session: 'public', url: '/demo/analyze', ready: ['h1'] },
  // Every signed-in account's since 3.0.1; a visitor is sent to sign in and back (DemoWorkspaceShell).
  { key: 'demo-workspace', route: '/demo/workspace', session: 'signed-in', url: '/demo/workspace', ready: ['[data-demo-ready="true"] h1', FIRST_LOOK_DONE] },
  { key: 'settings', route: '/settings', session: 'signed-in', url: '/settings', ready: ['h1'] },
  { key: 'admin-workspace', route: '/admin/workspace', session: 'signed-in', url: '/admin/workspace', ready: ['h1'] },
  { key: 'dashboard', route: '/dashboard', session: 'signed-in', url: '/dashboard', ready: ['h1'] },
  ...(['business', 'it', 'management'] as const).map((view) => ({
    key: `project-${view}`,
    route: `/project/[id] (${view})`,
    session: 'signed-in' as const,
    url: `/project/{project}?view=${view}`,
    ready: [`[data-workspace-shell="${view}"] h1`, FIRST_LOOK_DONE],
  })),
  ...STAGES.map((stage) => ({
    key: `stage-${stage}`,
    route: `/project/[id]/${stage}`,
    session: 'signed-in' as const,
    url: `/project/{project}/${stage}`,
    ready: ['[data-stage-title]'],
  })),
];

/**
 * The comparison of the negative probe: which checks rose from `before` to
 * `after` on the same loaded page. Since D.30 every route stands at zero, so
 * the guard itself asks for zero and needs no ceiling; the probe still needs a
 * "more than a moment ago", because it proves each check sees its element.
 */
export function roseFrom(before: CheckCounts, after: CheckCounts): CheckId[] {
  return CHECK_IDS.filter((c) => (after[c] ?? 0) > (before[c] ?? 0));
}

// ── in the browser ───────────────────────────────────────────────────────────
//
// The functions below run inside the page (`page.evaluate`, `waitForFunction`)
// and are serialised by Playwright, so each is self-contained: no imports, no
// closures over this module.

export interface PageMeasure {
  counts: Record<Exclude<CheckId, 'focus'>, number>;
  samples: Record<Exclude<CheckId, 'focus'>, string[]>;
  /** How many text elements were measured — a walk that measured nothing proves nothing. */
  texts: number;
}

/**
 * True once the page has settled: no skeleton, nothing `aria-busy`, no finite
 * animation or transition running, and neither the text nor the element count
 * has changed for `quietMs`. A condition polled until it holds, not a pause —
 * a production build satisfies it in a fraction of what a compiling dev server
 * needs. Persistent (infinite) animations such as a spinner do not hold it up;
 * the reduced-motion emulation of the spec stops most of them anyway.
 */
export function pageSettled(quietMs: number): boolean {
  const w = window as unknown as { __d2Sig?: string; __d2Since?: number };
  const busy = document.querySelector('[aria-busy="true"], [data-cc-skeleton-shown="true"]');
  const running = document.getAnimations().filter((a) => {
    if (a.playState !== 'running') return false;
    const end = a.effect?.getComputedTiming().endTime;
    return typeof end === 'number' && Number.isFinite(end);
  }).length;
  const sig = `${document.body.innerText.length}:${document.getElementsByTagName('*').length}`;
  const now = performance.now();
  if (busy || running || sig !== w.__d2Sig || w.__d2Since === undefined) {
    w.__d2Sig = sig;
    w.__d2Since = now;
    return false;
  }
  return now - w.__d2Since >= quietMs;
}

/**
 * Stops every endless animation at its start frame. A decorative loop (the
 * landing's drifting code particles, a pulsing blob) keeps moving under reduced
 * motion when its animation is set inline, and an element that happens to be
 * mid-fade or clipped at the moment of measuring would be counted on one run
 * and not on the next. Frame 0 of a delayed loop is the element's own style —
 * the same on every run. Finite animations are left alone: the settle
 * condition has already let them finish, and rewinding a fade-in would measure
 * the invisible first frame.
 */
export function freezeEndlessAnimations(): number {
  let frozen = 0;
  for (const a of document.getAnimations()) {
    const end = a.effect?.getComputedTiming().endTime;
    if (typeof end === 'number' && Number.isFinite(end)) continue;
    a.pause();
    a.currentTime = 0;
    frozen += 1;
  }
  return frozen;
}

/** Everything except the Tab walk, in one pass over the document. */
export function measurePage(sampleMax = 12): PageMeasure {
  const SAMPLE_MAX = sampleMax;
  const counts = { small: 0, contrast: 0, headings: 0, heavy: 0, colourOnly: 0 };
  const samples: Record<keyof typeof counts, string[]> = { small: [], contrast: [], headings: [], heavy: [], colourOnly: [] };
  const note = (check: keyof typeof counts, text: string) => {
    counts[check] += 1;
    if (samples[check].length < SAMPLE_MAX) samples[check].push(text);
  };

  const parse = (value: string): number[] | null => {
    const m = /rgba?\(([^)]+)\)/.exec(value);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map((s) => (s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s)));
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const lum = (c: number[]) => {
    const ch = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
  };
  const ratio = (a: number[], b: number[]) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };

  const describe = (el: Element) => {
    const cls = (el.getAttribute('class') || '').replace(/\s+/g, ' ').slice(0, 70);
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}> "${text}"`;
  };

  /**
   * The text and the colour behind it, both as the reader sees them. Walks from
   * the element to the root and composites the way the browser does: at each
   * level what is inside is painted over that element's own background, and the
   * whole group is then faded by that element's `opacity` before it meets the
   * level below. Run twice in one walk — once with the text on top and once
   * without — so an `opacity: 0.7` on the text or on any ancestor lightens the
   * text against the ground behind the group, not against its own card. A
   * gradient counts as its least favourable opaque stop against `fg` — text on a
   * gradient has to be readable on all of it. A picture (`url(...)`) cannot be
   * measured: null. Colours are premultiplied `[r·a, g·a, b·a, a]` while they
   * are composited; the result is opaque over white.
   */
  const textAndGround = (start: Element, fg: number[]): { text: number[]; ground: number[] } | null => {
    const pm = (c: number[]) => [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
    const on = (top: number[], under: number[]) => under.map((v, i) => top[i] + v * (1 - top[3]));
    let text = pm(fg);
    let ground = [0, 0, 0, 0];
    for (let node: Element | null = start; node; node = node.parentElement) {
      const s = getComputedStyle(node);
      // Once the ground is opaque, backgrounds further up are covered; only an
      // opacity below 1 on the way up lets them through again.
      if (ground[3] < 0.999) {
        const image = s.backgroundImage;
        let layer: number[] | null = null;
        if (image && image !== 'none') {
          if (/url\(/.test(image)) return null;
          const stops = [...image.matchAll(/rgba?\([^)]+\)/g)].map((m) => parse(m[0])).filter((c): c is number[] => !!c && c[3] >= 1);
          if (stops.length) layer = stops.sort((a, b) => ratio(fg, a) - ratio(fg, b))[0];
        }
        // What is inside goes over the image, the image over the element's
        // background colour — so the gradient first, then the colour.
        const bg = parse(s.backgroundColor);
        for (const under of [layer, bg && bg[3] > 0 ? bg : null]) {
          if (!under) continue;
          text = on(text, pm(under));
          ground = on(ground, pm(under));
        }
      }
      const o = parseFloat(s.opacity || '1');
      if (o < 1) {
        text = text.map((v) => v * o);
        ground = ground.map((v) => v * o);
      }
    }
    const white = [255, 255, 255, 1];
    return { text: on(text, white).slice(0, 3), ground: on(ground, white).slice(0, 3) };
  };

  const effectiveOpacity = (el: Element) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity || '1');
    return o;
  };

  const visible = (el: Element) => {
    if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true } as CheckVisibilityOptions)) return false;
    const r = el.getBoundingClientRect();
    // `sr-only` is 1×1 and clipped: read by a screen reader, seen by nobody.
    return r.width > 1 && r.height > 1;
  };

  const ownText = (el: Element) =>
    Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => (n.textContent || '').trim())
      .join('');

  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'OPTION', 'TITLE', 'svg']);
  let texts = 0;
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (SKIP.has(el.tagName)) continue;
    const own = ownText(el);
    if (!own || !visible(el)) continue;
    const s = getComputedStyle(el);
    const opacity = effectiveOpacity(el);
    if (opacity < 0.05) continue;
    texts += 1;
    const size = parseFloat(s.fontSize);
    const weight = parseInt(s.fontWeight, 10) || 400;
    if (size < 11) note('small', `${describe(el)} ${s.fontSize}`);
    if (weight > 800) note('heavy', `${describe(el)} ${weight}`);

    // Contrast: two characters at least (a lone "·" separator is not text),
    // not a disabled control's dimmed label, not gradient-clipped text. A
    // disabled control is named by what it is, not guessed from how faint it
    // is: WCAG 1.4.3 exempts inactive components, and the design system dims
    // them to 0.6 — which the opacity applied below would otherwise count.
    // Faintness itself exempts nothing: text at opacity 0.5 is still read, and
    // an opacity floor here let any active text out of the measurement.
    if (own.length < 2) continue;
    if (el.closest(':disabled, [aria-disabled="true"]')) continue;
    if (/text/.test(s.backgroundClip || '') || /text/.test((s as unknown as Record<string, string>).webkitBackgroundClip || '')) continue;
    const isSvg = el instanceof SVGElement;
    const fg = parse(isSvg ? s.fill : s.color);
    if (!fg) continue;
    const seen = textAndGround(el, fg);
    if (!seen) continue;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const floor = large ? 3 : 4.5;
    const r = ratio(seen.text, seen.ground);
    if (r < floor) {
      const faded = opacity < 1 ? ` at opacity ${Math.round(opacity * 100) / 100}` : '';
      note('contrast', `${Math.round(r * 100) / 100}:1 (needs ${floor}) ${describe(el)} ${s.color}${faded} on rgb(${seen.ground.map(Math.round).join(', ')})`);
    }
  }

  // Headings in document order; the outline starts at 0. A `sr-only` heading
  // counts — the outline is what a screen reader navigates — a `display: none`
  // one does not.
  let previous = 0;
  let previousText = '(start of page)';
  for (const h of Array.from(document.body.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    if (!(h as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true } as CheckVisibilityOptions)) continue;
    const level = Number(h.tagName.slice(1));
    const text = (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (level > previous + 1) note('headings', `h${previous || '-'} "${previousText}" → h${level} "${text}"`);
    previous = level;
    previousText = text;
  }

  // State colour without a word. A small mark (dot, bar, icon) whose fill is red,
  // amber or green, with no text of its own, no accessible name, and no text in
  // its parent or grandparent — "Passed" beside the dot is the pattern §2.3 asks
  // for; a green dot alone in a cell is the one it forbids.
  const stateHue = (c: number[] | null) => {
    if (!c || c[3] < 0.5) return null;
    const [r, g, b] = [c[0] / 255, c[1] / 255, c[2] / 255];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return null;
    const sat = d / (1 - Math.abs(2 * l - 1));
    if (sat < 0.35 || l < 0.2 || l > 0.8) return null;
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    if (h < 15 || h >= 345) return 'red';
    if (h >= 25 && h < 55) return 'amber';
    if (h >= 85 && h < 165) return 'green';
    return null;
  };
  const named = (el: Element | null) =>
    !!el && (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby') || el.hasAttribute('title') || !!el.querySelector('title'));
  const wordNear = (el: Element) => {
    for (let n: Element | null = el, i = 0; n && i < 3; n = n.parentElement, i++) {
      if (named(n)) return true;
      if (i > 0 && ((n as HTMLElement).innerText || '').trim()) return true;
    }
    return false;
  };
  const marks = new Set<Element>();
  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    if (!visible(el)) continue;
    if (el instanceof SVGElement && el.tagName !== 'svg') continue;
    if (Array.from(marks).some((m) => m.contains(el))) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    let hue: string | null = null;
    if (el.tagName === 'svg') {
      if (r.width > 32 || r.height > 32) continue;
      const paint = el.getAttribute('stroke') && el.getAttribute('stroke') !== 'none' ? s.stroke : s.fill;
      hue = stateHue(parse(/currentcolor/i.test(el.getAttribute('stroke') || el.getAttribute('fill') || '') ? s.color : paint));
    } else {
      if (Math.min(r.width, r.height) > 24) continue;
      if ((el.textContent || '').trim()) continue;
      hue = stateHue(parse(s.backgroundColor));
    }
    if (!hue) continue;
    if (wordNear(el)) continue;
    marks.add(el);
    note('colourOnly', `${hue} ${Math.round(r.width)}×${Math.round(r.height)} ${describe(el.parentElement ?? el)}`);
  }

  return { counts, samples, texts };
}

/** The element that has the focus now, as the Tab walk records it; null when none. */
export function focusedRing(): { id: number; ringless: boolean; what: string; again: boolean } | null {
  const w = window as unknown as { __d2Focus?: Map<Element, number> };
  const el = document.activeElement as HTMLElement | null;
  if (!el || el === document.body || el === document.documentElement) return null;
  // The dev server's own overlay ("N" badge) is not the product.
  if (el.tagName === 'NEXTJS-PORTAL' || el.closest('nextjs-portal')) return null;
  w.__d2Focus ??= new Map();
  const again = w.__d2Focus.has(el);
  if (!again) w.__d2Focus.set(el, w.__d2Focus.size);

  // A focus ring that fades in is read at its end, not at whichever frame the
  // walk happened to arrive on.
  for (const a of el.getAnimations()) if (a instanceof CSSTransition) a.finish();
  const s = getComputedStyle(el);

  // The same element unfocused: a shallow copy in the same place, which matches
  // every selector the element does except the focus ones. It is inserted and
  // removed in one task, so it is never painted. No `id`, `name` or `autofocus`,
  // so it joins no radio group and takes nothing from the original. An element
  // that would load something when inserted (a frame, media, a custom element)
  // is not copied; its resting state is taken as "no outline, no shadow".
  let rest = { style: 'none', width: '0px', color: 'rgba(0, 0, 0, 0)', offset: '0px', shadow: 'none' };
  if (!/^(IFRAME|OBJECT|EMBED|VIDEO|AUDIO)$/.test(el.tagName) && !el.tagName.includes('-')) {
    const twin = el.cloneNode(false) as HTMLElement;
    for (const attr of ['id', 'name', 'autofocus']) twin.removeAttribute(attr);
    el.after(twin);
    const u = getComputedStyle(twin);
    rest = { style: u.outlineStyle, width: u.outlineWidth, color: u.outlineColor, offset: u.outlineOffset, shadow: u.boxShadow };
    twin.remove();
  }

  const clear = (color: string) => /transparent|rgba\([^)]*,\s*0\)|\/\s*0\)/.test(color);
  // A visible shadow: a colour that is not transparent and some extent (offset,
  // blur or spread) — `0 0 #0000`, what Tailwind writes for "no ring", is not.
  const shadows = (value: string) =>
    value === 'none' || !value
      ? []
      : value
          .split(/,(?![^(]*\))/)
          .map((part) => part.trim())
          .filter((part) => {
            const color = /(rgba?\([^)]*\)|transparent)/i.exec(part)?.[0] ?? '';
            if (color && clear(color)) return false;
            const lengths = (part.replace(color, '').match(/-?\d*\.?\d+px/g) ?? []).map(parseFloat);
            return lengths.some((n) => n !== 0);
          })
          .sort();
  const outlineOf = (st: { style: string; width: string; color: string; offset: string }) =>
    st.style !== 'none' && parseFloat(st.width) >= 2 && !clear(st.color) ? `${st.style} ${st.width} ${st.color} ${st.offset}` : '';
  const focusedOutline = outlineOf({ style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor, offset: s.outlineOffset });
  const outline = focusedOutline !== '' && focusedOutline !== outlineOf(rest);
  const ringNow = shadows(s.boxShadow);
  const ring = ringNow.length > 0 && ringNow.join('|') !== shadows(rest.shadow).join('|');
  const cls = (el.getAttribute('class') || '').replace(/\s+/g, ' ').slice(0, 70);
  const label = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30);
  return {
    id: w.__d2Focus.get(el)!,
    ringless: !outline && !ring,
    what: `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}> "${label}" outline ${s.outlineWidth} ${s.outlineStyle}, shadow ${s.boxShadow === rest.shadow ? 'unchanged' : s.boxShadow}`,
    again,
  };
}

/** Puts the start of sequential focus navigation at the top of the document. */
export function focusStart(): void {
  const w = window as unknown as { __d2Focus?: Map<Element, number> };
  w.__d2Focus = new Map();
  (document.activeElement as HTMLElement | null)?.blur?.();
  const body = document.body;
  body.tabIndex = -1;
  body.focus({ preventScroll: true });
  body.removeAttribute('tabindex');
}
