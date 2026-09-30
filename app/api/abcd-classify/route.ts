import { NextResponse } from 'next/server';
import { verifyRequestAuth } from '@/lib/firebase-admin';
import {
  assertSnapshot,
  CatalogSnapshotNotShipped,
  getCatalogSnapshotRef,
  getLevelRuleVersion,
  gradeSapObjectUse,
  hasNoReleasedApiPath,
} from '@/lib/abap/catalog-service';
import { gradeKey, objectUseFromAccess, type GradedObject, type ObjectUse } from '@/lib/abap/abcd-classification';
import { profileCoverage, PROFILE_VERSION, type AssessmentProfile } from '@/lib/assessment-profile';
import { catalogSnapshotKeyFor } from '@/lib/abap/catalog-snapshots';

/**
 * Resolve clean core levels — and, since roadmap "SAP-Katalog im
 * Browser-Bundle", the catalog's "no released API path" verdict — for a batch
 * of SAP object names.
 *
 * An entry is either a name — graded from the name alone, keyed by the name, as
 * this route has always answered — or `{ name, use }` for a table the code
 * reads, writes, or depends on as a type, graded for that use and keyed
 * `NAME@use` (`gradeKey`). The use changes the answer for a table like KNA1: C
 * to read it or to name it as a type, D to write it.
 *
 * `noPath` answers a second, use-independent question — `catalog-service.ts`'s
 * `hasNoReleasedApiPath()`, whether the Cloudification Repository shows no
 * released successor and no extension path — keyed by the plain, upper-cased
 * name. It lives in its own map rather than inside `GradedObject` because it
 * does not vary with `use`, and duplicating it under both `NAME@read` and
 * `NAME@write` would invite the two to silently disagree after a future edit.
 * `components/analyze/UsageRiskMatrix.tsx` (via `lib/abap/usage-join.ts`) and
 * `components/workspace/PublicCloudFitPanel.tsx` (via
 * `lib/abap/public-cloud-fit-resolver.ts`) both need exactly this fact and
 * are client components, which is why it is answered here rather than by
 * importing `hasNoReleasedApiPath` where they run.
 *
 * Why a route at all: both lookups run against ~4 MB of generated catalog
 * artifacts. The views that need them are client components, so importing the
 * catalog there would ship both maps to the browser. The client sends names
 * and gets grades (and path facts) back.
 *
 * Read-only over public reference data (the same data /catalog serves without a
 * login), but still auth-gated to match the posture of every other route here
 * and to keep the endpoint from being used as a free bulk catalog dump.
 *
 * **Which snapshot answered (roadmap 7.10, CR-02).** Every answer names the
 * catalog snapshot it was read from — registry key and the digest of the file
 * SAP served — so a grade is never a grade "from the catalog" in general.
 * Two optional fields make the lookup a lookup *under a target profile*:
 *
 *   - `snapshot`: the registry key the caller wants the answer from. A key this
 *     build does not ship is refused (422, `snapshot-not-shipped`) — `latest`
 *     never answers in place of `pce-2023-3`.
 *   - `profile: { edition, release }`: the target. The answer then carries
 *     `coverage` (`lib/assessment-profile.ts`): `covered`, `unconfirmed` with the
 *     sentences saying why (a Private Edition target read against the Public
 *     list, a named release with only a moving snapshot), or — for an edition
 *     nothing can be looked up for — a 422 with the sentence and no grades at
 *     all. A refused profile never comes back as grades with a footnote.
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

  // Which release file answers: the one the caller names, else the one the
  // target reads (pinned Private Edition file for a named release, the
  // edition's moving list otherwise), else the default file.
  const requested = (body as { snapshot?: unknown })?.snapshot;
  const rawProfile = (body as { profile?: unknown })?.profile;
  const p = (rawProfile && typeof rawProfile === 'object' ? rawProfile : {}) as Record<string, unknown>;
  const edition = String(p.edition ?? '');
  const release = typeof p.release === 'string' ? p.release.trim().slice(0, 40) : '';
  let readKey: string | undefined;
  if (requested !== undefined) {
    readKey = typeof requested === 'string' ? requested : String(requested);
    try {
      assertSnapshot(readKey);
    } catch (err) {
      if (err instanceof CatalogSnapshotNotShipped) {
        return NextResponse.json(
          { error: err.message, code: 'snapshot-not-shipped', snapshot: getCatalogSnapshotRef() },
          { status: 422 },
        );
      }
      throw err;
    }
  } else if (rawProfile !== undefined) {
    readKey = catalogSnapshotKeyFor(edition, release);
  }
  const snapshot = getCatalogSnapshotRef(readKey);

  // The target, when the caller names one. Built with the snapshot this
  // lookup actually reads and the level rule's own version, so the coverage
  // speaks about this answer and not about an ideal one.
  let coverage: ReturnType<typeof profileCoverage> | null = null;
  if (rawProfile !== undefined) {
    const profile: AssessmentProfile = {
      profileVersion: PROFILE_VERSION,
      edition: edition as AssessmentProfile['edition'],
      release,
      components: [],
      catalogSnapshot: snapshot,
      ruleVersion: `levels ${getLevelRuleVersion().fingerprint}`,
      languageVersions: [],
    };
    coverage = profileCoverage(profile);
    if (coverage.state === 'rejected') {
      return NextResponse.json(
        { error: coverage.sentence, code: 'profile-rejected', snapshot, coverage },
        { status: 422 },
      );
    }
  }

  const grades: Record<string, GradedObject> = {};
  const noPath: Record<string, boolean> = {};
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
    if (!name) continue;
    const key = gradeKey(name, use);
    if (!grades[key]) grades[key] = gradeSapObjectUse(name, use, readKey);
    // Keyed by name alone — hasNoReleasedApiPath does not depend on `use`, so
    // one entry serves every use of the same object.
    if (!(name in noPath)) noPath[name] = hasNoReleasedApiPath(name);
  }

  return NextResponse.json({ grades, noPath, snapshot, ...(coverage ? { coverage } : {}) });
}
