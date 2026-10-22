import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  OWN_KEY_ACTION,
  OWN_KEY_HREF,
  QUOTA_NAME,
  quotaSpentSentence,
  runsLeftLabel,
} from '../lib/run-quota-rule';
import { safeReturnPath, signInLinkFor } from '../lib/return-path';

/**
 * Roadmap 3.0.21 — "The way in and the way back work" (owner decisions
 * 22.10.2026 on the whole-app usability analysis). Server-free: the pure
 * modules the screens read, and the source of the screens where a rendered
 * check needs a signed-in account with a spent quota. The rendered half is
 * `tests/way-in-and-back-rendered.spec.ts`.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test.describe('(2) the quota has one name — analysis runs, counted as left', () => {
  test('the header, Settings and the notices count what is left, in runs', () => {
    expect(runsLeftLabel({ transformationsUsed: 1, transformationsLimit: 5 })).toBe('4 of 5 runs left');
    expect(runsLeftLabel({ transformationsUsed: 0, transformationsLimit: 5 })).toBe('5 of 5 runs left');
    expect(runsLeftLabel({ transformationsUsed: 9, transformationsLimit: 5 })).toBe('0 of 5 runs left');
    expect(runsLeftLabel({ byokConfigured: true, transformationsUsed: 3, transformationsLimit: 5 })).toBe('Unlimited');
    expect(runsLeftLabel({ tier: 'enterprise' })).toBe('Unlimited');
    expect(runsLeftLabel({ transformationsUsed: 0, transformationsLimit: 1000 })).toBe('Unlimited');
    expect(QUOTA_NAME).toBe('Analysis runs');
  });

  test('the server refuses in the words the screens use', () => {
    const sentence = quotaSpentSentence(5);
    expect(sentence).toContain('5 free analysis runs');
    expect(sentence).not.toMatch(/transformation/i);
    const admin = read('lib/firebase-admin.ts');
    expect(admin).toContain('throw new QuotaError(quotaSpentSentence(limit), 403);');
    expect(admin).not.toMatch(/free transformations/);
  });

  test('no screen names the quota "transformations" or "Plan and usage" any more (UX-084 regressed)', () => {
    for (const rel of [
      'app/(app)/layout.tsx',
      'app/(app)/settings/page.tsx',
      'app/(app)/dashboard/page.tsx',
      'app/(app)/first-run/page.tsx',
      'components/StarterExamples.tsx',
      'components/GlossaryChatbot.tsx',
      'lib/chatbot-knowledge.ts',
    ]) {
      // Comments may tell the history; what a reader sees may not.
      const src = read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      expect(src, `${rel} still says "Plan and usage"`).not.toContain('Plan and usage');
      expect(src, `${rel} still counts "transformations used"`).not.toMatch(/Transformations used/);
      // A number of transformations is the old name of the quota; the stage is still called Transformation.
      expect(src, `${rel} still names the quota in transformations`).not.toMatch(/(\d|\}|five) (free )?transformations\b/i);
    }
    const layout = read('app/(app)/layout.tsx');
    expect(layout).toContain('{runsLeftLabel(profile)}');
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain('title={QUOTA_NAME}');
    expect(settings).toMatch(/data-settings-quota=""[\s\S]{0,200}runsLeftLabel\(profile\)/);
    expect(read('app/(app)/first-run/page.tsx')).toContain('"5 of 5 runs left"');
  });
});

test.describe('(3) the way to an own key links every hop', () => {
  test('every limit notice offers "Add your own key", pointing at the key card', () => {
    expect(OWN_KEY_HREF).toBe('/settings#own-key');
    expect(OWN_KEY_ACTION).toBe('Add your own key');
    const starter = read('components/StarterExamples.tsx');
    const strip = starter.slice(starter.indexOf('headline="Limit reached."'), starter.indexOf('</CcMessageStrip>', starter.indexOf('headline="Limit reached."')));
    expect(strip).toContain('href={OWN_KEY_HREF}');
    expect(strip).toContain('{OWN_KEY_ACTION}');
    const dashboard = read('app/(app)/dashboard/page.tsx');
    const limitStrips = dashboard.split('headline="Limit reached."').slice(1);
    expect(limitStrips.length).toBe(3);
    for (const after of limitStrips) {
      expect(after.slice(0, after.indexOf('</CcMessageStrip>'))).toContain('href={OWN_KEY_HREF}');
    }
  });

  test('the key card is the anchor, and its two-factor sentence links to Sign-in security', () => {
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain("const OWN_KEY_ID = OWN_KEY_HREF.slice(OWN_KEY_HREF.indexOf('#') + 1);");
    expect(settings).toContain("const SIGN_IN_SECURITY_ID = 'sign-in-security';");
    expect(settings).toMatch(/title="Your own model key \(BYOK\)"\s*\n\s*id=\{OWN_KEY_ID\}/);
    expect(settings).toContain('<CcCard level={2} title="Sign-in security" id={SIGN_IN_SECURITY_ID}>');
    expect(settings).toMatch(/<a href=\{`#\$\{SIGN_IN_SECURITY_ID\}`\} data-own-key-mfa-link=""[^>]*>\s*set it up under Sign-in security/);
    // The card component carries the anchor on its own element.
    expect(read('components/cc/Card.tsx')).toMatch(/<section\s+id=\{id\}/);
  });

  test('after two-factor is turned on, the new sign-in comes back to the key', () => {
    const settings = read('app/(app)/settings/page.tsx');
    expect(settings).toContain("router.push(signInLinkFor(isPilotTier ? OWN_KEY_HREF : '/settings'))");
    expect(settings).not.toContain("router.push('/?auth=signin')");
    // …and the return path honours exactly that place, and no other fragment.
    expect(safeReturnPath('/settings#own-key')).toBe('/settings#own-key');
    expect(safeReturnPath('/settings#sign-in-security')).toBe('/settings#sign-in-security');
    expect(signInLinkFor(OWN_KEY_HREF)).toBe(`/?auth=signin&next=${encodeURIComponent('/settings#own-key')}`);
    for (const refused of ['/settings#own-key2', '/settings#Own-key', '/settings#own-key#x', '/dashboard#own-key', '/settings##own-key', '/settings#']) {
      expect(safeReturnPath(refused), refused).toBeNull();
    }
  });
});
