import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Roadmap 3.0.4 — the half of the accessibility base that can be read from the
 * source, without a server. The rendered half is `tests/workspace-a11y.spec.ts`.
 *
 * Each check below holds a line that was crossed before this step and would be
 * easy to cross again without anybody noticing on screen: a list of keyboard
 * shortcuts that promises keys nothing handles, a live region that repeats
 * itself, a menu role over plain links, a "Why?" that is 24px under a thumb,
 * and table headers taken out of the accessibility tree on a phone.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
/** Source without comments — prose may name what code must not do. */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

test.describe('keyboard shortcuts list only keys that work (§5.9 item 12)', () => {
  const menu = code('components/ShellHelpMenu.tsx');

  test('the Help menu offers "Keyboard shortcuts", and the shell mounts it', () => {
    expect(menu).toContain('Keyboard shortcuts');
    expect(menu, 'the list is not a modal dialog').toContain('showModal()');
    expect(read('app/(app)/layout.tsx')).toContain('<ShellHelpMenu');
  });

  test('one help entry in the shell bar, and the assistant leads its menu (Sonny, 01.10.2026)', () => {
    const layout = code('app/(app)/layout.tsx');
    // No second "?" button for the assistant beside the help menu.
    expect(layout, 'the shell bar has its own assistant button again').not.toContain('data-assistant-trigger="header"');
    expect(layout).toContain('<ShellHelpMenu assistantLabel={assistantLabel} inProject={inProject} />');
    // The trigger names itself with visible words, not an aria-label that says something else.
    const trigger = menu.slice(menu.indexOf('data-help-menu-trigger=""'), menu.indexOf('</button>', menu.indexOf('data-help-menu-trigger=""')));
    expect(trigger).toContain("{inProject ? 'Ask this case' : 'Help'}");
    expect(trigger).not.toContain('aria-label=');
    // The first item of the menu is the assistant.
    const panel = menu.slice(menu.indexOf('{...menuProps}'));
    const first = panel.match(/<(button|Link)\b[^>]*>/)?.[0] ?? '';
    expect(first, 'the assistant is not the first item of the help menu').toContain('data-assistant-trigger="header"');
  });

  test('every key it lists has a handler in the code it names', () => {
    // Ctrl/⌘ K — the workspace search and the process-map search.
    expect(menu).toContain("keys: ['Ctrl', 'K']");
    expect(read('components/workspace/CommandSearch.tsx')).toMatch(/metaKey \|\| event\.ctrlKey/);
    expect(read('components/process-map/ProcessSearch.tsx')).toMatch(/metaKey \|\| event\.ctrlKey/);
    // Alt+↑ — one level up on the map.
    expect(menu).toContain("keys: ['Alt', '↑']");
    // The binding is shared by the reading map and the editor (owner 03.10.2026:
    // one level up in full screen too), and both use it.
    expect(read('components/process-map/ProcessBreadcrumb.tsx')).toMatch(/event\.altKey \|\| event\.key !== 'ArrowUp'/);
    expect(read('components/process-map/ProcessMap.tsx')).toContain('useLevelUpKey(');
    expect(read('components/process-map/BpmnEditor.tsx')).toContain('useLevelUpKey(');
    // Home / End and Escape on the map.
    const map = read('components/process-map/ProcessMap.tsx');
    expect(map).toContain("event.key === 'Home'");
    expect(map).toContain("event.key === 'End'");
    expect(map).toContain("event.key === 'Escape'");
    // Arrow keys on the view switch.
    expect(read('components/cc/SegmentedControl.tsx')).toContain("event.key === 'ArrowRight'");
  });

  test('and none that does not: zoom, fit, minimap and path are not wired yet', () => {
    const map = code('components/process-map/ProcessMap.tsx');
    for (const [key, word] of [
      ['+', /zoom/i],
      ['0', /fit/i],
      ['F', /fit/i],
      ['M', /minimap/i],
      ['P', /path to/i],
    ] as const) {
      if (map.includes(`event.key === '${key}'`)) continue; // built — then it may be listed
      expect(menu, `the list offers "${key}", which nothing handles`).not.toContain(`keys: ['${key}']`);
      const offers = [...menu.matchAll(/does: '([^']*)'/g)].map((m) => m[1]).filter((d) => word.test(d));
      expect(offers, `the list describes a key for "${key}" that nothing handles`).toEqual([]);
    }
  });
});

test.describe('the shell can be passed with a keyboard (§1.6)', () => {
  const layout = code('app/(app)/layout.tsx');

  test('a skip link to the content is the first element, and the content can take the focus', () => {
    const skip = layout.indexOf('href="#main-content"');
    expect(skip, 'no skip link').toBeGreaterThan(-1);
    expect(skip, 'the skip link is not ahead of the shell bar').toBeLessThan(layout.indexOf('<header'));
    expect(layout).toMatch(/<main id="main-content" tabIndex=\{-1\}/);
  });

  test('no outline is removed without a replacement', () => {
    for (const rel of ['app/(app)/layout.tsx', 'components/ShellHelpMenu.tsx']) {
      const src = code(rel);
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        const cls = m[1].split(/\s+/);
        if (cls.includes('outline-none')) {
          expect(
            cls.some((c) => c.startsWith('focus-visible:outline') || c.startsWith('focus:outline-2')),
            `${rel}: outline-none without a focus ring — "${m[1].slice(0, 80)}"`,
          ).toBe(true);
        }
      }
    }
  });

  test('the account menu has a name; sign-out is the Message Box, not a dialog of its own (§2.6)', () => {
    expect(layout).toContain('aria-label="Account menu"');
    // The menu button's state and keyboard come from the shared hook, not a
    // second copy that could drift (block D, D.6).
    expect(layout).toContain("useShellMenu('account-menu-panel')");
    expect(layout).toContain('{...accountTriggerProps}');
    expect(layout).toContain('{...accountMenuProps}');
    // Sign-out asks through the library's Message Box, with the binding label.
    expect(layout).toMatch(/<CcMessageBox[\s\S]*?confirmLabel="Sign out now"/);
    expect(layout, 'a hand-built dialog in the shell').not.toContain('role="dialog"');
    expect(layout, 'an invisible full-screen layer in the shell').not.toMatch(/className="[^"]*\bfixed inset-0\b/);
  });
});

test.describe('the two shell menus are menus in the WAI-ARIA sense (§1.6, block D, D.6)', () => {
  const help = code('components/ShellHelpMenu.tsx');
  const layout = code('app/(app)/layout.tsx');

  /** The JSX between the element that spreads `menuProps` and its closing tag. */
  const menuBlock = (src: string, spread: string): string => {
    const at = src.indexOf(spread);
    expect(at, `no element spreads ${spread}`).toBeGreaterThan(-1);
    const start = src.lastIndexOf('<div', at);
    let depth = 0;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      depth += m[0] === '</div>' ? -1 : 1;
      if (depth === 0) return src.slice(start, m.index);
    }
    throw new Error(`the menu that spreads ${spread} is never closed`);
  };

  test('the hook gives the keyboard of a menu button', () => {
    expect(help).toContain("role: 'menu' as const");
    expect(help).toContain("'aria-haspopup': 'menu' as const");
    for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'Tab']) {
      expect(help, `the menu does not handle ${key}`).toContain(`'${key}'`);
    }
  });

  for (const [name, src, trigger, menu] of [
    ['Help', help, '{...triggerProps}', '{...menuProps}'],
    ['Account', layout, '{...accountTriggerProps}', '{...accountMenuProps}'],
  ] as const) {
    test(`${name}: every control inside the menu is a menuitem, one Tab stop for the whole menu`, () => {
      expect(src, `${name}: the trigger is not the hook's`).toContain(trigger);
      const block = menuBlock(src, menu);
      const controls = [...block.matchAll(/<(button|Link|a)\b[^>]*>/g)].map((m) => m[0]);
      expect(controls.length, `${name}: a menu without items`).toBeGreaterThan(0);
      for (const tag of controls) {
        expect(tag, `${name}: a control in the menu that is not a menuitem`).toContain('role="menuitem"');
        expect(tag, `${name}: a menuitem that is its own Tab stop`).toContain('tabIndex={-1}');
      }
      // Nothing else inside a menu but items and separators.
      for (const div of [...block.matchAll(/<div\b[^>]*>/g)].map((m) => m[0]).slice(1)) {
        expect(div, `${name}: a container inside the menu`).toContain('role="separator"');
      }
    });
  }
});

test.describe('the workspace (roadmap 3.0.4)', () => {
  test('the text around the map announces nothing of its own: the names arrive in the one status line of the map (§2.8)', () => {
    // The first look's staged card, with its one live region for the newest stage, left with v3.2.0 (AB-6): its
    // text is the text around the map, which arrives in place. The one announcement on the page is the map's
    // naming status line (ADR-108); a second live region here would make a screen reader repeat it.
    expect(fs.existsSync(path.join(ROOT, 'components/workspace/FirstLook.tsx'))).toBe(false);
    for (const rel of ['components/analyze/AroundTheMap.tsx', 'components/analyze/AnalyzeBusiness.tsx']) {
      expect(code(rel).match(/aria-live=/g) ?? [], `${rel} has a live region of its own`).toHaveLength(0);
    }
    // The one that does announce: the naming status line holds exactly one polite live region, the map mounts it
    // with the arrival, and the page hands the map that arrival.
    const line = code('components/process-map/NamingStatusLine.tsx');
    expect(line.match(/aria-live=/g) ?? [], 'the naming status line lost its live region').toHaveLength(1);
    expect(line).toContain('<p role="status" aria-live="polite" data-naming-announce=""');
    expect(code('components/process-map/ProcessMap.tsx')).toMatch(/\{nameArrival && !editing \? \([\s\S]{0,200}<NamingStatusLine arrival=\{nameArrival\} \/>/);
    expect(code('components/workspace/WorkspaceProcess.tsx')).toContain('nameArrival={arrival}');
  });

  test('disclosures are not dressed up as ARIA menus', () => {
    for (const rel of [
      'components/workspace/ToolBar.tsx',
      // `components/workspace/LayerBar.tsx` stood here; it had no user since AB-2 and was retired with v3.1.0 (AB-11).
    ]) {
      const src = code(rel);
      expect(src, `${rel}: role="menu" without menuitems`).not.toContain('role="menu"');
      expect(src, `${rel}: aria-haspopup="menu" over a disclosure`).not.toContain('aria-haspopup="menu"');
    }
  });

  test('Business reads what the program does, the map, the text around it, then the endings and "What you can do next" — in that order in the DOM (§2.9)', () => {
    // Since v3.1.0 the Business view is Analyze's page (AB-2, ADR-109), not an
    // order of blocks in the workspace shell: the map is the page. The reading
    // order is the DOM order at every width — no CSS `order` splits the two, so
    // on a phone the focus order is still the reading order.
    const page = read('components/analyze/AnalyzeBusiness.tsx');
    const at = (needle: string) => {
      const i = page.indexOf(needle);
      expect(i, `${needle} is not on the page`).toBeGreaterThan(-1);
      return i;
    };
    // Since 3.2.0 (AB-6) the text around the map stands where the first insights stood, and (AB-4) the two endings in
    // full and "What you can do next" follow it where "Next step" stood.
    const order = [at('<WhatThisProgramDoes'), at('<WorkspaceProcess'), at('<AroundTheMap'), at('data-analyze-what-next-show'), at('<WhatNextCard')];
    for (let i = 1; i < order.length; i++) expect(order[i], `block ${i} stands before block ${i - 1}`).toBeGreaterThan(order[i - 1]);
    expect(page).not.toMatch(/\border-(first|last|\d+)\b/);
    // The tour on the page puts its card above the map on a narrow screen by grid placement, not by `order` (AB-4):
    // the card is first in the DOM, so the focus meets it first at every width.
    const tour = read('components/workspace/ProcessTour.tsx');
    const inline = tour.slice(tour.indexOf('export function ProcessTourInline'));
    expect(inline.indexOf('data-tour-sheet=""')).toBeLessThan(inline.indexOf('data-tour-inline-map=""'));
    expect(inline).not.toMatch(/\border-(first|last|\d+)\b/);
    // The workspace shell keeps no Business order to drift from it.
    expect(read('components/workspace/WorkspaceShell.tsx')).not.toContain('BUSINESS_ORDER');
  });

  test('on a phone the toolbar is a menu in every view (§2.9)', () => {
    const src = code('components/workspace/ToolBar.tsx');
    // One breakpoint, its two sides (Tailwind v4: `max-[N]` is width < N, `min-[N]` is width >= N), so no width
    // shows both the bar and the menu (UX review 22.11.2026, Q9).
    expect(src).toContain('max-[601px]:hidden');
    expect(src).toContain('min-[601px]:hidden');
  });

  test('"Why?" is a 44px target on a phone and under a coarse pointer (WG-03, §2.10)', () => {
    const src = code('components/cc/WhyPopover.tsx');
    expect(src).toContain('max-[600px]:h-11');
    expect(src).toContain('max-[600px]:w-11');
    expect(src).toContain('pointer-coarse:h-11');
    expect(src).toContain('pointer-coarse:w-11');
  });

  test('buttons, icon buttons and segments grow to 44px under a coarse pointer (§2.9)', () => {
    expect(read('components/cc/Button.tsx').match(/pointer-coarse:min-h-11/g) ?? []).toHaveLength(2);
    expect(read('components/cc/IconButton.tsx')).toContain('pointer-coarse:h-11 pointer-coarse:w-11');
    expect(read('components/cc/SegmentedControl.tsx')).toContain('pointer-coarse:min-h-11');
  });

  test('a labelled anchor speaks its label — a label on a bare span is never read', () => {
    const src = code('components/cc/Anchor.tsx');
    expect(src).not.toMatch(/<span data-cc-anchor=\{tone\} className=\{className\} aria-label=/);
    expect(src).toContain('className="sr-only"');
  });
});

test.describe('the stylesheet (§1.1, §7.1)', () => {
  const css = read('app/globals.css');
  const block = (query: string) => {
    const blocks: string[] = [];
    let at = css.indexOf(query);
    while (at >= 0) {
      let depth = 0;
      let i = css.indexOf('{', at);
      const start = i;
      for (; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) break;
      }
      blocks.push(css.slice(start, i + 1));
      at = css.indexOf(query, i);
    }
    return blocks.join('\n');
  };

  test('forced-colors keeps the focus ring and the selection in system colours', () => {
    const forced = block('@media (forced-colors: active)');
    expect(forced).toMatch(/:focus-visible[\s\S]*?outline:\s*2px solid Highlight/);
    expect(forced).toMatch(/\[role='radio'\]\[aria-checked='true'\][\s\S]*?background:\s*Highlight/);
  });

  test('print drops the background, the shadows and the bars, and names link targets', () => {
    const print = block('@media print');
    expect(print).toMatch(/background:\s*#fff !important/);
    expect(print).toMatch(/box-shadow:\s*none !important/);
    expect(print).toContain('.cc-no-print');
    expect(print).toMatch(/content:\s*' \(' attr\(href\) '\)'/);
    expect(print).toMatch(/break-inside:\s*avoid/);
  });

  test('the shell bar, the banner and the footers do not print', () => {
    const layout = read('app/(app)/layout.tsx');
    expect(layout).toMatch(/<header className="cc-no-print/);
    expect(layout.match(/<footer className="cc-no-print/g) ?? []).toHaveLength(2);
  });

  test('a phone keeps the column headers of a document table in the accessibility tree (QA ed9796910f5a)', () => {
    const phone = block('@media (max-width: 639px)');
    const thead = phone.match(/\.doc-table thead\s*\{([^}]*)\}/);
    expect(thead, 'no rule for the header row').not.toBeNull();
    expect(thead![1]).not.toMatch(/display:\s*none/);
    expect(read('app/(app)/clean-core-explained/page.tsx')).toContain('role="columnheader"');
  });
});

test.describe('the map in full screen on Analyze, Business (AB-5, 3.2.0)', () => {
  const canvas = code('components/process-map/BpmnCanvas.tsx');
  const bar = code('components/process-map/ProcessFullScreen.tsx');
  const hook = code('components/process-map/useCanvasFullscreen.ts');

  test('it is a dialog with a name', () => {
    expect(canvas).toContain("role={filled ? 'dialog' : undefined}");
    expect(canvas).toContain("aria-label={own ? fullscreenParts.label : filled ? wt('fullScreen.dialogLabel') : undefined}");
    expect(read('lib/messages/analyze-fullscreen.ts')).toContain("'fullScreen.dialogLabel': 'Process map, full screen'");
  });

  test('the focus moves in on open (to the way out), Tab stays inside, and the focus comes back on leaving', () => {
    // In: the hook focuses `toggleRef`; in full screen that is the bar's "Leave full screen".
    expect(hook).toContain('toggleRef.current?.focus();');
    expect(canvas).toContain('const leaveRef = toggleRef;');
    expect(bar).toContain('buttonRef={tools.leaveRef}');
    // Inside: Tab and Shift+Tab wrap at the dialog's edges.
    expect(canvas).toContain('onKeyDown={filled ? keepTabInside : undefined}');
    expect(canvas).toMatch(/const keepTabInside = useCallback\(\(event[\s\S]*?event\.key !== 'Tab'[\s\S]*?last\.focus\(\)[\s\S]*?first\.focus\(\)/);
    // Out: back to the toggle, or to the control that asked for full screen ("Edit model").
    expect(hook).toMatch(/if \(lost\) toggleRef\.current\?\.focus\(\);/);
    expect(canvas).toContain('if (opener.isConnected && opener.getClientRects().length > 0) opener.focus();');
  });

  test('Escape leaves it — except inside the editor, where Escape ends a tool', () => {
    expect(hook.match(/event\.key !== 'Escape'/g) ?? []).toHaveLength(2);
    expect(canvas).toContain('escapeInside: bodyRef,');
    // Marked aria-modal, so a screen reader stays inside; `ccModalOpen` leaves the frame out, so the hook's own Escape
    // still leaves full screen while a dialog over it keeps Escape first.
    expect(canvas).toContain('aria-modal={filled ? true : undefined}');
    expect(code('components/cc/modal.ts')).toContain(`document.querySelector('[aria-modal="true"]:not([data-map-canvas-frame])')`);
    expect(canvas).toContain('data-map-canvas-frame=""');
  });

  test('its controls are 44 px on touch: the library\'s buttons, switch and segments, and the search field and hits', () => {
    for (const lib of ['CcButton', 'CcIconButton', 'CcSwitch']) expect(bar, `${lib} is not the bar's`).toContain(`<${lib}`);
    expect(read('components/cc/Switch.tsx')).toContain('pointer-coarse:min-h-11');
    expect(bar).toContain('pointer-coarse:min-h-11');
    expect(code('components/process-map/ProcessSearch.tsx')).toContain("compact ? 'h-8 py-1 text-[13px] pointer-coarse:h-11'");
  });

  test('"Edit" disabled says why (P3 on a phone, P8 for a reader), as a description of the switch', () => {
    expect(bar).toContain('disabled={editBlocked !== null}');
    expect(bar).toContain('help={editBlocked ?? undefined}');
    expect(read('components/cc/Switch.tsx')).toContain("aria-describedby={describedByOf({ helpId: !!help && helpId");
  });
});
