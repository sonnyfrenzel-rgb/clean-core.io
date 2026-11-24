'use client';

import CcDisclosure from '@/components/cc/Disclosure';
import { DEMO_ABOUT_TITLE, DEMO_QUOTA_NOTICE, DEMO_UNSIGNED_WHY } from '@/lib/demo-marks';

/**
 * The demo strip's second level (owner 24.11.2026: short on top, complete
 * underneath). On top the strip says what the screen is and that nothing is
 * signed; here, one action deeper, why a demo cannot be signed and that it
 * costs no analysis run. Folded, never removed, open on paper.
 */
export default function DemoAbout() {
  return (
    <div className="mt-1" data-demo-about="">
      <CcDisclosure title={DEMO_ABOUT_TITLE}>
        <p className="m-0 cc-text-cell text-cc-ink">{DEMO_UNSIGNED_WHY}</p>
        <p className="m-0 mt-1 cc-text-cell text-cc-ink">{DEMO_QUOTA_NOTICE}</p>
      </CcDisclosure>
    </div>
  );
}
