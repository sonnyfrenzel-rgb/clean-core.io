import { getAuth } from '@/lib/firebase';
import { emptyCustomerTexts, isCustomerTexts, MAX_ENTRIES, type CustomerTexts } from '@/lib/abap/customer-texts';

/**
 * The browser's side of a project's customer texts (`app/api/projects/[projectId]/customer-texts/route.ts`): the import
 * stores what it read from the upload's abapGit XML files, the Business view reads them back. Both are best effort —
 * without them the Business view reads as it does without an abapGit package — and neither throws.
 */

export function customerTextsPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/customer-texts`;
}

/**
 * The signed-in account's token. Waits for the session to be restored first (v3.1.0): Analyze asks for these on its
 * first render, before Firebase has read the session back, and a request sent then went without a token (HTTP 401).
 */
async function authHeader(): Promise<Record<string, string>> {
  const auth = getAuth();
  await auth.authStateReady?.();
  const user = auth.currentUser;
  if (!user) return {};
  return { Authorization: `Bearer ${await user.getIdToken()}` };
}

/** Several files' texts as one; the first file that names an entry wins, each kind stays within its bound. */
export function mergeCustomerTexts(all: ReadonlyArray<CustomerTexts | null | undefined>): CustomerTexts | null {
  const out = emptyCustomerTexts();
  let any = false;
  for (const t of all) {
    if (!t) continue;
    for (const kind of ['fields', 'tables', 'selections', 'textSymbols'] as const) {
      for (const [k, v] of Object.entries(t[kind])) {
        if (Object.keys(out[kind]).length >= MAX_ENTRIES || k in out[kind]) continue;
        out[kind][k] = v;
        any = true;
      }
    }
    for (const [k, v] of Object.entries(t.values)) {
      if (Object.keys(out.values).length >= MAX_ENTRIES || k in out.values) continue;
      out.values[k] = v;
      any = true;
    }
  }
  return any ? out : null;
}

/** Stores the texts with the project; false when they could not be stored. */
export async function storeCustomerTexts(projectId: string, texts: CustomerTexts): Promise<boolean> {
  try {
    const res = await fetch(customerTextsPath(projectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ texts }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The project's stored texts, or null when there are none or they cannot be read. */
export async function fetchCustomerTexts(projectId: string): Promise<CustomerTexts | null> {
  try {
    const res = await fetch(customerTextsPath(projectId), { headers: await authHeader() });
    if (!res.ok) return null;
    const body = (await res.json()) as { texts?: unknown };
    return isCustomerTexts(body.texts) ? body.texts : null;
  } catch {
    return null;
  }
}
