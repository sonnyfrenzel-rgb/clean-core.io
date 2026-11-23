'use client';

import { useState } from 'react';
import { publicButton } from './public-button';

/**
 * Copies a link to the clipboard. Nothing is sent anywhere: where the browser
 * refuses the clipboard, the link is shown instead so it can be copied by hand.
 */
export default function CopyLinkButton({ url, children }: { url: string; children: React.ReactNode }) {
  const [label, setLabel] = useState<React.ReactNode>(children);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setLabel('Link copied');
    } catch {
      setLabel(url);
    }
  };
  return (
    <button type="button" className={publicButton('secondary', 'sm')} onClick={copy} aria-live="polite">
      {label}
    </button>
  );
}
