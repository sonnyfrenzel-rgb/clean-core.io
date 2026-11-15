'use client';

import { useEffect, useState } from 'react';
import type { CustomerTexts } from '@/lib/abap/customer-texts';

/**
 * The project's customer texts (concept "Business-Lesbarkeit" H5(b)): the dictionary texts its abapGit upload carried,
 * read through `GET /api/projects/{id}/customer-texts`. Null while unread, without any, or when they cannot be read —
 * the Business view then reads as it does without a package. Every surface that phrases business text (the map, the
 * story, "In short", the rules, the documentation) takes the same value from here.
 */
export function useCustomerTexts(projectId: string | null | undefined): CustomerTexts | null {
  const [held, setHeld] = useState<{ id: string; texts: CustomerTexts | null } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void import('@/lib/customer-texts-client')
      .then((client) => client.fetchCustomerTexts(projectId))
      .then((texts) => {
        if (!cancelled) setHeld({ id: projectId, texts });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return held && held.id === projectId ? held.texts : null;
}
