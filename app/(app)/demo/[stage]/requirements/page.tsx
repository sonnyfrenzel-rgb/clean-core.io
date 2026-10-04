import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import DemoWorkspace from '@/components/demo/DemoWorkspace';
import { buildDemoProject } from '@/lib/demo-project';
import { buildDemoDesign } from '@/lib/demo-design';
import { DEMO_PROJECT_TITLE, DEMO_STRIP_NOTICE } from '@/lib/demo-marks';

/**
 * The demo's requirements workspace — the Design tool's module (ADR-078),
 * under the Design stage as on a real project. Only Design has one; any other
 * stage name is a page that does not exist. Built on the server from the
 * example like the stage itself; the workspace drafts the specification in
 * the browser and stores nothing.
 */
export const revalidate = 300;

export function generateStaticParams() {
  return [{ stage: 'design' }];
}

export const metadata: Metadata = {
  title: `${DEMO_PROJECT_TITLE} · Requirements | Clean-Core.io`,
  description: DEMO_STRIP_NOTICE,
  robots: { index: false, follow: false },
};

export default async function DemoRequirementsPage({ params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;
  if (stage !== 'design') notFound();
  const demo = buildDemoProject();
  return <DemoWorkspace demo={demo} stage="design" design={buildDemoDesign(demo)} sub="requirements" />;
}
