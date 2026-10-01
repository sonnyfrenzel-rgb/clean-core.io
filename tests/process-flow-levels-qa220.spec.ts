/**
 * QA full review of v2.20.0 — be67ec5f9d29: converging paths placed a successor
 * before its predecessor in `ProcessFlow`'s layout. Pure: no server.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { processFlowLevels } from '../components/process-flow-levels';

test.describe('be67ec5f9d29 · every successor stands right of its predecessors', () => {
  test('A → B → D and A → C → X → B, shorter branch first: D moves with B', () => {
    const flow = [
      { id: 'A', next: ['B', 'C'] },
      { id: 'B', next: ['D'] },
      { id: 'C', next: ['X'] },
      { id: 'X', next: ['B'] },
      { id: 'D', next: [] },
    ];
    const level = processFlowLevels(flow, 'A');
    // The first walk reaches B at 1 and D at 2; the longer path raises B to 3.
    // The old layout stopped there and drew B → D backwards (D at 2).
    expect(level).toEqual({ A: 0, B: 3, C: 1, X: 2, D: 4 });
    for (const node of flow) {
      for (const next of node.next) expect(level[next], `${node.id} → ${next}`).toBeGreaterThan(level[node.id]);
    }
  });

  test('a loop back to an earlier node is not a longer path', () => {
    const level = processFlowLevels(
      [
        { id: 'S', next: ['T'] },
        { id: 'T', next: ['G'] },
        { id: 'G', next: ['S', 'E'] },
        { id: 'E', next: [] },
      ],
      'S',
    );
    // The start stays the leftmost column; before, the loop pushed it to 3.
    expect(level).toEqual({ S: 0, T: 1, G: 2, E: 3 });
  });

  test('ProcessFlow lays out with it', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/ProcessFlow.tsx'), 'utf8');
    expect(src).toContain('processFlowLevels(flow, startNode.id)');
    expect(src).not.toContain('const calculateLevels');
  });
});
