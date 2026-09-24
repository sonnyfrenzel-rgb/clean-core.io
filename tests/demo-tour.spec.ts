import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  TOUR_PLACES,
  TOUR_START,
  TOUR_STATIONS,
  TOUR_STORAGE_KEY,
  endTour,
  invitationAfter,
  nextStep,
  pauseTour,
  readTourProgress,
  resumeTour,
  tourInvitationShowing,
  tourPositionLabel,
  tourSlot,
  writeTourProgress,
  type TourProgress,
} from '../lib/demo-tour';
import { WORKSPACE_VIEWS } from '../lib/workspace-model';

/**
 * The demo tour as a model — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * Pure: no server, no browser. What it holds is the part of the tour that can
 * be wrong without looking wrong — twelve stations in the order the design
 * names them, one place each, one on screen at a time, the invitation after
 * every third and at the end, and progress that survives a browser refusing
 * storage. The rendered half is `tests/demo-workspace-tour.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

/** Every progress state the tour can be in, reached by walking it. */
function walk(): TourProgress[] {
  const states: TourProgress[] = [{ ...TOUR_START }];
  let p: TourProgress = { ...TOUR_START };
  for (let i = 0; i < 100 && p.state === 'running'; i += 1) {
    p = nextStep(p);
    states.push(p);
  }
  return states;
}

test.describe('the stations', () => {
  test('about twelve, in the order of §6.1.2, from the reveal to the handover', () => {
    expect(TOUR_STATIONS.map((s) => s.place)).toEqual([
      'reveal',
      'not-determined',
      'process-map',
      'process-levels',
      'confirm-rule',
      'standard-fit',
      'it-chain',
      'management',
      'four-buckets',
      'costs',
      'decision',
      'handover',
    ]);
  });

  test('one station per place, and every place has its station', () => {
    const places = TOUR_STATIONS.map((s) => s.place);
    expect(new Set(places).size, 'two stations share a place').toBe(places.length);
    expect([...places].sort()).toEqual([...TOUR_PLACES].sort());
  });

  test('the views come in the order Business · IT · Management (ADR-044)', () => {
    const order = TOUR_STATIONS.map((s) => WORKSPACE_VIEWS.indexOf(s.view));
    expect(order.every((v) => v >= 0), 'a station names a view the workspace does not have').toBe(true);
    const rank = { business: 0, it: 1, management: 2 } as const;
    const ranks = TOUR_STATIONS.map((s) => rank[s.view]);
    expect(ranks, 'a station goes back to an earlier view').toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(TOUR_STATIONS.map((s) => s.view))).toEqual(new Set(['business', 'it', 'management']));
  });

  test('no station carries a figure — the place does, from the engine', () => {
    for (const s of TOUR_STATIONS) {
      expect(`${s.title} ${s.body}`, `station ${s.place} states a number`).not.toMatch(/\d/);
    }
  });

  test('English, and no chatbot phrasing (§3.1)', () => {
    for (const s of TOUR_STATIONS) {
      const text = `${s.title} ${s.body}`;
      expect(text).not.toMatch(/[äöüÄÖÜß]/);
      expect(text).not.toMatch(/\b(amazing|powerful|seamless|effortless|magic|simply|just)\b/i);
      expect(text).not.toMatch(/[!*#`]/);
    }
  });
});

test.describe('the walk', () => {
  test('"3 of 12" as text', () => {
    expect(tourPositionLabel(2)).toBe('3 of 12');
    expect(tourPositionLabel(11)).toBe('12 of 12');
  });

  test('the invitation after every third station and at the end — once at the end, not twice', () => {
    const after = TOUR_STATIONS.map((_, i) => invitationAfter(i));
    expect(after.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)).toEqual([2, 5, 8, 11]);
    // A tour of ten would still invite at its end.
    expect(invitationAfter(9, 10)).toBe(true);
    expect(invitationAfter(12)).toBe(false);
    expect(invitationAfter(-1)).toBe(false);
  });

  test('"Next" visits every station once, invites four times, and ends rather than wrapping', () => {
    const states = walk();
    const shown = states.filter((p) => p.state === 'running' && !p.inviting).map((p) => p.index);
    expect(shown).toEqual(TOUR_STATIONS.map((_, i) => i));
    expect(states.filter((p) => p.inviting).map((p) => p.index)).toEqual([2, 5, 8, 11]);
    expect(states[states.length - 1].state).toBe('ended');
    // Ended is ended: "Next" does not restart it behind the reader's back.
    expect(nextStep(states[states.length - 1])).toEqual(states[states.length - 1]);
  });

  test('pause, resume and end', () => {
    const at4: TourProgress = { index: 4, state: 'running', inviting: false };
    const paused = pauseTour(at4);
    expect(paused.state).toBe('paused');
    expect(nextStep(paused), '"Next" moves a paused tour').toEqual(paused);
    expect(resumeTour(paused)).toEqual(at4);
    expect(endTour(at4).state).toBe('ended');
    expect(resumeTour(endTour(at4)).state, 'resume revives an ended tour').toBe('ended');
  });
});

test.describe('one at a time, and only where it stands', () => {
  test('for every state of the walk, at most one slot on the whole screen answers', () => {
    for (const p of walk()) {
      for (const view of WORKSPACE_VIEWS) {
        const answering = TOUR_PLACES.filter((place) => tourSlot(p, place, view) !== null);
        expect(answering.length, `two slots answer at ${JSON.stringify(p)} in ${view}`).toBeLessThanOrEqual(1);
      }
      if (p.state === 'running') {
        const station = TOUR_STATIONS[p.index];
        const all = WORKSPACE_VIEWS.flatMap((view) =>
          TOUR_PLACES.filter((place) => tourSlot(p, place, view) !== null).map((place) => `${view}/${place}`),
        );
        expect(all, 'a running tour shows nothing, or shows it in the wrong place').toEqual([
          `${station.view}/${station.place}`,
        ]);
      }
    }
  });

  test('a station appears only when the reader is in its view', () => {
    const itStation = TOUR_STATIONS.findIndex((s) => s.view === 'it');
    const p: TourProgress = { index: itStation, state: 'running', inviting: false };
    expect(tourSlot(p, 'it-chain', 'business')).toBeNull();
    expect(tourSlot(p, 'it-chain', 'it')?.kind).toBe('station');
  });

  test('paused, ended and not yet read show nothing', () => {
    expect(tourSlot(null, 'reveal', 'business')).toBeNull();
    expect(tourSlot({ index: 0, state: 'paused', inviting: false }, 'reveal', 'business')).toBeNull();
    expect(tourSlot({ index: 0, state: 'ended', inviting: false }, 'reveal', 'business')).toBeNull();
  });

  test('the invitation stands where the station stood, and the strip link steps back meanwhile', () => {
    const p: TourProgress = { index: 2, state: 'running', inviting: true };
    const slot = tourSlot(p, TOUR_STATIONS[2].place, TOUR_STATIONS[2].view);
    expect(slot?.kind).toBe('invitation');
    expect(tourInvitationShowing(p, TOUR_STATIONS[2].view)).toBe(true);
    expect(tourInvitationShowing({ ...p, inviting: false }, TOUR_STATIONS[2].view)).toBe(false);
    const last = tourSlot({ index: 11, state: 'running', inviting: true }, 'handover', 'management');
    expect(last?.kind === 'invitation' && last.last).toBe(true);
  });
});

test.describe('progress lives in this browser only', () => {
  const g = globalThis as unknown as { window?: unknown };
  let saved: unknown;
  test.beforeEach(() => {
    saved = g.window;
  });
  test.afterEach(() => {
    g.window = saved;
  });

  test('a browser that refuses storage gets the start of the tour, and a failed write is silent', () => {
    g.window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
        removeItem: () => {
          throw new Error('SecurityError');
        },
      },
    };
    expect(readTourProgress()).toEqual(TOUR_START);
    expect(() => writeTourProgress({ index: 3, state: 'running', inviting: false })).not.toThrow();
  });

  test('what is written is read back; what is garbage is not', () => {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    };
    writeTourProgress({ index: 7, state: 'paused', inviting: false });
    expect(readTourProgress()).toEqual({ index: 7, state: 'paused', inviting: false });
    store.set(TOUR_STORAGE_KEY, JSON.stringify({ index: 99, state: 'running', inviting: false }));
    expect(readTourProgress()).toEqual(TOUR_START);
    store.set(TOUR_STORAGE_KEY, '{not json');
    expect(readTourProgress()).toEqual(TOUR_START);
  });

  test('every storage access of the tour and the demo workspace sits in a try', () => {
    for (const rel of ['lib/demo-tour.ts', 'components/demo/DemoWorkspaceShell.tsx', 'lib/show-tips-again.ts']) {
      const lines = read(rel).split(/\r?\n/);
      let accesses = 0;
      lines.forEach((line, i) => {
        if (!/window\.localStorage\.|window\.dispatchEvent/.test(line) || /^\s*(\*|\/\/)/.test(line)) return;
        accesses += 1;
        const before = lines.slice(Math.max(0, i - 3), i).join('\n');
        expect(before, `${rel}:${i + 1} reaches storage outside a try`).toMatch(/try\s*\{/);
      });
      if (rel !== 'lib/show-tips-again.ts') expect(accesses, `${rel}: no storage access found`).toBeGreaterThan(0);
    }
  });

  test('no account field, no route, no Firestore write behind the tour (ADR-036)', () => {
    for (const rel of ['lib/demo-tour.ts', 'hooks/useDemoTour.ts', 'lib/show-tips-again.ts', 'components/demo/DemoTourStop.tsx']) {
      const code = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
      expect(code, `${rel} reaches Firestore`).not.toMatch(/firebase\/firestore|getDb\s*\(|setDoc|updateDoc/);
      expect(code, `${rel} calls a route`).not.toMatch(/\bfetch\s*\(|\/api\//);
    }
  });
});

test.describe('"Show tips again" in the help menu', () => {
  test('is in the account menu, behind the workspace switch, and clears both kinds of tip', () => {
    const layout = read('app/(app)/layout.tsx');
    expect(layout).toContain('Show tips again');
    expect(layout).toMatch(/workspaceShellEnabled\(profile\)\s*&&[\s\S]{0,200}showTipsAgain\(\)/);
    const fn = read('lib/show-tips-again.ts');
    expect(fn).toContain('clearDismissedMarks()');
    expect(fn).toContain('clearTourProgress()');
    // Both screens listen, so an open page shows the tips without a reload.
    expect(read('hooks/useCoachMarks.ts')).toContain('SHOW_TIPS_EVENT');
    expect(read('hooks/useDemoTour.ts')).toContain('SHOW_TIPS_EVENT');
  });
});
