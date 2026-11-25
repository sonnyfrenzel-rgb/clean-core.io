/**
 * `lookup_sap_object_level` of the MCP beta: the clean core level of named SAP
 * objects, answered by the same server-side lookup as `/api/abcd-classify`
 * (`gradeSapObjectUse`, `hasNoReleasedApiPath`, `primarySuccessor`) over the
 * catalog files this build ships. No SAP site is read; nothing is stored.
 */
import { APP_VERSION } from '../version';
import { getLevelRuleVersion, gradeSapObjectUse, hasNoReleasedApiPath, primarySuccessor } from '../abap/catalog-service';
import { catalogSnapshotKeyFor, catalogSnapshotRefFor } from '../abap/catalog-snapshots';
import type { ObjectUse } from '../abap/abcd-classification';
import { objectToSlug } from '../abap/catalog-slug';
import { DEFAULT_EDITION, SCHEMA_VERSION, ToolInputError, type Edition } from './analyze';
import { neutraliseDeep } from './sanitize';

export const MAX_NAMES = 50;
export const NAME_PATTERN = /^[A-Za-z0-9_/]{1,40}$/;

export interface LookupArgs {
  names: readonly string[];
  use?: ObjectUse | null;
  edition?: unknown;
}

export function lookupSapObjectLevel(args: LookupArgs) {
  const asked = args.edition === undefined || args.edition === null || args.edition === '' ? DEFAULT_EDITION : args.edition;
  if (asked !== 'public' && asked !== 'private') {
    throw new ToolInputError(
      'edition-not-supported',
      'The catalog is read for SAP S/4HANA Cloud Public Edition ("public") and SAP Cloud ERP Private ("private") only.',
    );
  }
  const edition: Edition = asked;
  const key = catalogSnapshotKeyFor(edition, '');
  const snapshot = catalogSnapshotRefFor(edition, '');
  const use = args.use ?? null;
  const seen = new Set<string>();
  const objects = [];
  for (const raw of args.names) {
    const name = raw.trim().toUpperCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const graded = gradeSapObjectUse(name, use, key);
    const successor = primarySuccessor(name);
    objects.push({
      name,
      level: graded.grade,
      level_basis: graded.provenance,
      ...(graded.state ? { sap_state: graded.state } : {}),
      ...(graded.use ? { use: graded.use } : {}),
      ...(graded.objectGrade ? { level_of_object_alone: graded.objectGrade } : {}),
      no_released_path: hasNoReleasedApiPath(name, key),
      // Who names the successor travels with it: SAP's release file, or Clean-Core.io's curated mapping.
      ...(successor ? { successor: { name: successor.name, named_by: successor.source === 'sap' ? 'SAP release file' : 'Clean-Core.io curated mapping' } } : {}),
      ...(graded.provenance === 'catalog'
        ? { catalog_url: `https://clean-core.io/catalog/${encodeURIComponent(objectToSlug(name))}` }
        : {}),
    });
  }
  return neutraliseDeep({
    schema_version: SCHEMA_VERSION,
    origin: 'engine',
    ai_generated: false,
    signed: false,
    engine: {
      version: APP_VERSION,
      edition,
      catalog_snapshot: { key: snapshot.registryKey, sha256: snapshot.sourceSha256 },
      level_rule_version: getLevelRuleVersion().version,
    },
    objects,
    note: 'Levels come from SAP\'s published Cloudification Repository files as shipped with this Clean-Core.io release. "Unknown" means the files do not list the object.',
  });
}
