import { NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';
import { gradeSapObjectUse } from '@/lib/abap/catalog-service';
import { gradeKey, objectUseFromAccess, type GradedObject, type ObjectUse } from '@/lib/abap/abcd-classification';

/**
 * Resolve clean core levels for a batch of SAP object names.
 *
 * An entry is either a name — graded from the name alone, keyed by the name, as
 * this route has always answered — or `{ name, use }` for a table the code
 * reads or writes, graded for that use and keyed `NAME@use` (`gradeKey`). The
 * use changes the answer for a table like KNA1: C to read it, D to write it.
 *
 * Why a route at all: the grade is a lookup against ~4 MB of generated catalog
 * artifacts. The analyze view that needs it is a client component, so importing
 * the catalog there would ship both maps to the browser. The client sends names
 * and gets grades back.
 *
 * Read-only over public reference data (the same data /catalog serves without a
 * login), but still auth-gated to match the posture of every other route here
 * and to keep the endpoint from being used as a free bulk catalog dump.
 */
export const runtime = 'nodejs';

/** Bounded so a single call cannot be used to enumerate the whole catalog. */
const MAX_OBJECTS = 500;

export async function POST(req: Request) {
  const auth = await verifyRequestAuth(req);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entries = (body as { objects?: unknown })?.objects;
  if (!Array.isArray(entries)) {
    return NextResponse.json(
      { error: 'Expected { objects: Array<string | { name: string; use: "read" | "write" }> }' },
      { status: 400 },
    );
  }
  if (entries.length > MAX_OBJECTS) {
    return NextResponse.json(
      { error: `Too many objects (${entries.length}); the limit is ${MAX_OBJECTS}.` },
      { status: 400 },
    );
  }

  const grades: Record<string, GradedObject> = {};
  for (const raw of entries) {
    let name: string;
    let use: ObjectUse | null = null;
    if (typeof raw === 'string') {
      name = raw;
    } else if (raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string') {
      name = (raw as { name: string }).name;
      // Only the two uses the rule knows; anything else is graded from the name.
      use = objectUseFromAccess(String((raw as { use?: unknown }).use ?? ''));
    } else {
      continue;
    }
    name = name.trim().toUpperCase();
    const key = gradeKey(name, use);
    if (!name || grades[key]) continue;
    grades[key] = gradeSapObjectUse(name, use);
  }

  return NextResponse.json({ grades });
}
