'use client';

import { useSyncExternalStore } from 'react';
import { layerParam } from '@/lib/workspace-back-href';
import type { LayerKey } from '@/lib/workspace-model';

const subscribe = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const read = () => layerParam(window.location.hash);
const serverRead = () => null;

/**
 * The layer the reader is in on the workspace page, read from the fragment that
 * holds it (ADR-018). The links into a stage carry it, so the stage's "Back to
 * workspace" says and returns to the view **and** the layer (ADR-050, mockup
 * s8: "Back to workspace · Business, Need & process"). `null` when the
 * fragment names no layer — a reader who did not choose one is not put in one.
 */
export function useWorkspaceLayer(): LayerKey | null {
  return useSyncExternalStore(subscribe, read, serverRead);
}
