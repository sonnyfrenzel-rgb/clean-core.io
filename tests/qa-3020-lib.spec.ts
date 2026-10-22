import { test, expect } from '@playwright/test';
import type { ProcessMapModel } from '../lib/process-map';
import { buildProcessTour } from '../lib/process-tour';
import type { WalkGuide, WalkGuideStep, WalkRole } from '../lib/process-walk-guide';

/**
 * QA review of ee72ca2218e1 — confirmed findings in lib/ outside the engine.
 * Server-free: pure functions only.
 */

function step(id: string, title: string, role: WalkRole): WalkGuideStep {
  return {
    id,
    title,
    phase: 'p1',
    technical: null,
    happens: { text: `${title} happens.`, anchor: null },
    matters: { text: `${title} matters.`, anchor: null },
    decides: [],
    data: null,
    ifGone: { text: `${title} is gone.`, anchor: null },
    engine: null,
    anchor: null,
    plain: true,
    role,
  };
}

test.describe('process tour: steps of one name are one station (finding 614f49368ba0)', () => {
  test('of two steps of one name, the one a reader learns most from stands for both, not the earlier', () => {
    const read = step('s1', 'Order items', 'read');
    const change = step('s2', 'Order items', 'change');
    const guide: WalkGuide = {
      byId: { s1: read, s2: change },
      phases: [{ id: 'p1', label: 'Orders', stepIds: ['s1', 's2'] }],
      business: ['s1', 's2'],
      technical: [],
    };
    const model = { elements: [{ id: 's1', plane: null }, { id: 's2', plane: null }] } as unknown as ProcessMapModel;
    const tour = buildProcessTour(guide, model);
    expect(tour.stations.map((s) => s.id)).toEqual(['s2']);
  });

  test('of equals, the first stays the station', () => {
    const first = step('s1', 'Order items', 'change');
    const second = step('s2', 'Order items', 'change');
    const guide: WalkGuide = {
      byId: { s1: first, s2: second },
      phases: [{ id: 'p1', label: 'Orders', stepIds: ['s1', 's2'] }],
      business: ['s1', 's2'],
      technical: [],
    };
    const model = { elements: [{ id: 's1', plane: null }, { id: 's2', plane: null }] } as unknown as ProcessMapModel;
    expect(buildProcessTour(guide, model).stations.map((s) => s.id)).toEqual(['s1']);
  });
});
