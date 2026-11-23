'use client';

import React, { useMemo } from 'react';
import CcMessageStrip from '@/components/cc/MessageStrip';
import DocumentationOnePage, { DocFold } from '@/components/documentation/DocumentationOnePage';
import { ProcessDocumentAppendix } from '@/components/documentation/DocAppendix';
import ProcessDocumentationView from '@/components/documentation/ProcessDocumentationView';
import { useAroundTheMap } from '@/hooks/useAroundTheMap';
import { documentationPage } from '@/lib/documentation-page';
import type { ProcessMapModel } from '@/lib/process-map';
import type { ProcessHandbookData } from '@/lib/process-handbook';
import type { ProcessDocumentation } from '@/lib/process-documentation';
import type { ProcessDocument } from '@/lib/process-document';
import { DEMO_ROUTE, DEMO_SUBJECT, DEMO_TITLE_PREFIX } from '@/lib/demo-marks';

/**
 * The demo's Documentation tool — the same one page a real project shows (ADR-127, mock-up
 * `docs/roadmap/documentation-v2-mockup.html`), over the map and the description `lib/demo-project.ts` read from
 * the example file on the server, and Analyze's text read here from the same example.
 *
 * What the demo leaves out is what needs a project: the exports (a demo exports nothing), the model's proposals, the
 * revisions and the code in Analyze. Every number and sentence is the engine's.
 */
export default function DemoDocumentation({
  process,
  businessLayer,
  source = null,
}: {
  process: { model: ProcessMapModel; handbook: ProcessHandbookData; document: ProcessDocument | null; engine: ProcessDocumentation } | null;
  /** What stands where a real project offers the model's SOP and RACI — the demo makes no model call. */
  businessLayer?: React.ReactNode;
  /** The example the demo was built from, read on the server for this stage only — Analyze's phases, roles and questions. */
  source?: string | null;
}) {
  const around = useAroundTheMap({ project: null, projectId: 'demo', owner: false, model: false, source });
  const page = useMemo(
    () => (process?.document ? documentationPage({ document: process.document, model: process.model, around: around.text }) : null),
    [process, around.text],
  );

  if (!process?.document || !page) {
    return (
      <CcMessageStrip state="neutral" headline="The process could not be read from the example">
        A real run reads the process from your code and writes its description here.
      </CcMessageStrip>
    );
  }

  return (
    <div data-demo-documentation="" data-demo-process-document="">
      <DocumentationOnePage
        page={page}
        document={process.document}
        title={`${DEMO_TITLE_PREFIX}${DEMO_SUBJECT}`}
        exports={null}
        noExportNote="The demo exports nothing. A project of your own exports this page as Word, Confluence, Markdown, PDF and BPMN."
        analyzeHref={`${DEMO_ROUTE}/analyze`}
        next={{ label: 'Testing', href: `${DEMO_ROUTE}/testing`, sentence: 'Prepares test cases that show the new version does the same job, from the same rules and early ends as chapters 2 and 3.' }}
        roles={businessLayer ? <div data-demo-business-layer="">{businessLayer}</div> : null}
        appendix={(
          <DocFold id="appendix" title="The full appendix, as every file prints it" count="steps, tables, wording, elements, statements">
            <ProcessDocumentAppendix document={process.document}>
              <ProcessDocumentationView appendix doc={process.engine} groups={process.document.appendix.groups} />
            </ProcessDocumentAppendix>
          </DocFold>
        )}
      />
    </div>
  );
}
