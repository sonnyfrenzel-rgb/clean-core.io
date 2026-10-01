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
    expect(read('components/process-map/ProcessMap.tsx')).toMatch(/event\.altKey \|\| event\.key !== 'ArrowUp'/);
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
  test('the first look has exactly one live region, and it carries the newest stage only (§2.8)', () => {
    const src = code('components/workspace/FirstLook.tsx');
    expect(src.match(/aria-live=/g) ?? [], 'more than one live region in the first look').toHaveLength(1);
    expect(src, 'the announcement joins every stage again').not.toMatch(/\.map\(\(s\) => `\$\{s\.label\}: \$\{s\.result\}`\)\s*\.join/);
  });

  test('disclosures are not dressed up as ARIA menus', () => {
    for (const rel of [
      'components/workspace/ToolBar.tsx',
      'components/workspace/LayerBar.tsx',
    ]) {
      const src = code(rel);
      expect(src, `${rel}: role="menu" without menuitems`).not.toContain('role="menu"');
      expect(src, `${rel}: aria-haspopup="menu" over a disclosure`).not.toContain('aria-haspopup="menu"');
    }
  });

  test('Business reads the answer, Next step, the map, then the folded detail — in that order in the DOM (mockup s1, §2.9)', () => {
    const shell = read('components/workspace/WorkspaceShell.tsx');
    const block = shell.match(/const BUSINESS_ORDER[^=]*=\s*\[([\s\S]*?)\]/);
    expect(block, 'no Business order').not.toBeNull();
    const order = [...block![1].matchAll(/'([a-zA-Z]+)'/g)].map((m) => m[1]);
    // The answer first — it carries the not-determined count and groups beside
    // what was found (FirstLook), so the doubt is still answered at once.
    expect(order[0]).toBe('firstLook');
    expect(order.indexOf('firstLook')).toBeLessThan(order.indexOf('nextStep'));
    expect(order.indexOf('nextStep')).toBeLessThan(order.indexOf('process'));
    expect(order.indexOf('process')).toBeLessThan(order.indexOf('layerSection'));
    // The detail of what is not determined is folded and last, never absent.
    expect(order[order.length - 1]).toBe('notDetermined');
  });

  test('on a phone the toolbar is a menu in every view (§2.9)', () => {
    const src = code('components/workspace/ToolBar.tsx');
    expect(src).toContain('max-[600px]:hidden');
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
