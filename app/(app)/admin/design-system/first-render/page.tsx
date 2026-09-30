'use client';

import React, { use, useState } from 'react';
import CcButton from '@/components/cc/Button';
import CcDialog from '@/components/cc/Dialog';
import CcMessageBox from '@/components/cc/MessageBox';

/**
 * A test fixture, not a screen — block D, step D.5e.
 *
 * The two modal layers portal to `document.body`, which the server does not
 * have. A layer that is already open on the very first render — a dialog opened
 * from the address, a gate that must be answered first — used to render
 * nothing on the server and a portal on the client, and React threw the page
 * away with a hydration error. `tests/cc-library-addenda.spec.ts` loads this
 * page and listens for that error.
 *
 * Why not on the gallery itself: the gallery waits for the admin profile, so on
 * the server and on the first client render it shows "Loading" — nothing on it
 * is ever open on the first render, and a test there would prove nothing. This
 * page has to be server-rendered with the layer open, so it cannot wait for a
 * profile; it shows a sample sentence and nothing else, which is why it needs
 * no gate. `?layer=box` opens the message box instead of the dialog.
 */
export default function FirstRenderFixture({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // From the request, so the server and the first client render agree.
  const { layer: asked } = use(searchParams);
  const [layer, setLayer] = useState<'dialog' | 'box' | null>(asked === 'box' ? 'box' : 'dialog');

  return (
    <div className="cc bg-cc-page px-6 py-8" data-cc-first-render="">
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-cc-ink">First-render check</h1>
      <p className="mt-1 text-[14px] font-medium text-cc-ink-muted" data-cc-first-render-state={layer ?? 'closed'}>
        {layer ? 'A layer was open on the first render.' : 'Closed.'}
      </p>
      <CcDialog
        open={layer === 'dialog'}
        title="Open on the first render"
        onClose={() => setLayer(null)}
        actions={
          <CcButton variant="primary" onClick={() => setLayer(null)}>
            Done
          </CcButton>
        }
      >
        This dialog was open before the page had hydrated.
      </CcDialog>
      <CcMessageBox
        open={layer === 'box'}
        title="Open on the first render"
        confirmLabel="Done"
        onConfirm={() => setLayer(null)}
        onCancel={() => setLayer(null)}
      >
        This message box was open before the page had hydrated.
      </CcMessageBox>
    </div>
  );
}
