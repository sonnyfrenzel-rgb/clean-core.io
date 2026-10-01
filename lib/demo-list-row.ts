import fs from 'fs';
import path from 'path';
import { buildDemoProject } from '@/lib/demo-project';
import { findingsOf } from '@/lib/it-findings-build';
import { levelsOf } from '@/lib/workspace-row-facts';
import { DEMO_SOURCE_FILE } from '@/lib/demo-marks';
import type { WorkspaceDemoRow } from '@/components/workspace/WorkspaceListReport';

/**
 * The demo's row in "My workspace" — every figure computed by the engine of
 * this release from the example file, on the server, the same way the demo's
 * own IT view computes its findings (`lib/demo-workspace.ts`). Nothing is
 * transcribed from the mockup: its "7 / 7 rules confirmed" and "handed over"
 * describe a demo that was signed, and this one is not. The rules column says
 * how many rules the engine derived and that none is confirmed.
 *
 * Server-only: reads the file and reaches the catalog.
 */
let cached: WorkspaceDemoRow | null = null;

/**
 * Held per server process: the input is a file of this release and the engine
 * is deterministic, so the answer cannot change until the next deploy — and
 * `/dashboard` is rendered on every request.
 */
export function demoListRow(): WorkspaceDemoRow {
  if (!cached) cached = computeDemoListRow();
  return cached;
}

function computeDemoListRow(): WorkspaceDemoRow {
  const demo = buildDemoProject();
  const source = fs
    .readFileSync(path.join(process.cwd(), 'public', 'starter-examples', DEMO_SOURCE_FILE), 'utf8')
    .replace(/\r\n/g, '\n');
  const findings = findingsOf(source, DEMO_SOURCE_FILE, demo.deployment, demo.catalogSnapshot);
  const levels = levelsOf(findings);
  return {
    lines: demo.totalLines,
    findings: demo.analyze.findings.length,
    levels: levels.state === 'ready' ? levels.value : null,
    rules: findings.rulesDerived,
  };
}
