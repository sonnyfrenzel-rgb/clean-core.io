import fs from 'fs';
import path from 'path';
import { contractOfProject } from '@/lib/contract-build';
import { findingsOf } from '@/lib/it-findings-build';
import { assertNoTrustChain, type DemoProject } from '@/lib/demo-project';
import { DEMO_SOURCE_FILE } from '@/lib/demo-marks';
import { APP_VERSION } from '@/lib/version';
import type { ArchitectureContract } from '@/lib/architecture-contract';
import type { ItFindingRow } from '@/lib/it-findings';

/**
 * What the demo's Design stage is drawn from — the same two answers a real
 * project's Design page reads from its server routes, computed here instead:
 *
 *   - the architecture contract, `contractOfProject` — the function behind
 *     `GET /api/projects/{id}/contract`;
 *   - the findings with their catalog successors, `findingsOf` — the function
 *     behind `GET /api/projects/{id}/findings`.
 *
 * The demo has no run, so the contract is built with no input manifest. That
 * is the honest input, and the contract says what follows from it: the target
 * context is not bound and the contract is blocked, exactly as for a project
 * with no signed run. No run id, no fingerprint of an input, no account —
 * `assertNoTrustChain` refuses the result otherwise.
 *
 * Built only for the Design stage: the source and the contract are not shipped
 * to the six screens that do not draw them.
 *
 * Server-only: reads the file and reaches the catalog.
 */
export interface DemoDesignData {
  /** `null` only when the engine built none; the stage then says so. */
  contract: ArchitectureContract | null;
  findings: ItFindingRow[];
  /** The whole example, for the source lines the Evidence tab quotes. */
  source: string;
}

const DEMO_PATH = path.join(process.cwd(), 'public', 'starter-examples', DEMO_SOURCE_FILE);

export function buildDemoDesign(demo: Pick<DemoProject, 'deployment' | 'catalogSnapshot'>): DemoDesignData {
  // LF, as `lib/demo-workspace.ts` reads it: the same bytes on every checkout.
  const source = fs.readFileSync(DEMO_PATH, 'utf8').replace(/\r\n/g, '\n');
  // The demo's analysis is made with the current engine (`buildDemoProject`
  // routes at `APP_VERSION`), so its contract reads the same route rule —
  // with no version the contract would read an unstamped run's, the rule
  // before 3.0.12 (`ON_STACK_CONSTRUCTS_FROM`), and disagree with the demo's
  // own route.
  const built = contractOfProject({ legacyCode: source, s4Deployment: demo.deployment, analyzerVersion: APP_VERSION }, null);
  const data: DemoDesignData = {
    contract: built.ok ? built.contract : null,
    findings: findingsOf(source, DEMO_SOURCE_FILE, demo.deployment, demo.catalogSnapshot, APP_VERSION).rows,
    source,
  };
  assertNoTrustChain(data);
  return data;
}
