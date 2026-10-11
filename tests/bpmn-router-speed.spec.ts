import { test, expect } from '@playwright/test';
import { Router, type PortChoice } from '../lib/bpmn/router';

/**
 * The flow router stays fast on large maps (owner, 11.10.2026).
 *
 * A 2,000-line program froze the browser: its map routed some 3,400 flows on a
 * grid of ten thousand points, the open list allocated a pair for every entry,
 * and every flow without a way searched the whole grid many times over before
 * it gave up — three quarters of all work. The heap now keeps typed arrays and
 * a long search asks once whether any way exists. Neither may change a route:
 * the same moves, the same order, the same answer.
 */
const LINES = Array.from({ length: 300 }, (_, i) => i * 20);
const port = (x: number, y: number, side: PortChoice['side']): PortChoice => ({ side, point: { x, y }, cost: 0, stub: { x, y } });

test('a flow that has a way gets the straight one', () => {
  const router = new Router(LINES, LINES, []);
  const route = router.route({ id: 'f', from: [port(100, 100, 'right')], to: [port(400, 100, 'left')] });
  expect(route).toEqual([{ x: 100, y: 100 }, { x: 400, y: 100 }]);
});

test('a flow whose target lies inside a shape gets null, and gets it fast on a large grid', () => {
  // The target point (3000, 3000) is inside a shape: no leg into it is passable.
  const router = new Router(LINES, LINES, [{ x: 2900, y: 2900, width: 200, height: 200 }]);
  const t0 = performance.now();
  const route = router.route({ id: 'f', from: [port(100, 100, 'right')], to: [port(3000, 3000, 'left')] });
  const ms = performance.now() - t0;
  expect(route).toBeNull();
  // The whole-grid search took several seconds here; the reachability walk ends it in milliseconds.
  expect(ms, `walled-in flow took ${Math.round(ms)} ms`).toBeLessThan(1500);
  // The router still routes the next flow after a null (its buffers were reset).
  expect(router.route({ id: 'g', from: [port(100, 200, 'right')], to: [port(400, 200, 'left')] })).toEqual([
    { x: 100, y: 200 },
    { x: 400, y: 200 },
  ]);
});
