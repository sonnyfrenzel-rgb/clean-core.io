import { test, expect } from '@playwright/test';
import { WORKSPACE_MESSAGE_PARTS } from '../lib/workspace-messages';

/**
 * The copy rule of the accepted Analyze mockup v4.1, held on the product's
 * own words (plan `docs/design/analyze-business-first-plan.md`, AB-0).
 *
 * The owner's rule for the rebuilt Analyze: short, concrete, for process
 * owners, no consultant and no AI phrasing. The mockup run checked it with a
 * word search over every visible text and found nothing; this guard runs the
 * same search, with the same words, over the message catalogue Analyze's
 * Business view reads (`lib/workspace-messages.ts`, the parts in `SCOPE`).
 * The list is the mockup run's, copied, not extended here: a word is added
 * when a review finds it, not because it sounds like filler.
 *
 * Two findings:
 *
 *   - a **banned word** in a value fails at once, except the one entry in
 *     `KNOWN_BANNED`, which retires with its surface;
 *   - an **em dash** in a value: the mockup run replaced every one by a full
 *     stop or a colon (one thought per sentence). Today's catalogue still has
 *     them, so they are a ratchet: `KNOWN_DASH` lists the keys that carry one
 *     today, a new key with an em dash fails, and a listed key that lost its
 *     dash fails until it is struck from the list — the list only shrinks.
 *
 * Server-free: it reads library code, never a page.
 */

/** The copy rule's words, as the mockup run searched for them (substring, any case). */
const BANNED = [
  'seamless',
  'leverage',
  'unlock',
  'empower',
  'holistic',
  'robust',
  'streamline',
  'journey',
  'insight',
  'valuable',
  'comprehensive',
  'ensure',
  'effortless',
  'powerful',
  'cutting-edge',
  'game-chang',
  'revolution',
  'supercharge',
  'elevate',
] as const;

/** The parts of the catalogue Analyze's Business view reads: the page, the head, the map, the business text, the walk, the way back. */
const SCOPE = ['workspace', 'shell', 'processMap', 'business', 'walk', 'navigation', 'firstLookFindings'] as const;

/**
 * Banned words that stand today, with the package that removes them. "First
 * insights" is the build-up that AB-3 retires; the mockup has no First
 * Insights anywhere.
 */
const KNOWN_BANNED: Readonly<Record<string, readonly string[]>> = {
  'firstLook.title': ['insight'],
};

/** Keys whose value carries an em dash today (measured 12.11.2026). Strike a key when its dash goes; never add one. */
const KNOWN_DASH: Readonly<Record<(typeof SCOPE)[number], readonly string[]>> = {
  workspace: [
    'access.empty',
    'usage.lead',
    'notDetermined.none',
    'oq.none',
    'oq.catalogAnswered',
    'decision.unreadableTail',
    'decision.limitsLead',
    'decision.withdrawBody',
    'firstLook.noDecision',
    'myWorkspace.yourTurnIntro',
    'myWorkspace.demoSentence',
    'myWorkspace.exampleHeadline',
    'print.stepListInstead',
    'print.notDeterminedNoSource',
    'print.levelsNote',
    'print.levelsFailed',
  ],
  shell: [
    'autoSteps.onClickNote',
    'page.metaNoRun',
    'search.placeholder',
    'tools.mark.startedHint',
    'tools.mark.staleHint',
    'toolGuide.nothingOpen',
    'nextStep.running',
  ],
  processMap: ['map.title', 'mapMini.label', 'mapSearch.placeholder'],
  business: ['biz.mapSignLead', 'biz.firstLookLead'],
  walk: [],
  navigation: [],
  firstLookFindings: [],
};

const EM_DASH = '—';

function bannedIn(text: string): string[] {
  const low = text.toLowerCase();
  return BANNED.filter((word) => low.includes(word));
}

function entries(part: (typeof SCOPE)[number]): [string, string][] {
  return Object.entries(WORKSPACE_MESSAGE_PARTS[part] as Record<string, unknown>).filter(
    (e): e is [string, string] => typeof e[1] === 'string',
  );
}

test.describe("Analyze's copy follows the mockup's rule", () => {
  test('the search finds what it is meant to find (negative probe)', () => {
    expect(bannedIn('A seamless way to Unlock powerful insights')).toEqual(['seamless', 'unlock', 'insight', 'powerful']);
    expect(bannedIn('This is a game-changer.')).toEqual(['game-chang']);
    expect(bannedIn('The order is created before anyone approves.')).toEqual([]);
    expect('Approve it — then order'.includes(EM_DASH)).toBe(true);
    expect('Approve it. Then order.'.includes(EM_DASH)).toBe(false);
  });

  test('every part in scope exists and has text, so the search is not run on nothing', () => {
    let values = 0;
    for (const part of SCOPE) {
      expect(WORKSPACE_MESSAGE_PARTS, `catalogue part ${part}`).toHaveProperty(part);
      // The search reads flat strings: a nested value would be copy it never sees.
      const nested = Object.entries(WORKSPACE_MESSAGE_PARTS[part] as Record<string, unknown>).filter(([, v]) => typeof v !== 'string');
      expect(nested.map(([k]) => `${part}.${k}`), 'a catalogue value the copy search does not read').toEqual([]);
      values += entries(part).length;
    }
    expect(values, 'the scope reads hundreds of sentences today').toBeGreaterThan(400);
  });

  test('no consultant or AI phrasing in the scope, apart from the listed surfaces that retire', () => {
    const found: string[] = [];
    const stale: string[] = [];
    for (const part of SCOPE) {
      for (const [key, value] of entries(part)) {
        const words = bannedIn(value);
        const known = KNOWN_BANNED[key] ?? [];
        for (const word of words) if (!known.includes(word)) found.push(`${part}/${key}: "${word}" in "${value}"`);
      }
    }
    for (const [key, words] of Object.entries(KNOWN_BANNED)) {
      const part = SCOPE.find((p) => key in (WORKSPACE_MESSAGE_PARTS[p] as Record<string, unknown>));
      const value = part ? (WORKSPACE_MESSAGE_PARTS[part] as Record<string, unknown>)[key] : undefined;
      if (typeof value !== 'string' || words.some((w) => !bannedIn(value).includes(w))) stale.push(key);
    }
    expect(found, 'say it plainly: what the program does, in the reader\'s words').toEqual([]);
    expect(stale, 'the word is gone: strike the key from KNOWN_BANNED').toEqual([]);
  });

  test('em dashes only shrink: no new key carries one, and a cleaned key leaves the list', () => {
    const added: string[] = [];
    const cleaned: string[] = [];
    for (const part of SCOPE) {
      const known = new Set(KNOWN_DASH[part]);
      const values = new Map(entries(part));
      for (const [key, value] of values) if (value.includes(EM_DASH) && !known.has(key)) added.push(`${part}/${key}: "${value}"`);
      for (const key of known) {
        const value = values.get(key);
        if (value === undefined || !value.includes(EM_DASH)) cleaned.push(`${part}/${key}`);
      }
    }
    expect(added, 'one thought per sentence: a full stop or a colon instead of the dash').toEqual([]);
    expect(cleaned, 'the dash is gone: strike the key from KNOWN_DASH').toEqual([]);
  });
});
