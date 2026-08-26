import { NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';
import { gradeSapObject } from '@/lib/abap/catalog-service';
import type { GradedObject } from '@/lib/abap/abcd-classification';

/**
 * Resolve clean core levels for a batch of SAP object names.
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

  const names = (body as { objects?: unknown })?.objects;
  if (!Array.isArray(names)) {
    return NextResponse.json({ error: 'Expected { objects: string[] }' }, { status: 400 });
  }
  if (names.length > MAX_OBJECTS) {
    return NextResponse.json(
      { error: `Too many objects (${names.length}); the limit is ${MAX_OBJECTS}.` },
      { status: 400 },
    );
  }

  const grades: Record<string, GradedObject> = {};
  for (const raw of names) {
    if (typeof raw !== 'string') continue;
    const name = raw.trim().toUpperCase();
    if (!name || grades[name]) continue;
    grades[name] = gradeSapObject(name);
  }

  return NextResponse.json({ grades });
}
