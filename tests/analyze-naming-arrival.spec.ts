import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import {
  LARGE_PROGRAM_STEPS,
  NAME_STAGGER_SPAN_MS,
  NAME_SWAP_MS,
  NAMING_CEILING_MS,
  NAMING_LATE_MS,
  arrivalAt,
  swapSchedule,
  usableName,
  type ArrivalElement,
  type ArrivalInput,
} from '../lib/naming-arrival';

/**
 * Roadmap 3.1.0 item 4 (plan AB-3, mockup states 1, 2, 3 and 18): the AI names swap in visibly, at most 45 s per
 * program, announced in one status line. Server-free: the arrival is a pure function of the clock
 * (`lib/naming-arrival.ts`); the canvas half is held by source here and rendered in `analyze-naming-swap.spec.ts`.
 */

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** 25 nameable elements, as in the mockup; 22 get a name of their own, 3 keep the engine's. */
function mapOf(count: number, named: number, equal = 0): ArrivalElement[] {
  return Array.from({ length: count }, (_, i) => {
    const drawnName = `Engine step ${i + 1}`;
    const businessName = i < named ? `Business step ${i + 1}` : i < named + equal ? drawnName : null;
    return { id: `E${i + 1}`, nodeId: `n${i + 1}`, businessName, drawnName };
  });
}

const T0 = 1_000_000;
const input = (over: Partial<ArrivalInput> = {}): ArrivalInput => ({
  elements: mapOf(25, 22),
  waitingSince: T0,
  arrivedAt: null,
  instant: false,
  failed: false,
  ...over,
});

test.describe('the names arrive: engine names at once, a counted status line, a 45 s ceiling', () => {
  test('state 1: the map has every engine name and a waiting mark while the names are on their way', () => {
    const view = arrivalAt(input(), T0 + 3_000);
    expect(view.phase).toBe('waiting');
    expect(view.shown.size).toBe(0);
    expect(view.waiting.size).toBe(25);
    expect(view.status?.text).toBe('Naming steps in plain language … 0 of 25');
    expect(view.status?.sub).toBe('Names change in place as they arrive. You can use the map now.');
    expect(view.status?.tone).toBe('busy');
    expect(view.status?.progress).toBe(0);
  });

  test('state 2: the names swap in one by one in the map\'s order, each for its swap time, and the count follows', () => {
    const arrivedAt = T0 + 3_200;
    const { ids, stagger } = swapSchedule(input().elements);
    expect(ids).toHaveLength(22);
    expect(stagger * (ids.length - 1)).toBeLessThanOrEqual(NAME_STAGGER_SPAN_MS);
    // 13 complete, the 14th under way.
    const at = arrivedAt + 13 * stagger + NAME_SWAP_MS - 1;
    const view = arrivalAt(input({ arrivedAt }), at);
    expect(view.phase).toBe('swapping');
    expect(view.named).toBe(Math.floor((at - arrivedAt - NAME_SWAP_MS) / stagger) + 1);
    expect([...view.shown.keys()]).toEqual(ids.slice(0, view.shown.size));
    expect(view.swapping.size).toBeGreaterThan(0);
    for (const id of view.swapping) expect(view.shown.has(id)).toBe(true);
    for (const id of view.waiting) expect(view.shown.has(id)).toBe(false);
    expect(view.status?.text).toBe(`Naming steps in plain language … ${view.named} of 25`);
    expect(view.nextChangeAt).not.toBeNull();
  });

  test('state 3: names ready — the kept ones are counted, without a pen mark, and nothing changes any more', () => {
    const view = arrivalAt(input({ arrivedAt: T0 + 3_200 }), T0 + 3_200 + NAME_STAGGER_SPAN_MS + NAME_SWAP_MS);
    expect(view.phase).toBe('ready');
    expect(view.named).toBe(22);
    expect(view.kept).toBe(3);
    expect(view.shown.size).toBe(22);
    expect(view.waiting.size).toBe(0);
    expect(view.swapping.size).toBe(0);
    expect(view.status).toEqual({ text: 'Names are ready. 3 steps keep the name read from the code (no pen mark).', sub: null, progress: null, tone: 'calm' });
    expect(view.nextChangeAt).toBeNull();
    const one = arrivalAt(input({ elements: mapOf(5, 4), arrivedAt: T0 }), T0 + 60_000);
    expect(one.status?.text).toBe('Names are ready. 1 step keeps the name read from the code (no pen mark).');
    const all = arrivalAt(input({ elements: mapOf(5, 5), arrivedAt: T0 }), T0 + 60_000);
    expect(all.status?.text).toBe('Names are ready.');
  });

  test('a name equal to the engine\'s is no swap and carries no pen mark', () => {
    const elements = mapOf(10, 6, 2);
    expect(usableName(elements[6])).toBeNull();
    const view = arrivalAt(input({ elements, arrivedAt: T0 }), T0 + 60_000);
    expect(view.shown.size).toBe(6);
    expect(view.shown.has('E7')).toBe(false);
    expect(view.kept).toBe(4);
    // An element not drawn from a skeleton node is not counted at all.
    const withEvent = [...elements, { id: 'S', nodeId: null, businessName: 'Start', drawnName: 'Start' }];
    expect(arrivalAt(input({ elements: withEvent, arrivedAt: T0 }), T0 + 60_000).total).toBe(10);
  });

  test('a naming that names nothing new still ends the wait: names ready, every step kept', () => {
    const view = arrivalAt(input({ elements: mapOf(8, 0, 3), arrivedAt: T0 + 2_000 }), T0 + 2_001);
    expect(view.phase).toBe('ready');
    expect(view.status?.text).toBe('Names are ready. 8 steps keep the name read from the code (no pen mark).');
  });

  test('state 18: a larger program says why it takes longer; the map works now', () => {
    const view = arrivalAt(input({ elements: mapOf(61, 50) }), T0 + 9_000);
    expect(61).toBeGreaterThanOrEqual(LARGE_PROGRAM_STEPS);
    expect(view.status?.text).toBe('Naming steps in plain language … 0 of 61');
    expect(view.status?.sub).toBe('This program is larger, so naming takes up to 45 s. The map works now.');
  });

  test('late: the line counts down to the ceiling, then says in one sentence that every step keeps its name', () => {
    const late = arrivalAt(input(), T0 + NAMING_LATE_MS + 5_000);
    expect(late.status?.sub).toBe('Still waiting for the names, at most 20 s. Then every step keeps the name read from the code.');
    expect(late.nextChangeAt).toBe(T0 + NAMING_LATE_MS + 6_000);
    const over = arrivalAt(input(), T0 + NAMING_CEILING_MS);
    expect(over.phase).toBe('timeout');
    expect(over.shown.size).toBe(0);
    expect(over.waiting.size).toBe(0);
    expect(over.status?.text).toBe('The AI names took longer than 45 s. Every step keeps the name read from the code for now.');
    expect(over.nextChangeAt).toBeNull();
    // Names that come after the ceiling do not arrive on this visit.
    const after = arrivalAt(input({ arrivedAt: T0 + NAMING_CEILING_MS + 1 }), T0 + NAMING_CEILING_MS + 10_000);
    expect(after.phase).toBe('timeout');
    expect(after.shown.size).toBe(0);
  });

  test('a failed model leaves every engine name and says so in one sentence', () => {
    const view = arrivalAt(input({ failed: true }), T0 + 4_000);
    expect(view.phase).toBe('failed');
    expect(view.shown.size).toBe(0);
    expect(view.waiting.size).toBe(0);
    expect(view.status?.text).toBe('The AI names could not be written this time. Every step keeps the name read from the code.');
    expect(view.status?.sub).toBeNull();
  });

  test('names stored before, and reduced motion: there at once, no swap, no walk', () => {
    const view = arrivalAt(input({ waitingSince: null, arrivedAt: T0, instant: true }), T0);
    expect(view.phase).toBe('ready');
    expect(view.shown.size).toBe(22);
    expect(view.swapping.size).toBe(0);
    // Nothing asked and nothing stored (an invited reader without names, a paused build): no status line.
    expect(arrivalAt(input({ waitingSince: null }), T0 + 50_000).status).toBeNull();
  });

  test('the canvas lays the names over the viewer without rebuilding it, and nothing waits on the focus', () => {
    const canvas = read('components/process-map/BpmnCanvas.tsx');
    // The viewer is built from the xml, the nodes and the layout only — never from the names.
    expect(canvas).toContain('}, [xml, nodes, layoutPass]);');
    expect(canvas).toContain('applyCanvasNames(viewer as unknown as SwapViewer, host, names, namesDrawnRef.current, engineNames)');
    const map = read('components/process-map/ProcessMap.tsx');
    // With names arriving the canvas nodes carry the engine's accessible names, so a name does not change them.
    expect(map).toContain("accessibleName: arriving ? engineAccessibleName(e) : e.accessibleName,");
    expect(map).toContain('hold: selected ? new Set([selected]) : new Set(),');
    const swap = read('components/process-map/naming-swap.ts');
    expect(swap).toContain('const held = names !== null && (names.hold.has(id) || focusedId === id);');
    // A pen, never a spark (ADR-104).
    expect(swap).not.toMatch(/Sparkles|sparkle/);
    const css = read('components/process-map/process-map.css');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.cc-map-name-in \.cc-map-name-text/);
    // The Business view hands the arrival to the map.
    const page = read('components/workspace/WorkspaceProcess.tsx');
    expect(page).toContain('nameArrival={arrival}');
    expect(page).toContain("asking: naming.state === 'asking',");
  });
});
