import fs from 'fs';
import path from 'path';
import { buildDemoProject, assertNoTrustChain, type DemoProject } from '@/lib/demo-project';
import { buildBpmnExportFromSource } from '@/lib/bpmn/export';
import { buildProcessMapModel, type ProcessMapModel } from '@/lib/process-map';
import { applyNaming, namingContextOf } from '@/lib/process-naming';
import { findingsOf } from '@/lib/it-findings-build';
import type { ItFindingsSource } from '@/lib/it-findings';
import { DEMO_OBJECT_NAME, DEMO_PROJECT_TITLE, DEMO_SOURCE_FILE } from '@/lib/demo-marks';
import type { Project } from '@/lib/types';

/**
 * The demo in the 3.0 workspace — roadmap 3.0.7, `DESIGN.md` §6.1.2.
 *
 * The same demo as the seven stages of roadmap 0.10 (`lib/demo-project.ts`),
 * with what the workspace needs on top of it: the source for the code column,
 * the process map, the findings of the IT view and a project-shaped record for
 * the pure workspace model (`lib/workspace-model.ts`, `lib/management-answers.ts`).
 *
 * Every part is computed here, on the server, by the engine of this release —
 * the same functions the routes behind a real workspace call
 * (`/api/projects/{id}/findings` is `findingsOf`, `/process-map` is
 * `buildBpmnExportFromSource`). Nothing is transcribed, and nothing reaches a
 * route, a run or Firestore: the workspace components that would fetch are
 * handed their answer as a prop instead.
 *
 * **The project record is minimal on purpose.** It carries the source, the
 * inventory and the deployment assumption, and not one field that says
 * something happened: no run id, no fingerprint, no score written as if a
 * signed run had stored it. The workspace model reads that absence and says
 * "no signed run" in every view — which is true.
 *
 * Server-only: reads the file and reaches the catalog.
 */

export interface DemoWorkspaceData {
  demo: DemoProject;
  /** The whole example, for the code column and the first look. */
  source: string;
  /** What the pure workspace model reads. No trust-chain field (see above). */
  project: Project;
  processMap: ProcessMapModel;
  itFindings: ItFindingsSource;
}

const DEMO_PATH = path.join(process.cwd(), 'public', 'starter-examples', DEMO_SOURCE_FILE);

/** The BPMN and its model, exactly as `hooks/useProcessMap.ts` builds them — without a naming, because a demo calls no model. */
export function demoProcessMap(source: string): ProcessMapModel {
  const named = applyNaming(namingContextOf(source), null);
  const bpmn = buildBpmnExportFromSource(source, {
    processName: DEMO_OBJECT_NAME,
    sourceFileName: DEMO_SOURCE_FILE,
  });
  return buildProcessMapModel({ bpmn, named, fileName: DEMO_SOURCE_FILE });
}

export function buildDemoWorkspace(): DemoWorkspaceData {
  const demo = buildDemoProject();
  // LF, whatever the checkout did to the file: a Windows working copy carries
  // CRLF, the deployed image LF, and the demo — and its release record — must
  // be the same bytes on both (`lib/demo-release.ts`).
  const source = fs.readFileSync(DEMO_PATH, 'utf8').replace(/\r\n/g, '\n');

  const project: Project = {
    name: DEMO_PROJECT_TITLE,
    legacyCode: source,
    s4Deployment: demo.deployment,
    codeInventory: demo.documentation.inventory,
    dataCoupling: demo.documentation.coupling,
  };

  const data: DemoWorkspaceData = {
    demo,
    source,
    project,
    processMap: demoProcessMap(source),
    itFindings: findingsOf(source, DEMO_SOURCE_FILE, demo.deployment),
  };

  // The same invariant as the stages: a demo that carries a run, a signature or
  // an account must not render at all.
  assertNoTrustChain(data);
  return data;
}
