'use client';

import FunctionalRequirements from '@/components/design/FunctionalRequirements';
import NonFunctionalRequirements from '@/components/design/NonFunctionalRequirements';
import RequirementsWorkspace from '@/components/requirements/RequirementsWorkspace';
import type { DemoProject } from '@/lib/demo-project';
import type { DemoDesignData } from '@/lib/demo-design';

/**
 * The requirements workspace of the demo's Design stage (ADR-078) — the same
 * workspace as a real project's, read-only: the engine's draft of the example,
 * built in this browser without a model call, and nothing stored, exported or
 * signed. A demo has no account to write it, no route to store it, and no path
 * to an export (DESIGN.md §6.1.2).
 */
export default function DemoRequirements({ demo, data }: { demo: DemoProject; data: DemoDesignData | null }) {
  const name = demo.sourceFile.replace(/\.(abap|txt)$/i, '');
  const missing = data ? null : 'The demo could not read its example. Reload the page to try again.';
  return (
    <div data-testid="demo-requirements">
      <RequirementsWorkspace
        mode="demo"
        projectId={null}
        projectName={name}
        fileName={demo.sourceFile}
        source={data?.source ?? null}
        missingReason={missing}
        levels={data?.findings ?? null}
        ruleStates={null}
        proposals={null}
        route={null}
        accountEmail={null}
        engineReading={
          <>
            <FunctionalRequirements projectId={null} projectName={name} fileName={demo.sourceFile} source={data?.source ?? null} missingReason={missing} levels={data?.findings ?? null} />
            <NonFunctionalRequirements projectId={null} projectName={name} fileName={demo.sourceFile} source={data?.source ?? null} missingReason={missing} levels={data?.findings ?? null} />
          </>
        }
      />
    </div>
  );
}
