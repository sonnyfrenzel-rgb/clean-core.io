import { redirect } from 'next/navigation';
import { PHASES } from '@/lib/workflow-steps';

/** `/demo` opens at the first stage, whichever the workflow says that is. */
export default function DemoIndexPage() {
  redirect(`/demo/${PHASES[0].key}`);
}
