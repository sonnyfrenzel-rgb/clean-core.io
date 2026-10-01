import type { Metadata } from 'next';
import OwnCodeImport from '@/components/workspace/OwnCodeImport';

/**
 * "New project" with your own code — mockup 2.8 s11.
 *
 * Reached from "Use your own code" on `/admin/new-project`. Nothing is created
 * by arriving here: the files are read and checked in the browser, and the
 * project is written once, when the reader starts the analysis
 * (`components/workspace/OwnCodeImport.tsx`). Behind the same admin gate as the
 * page before it until 3.0.
 */
export const metadata: Metadata = {
  title: 'New project · own code | Clean-Core.io',
  description: 'Add your ABAP program and its includes, see what is read and counted, then start the analysis.',
  robots: { index: false, follow: false },
};

export default function AdminNewProjectUploadPage() {
  return <OwnCodeImport />;
}
