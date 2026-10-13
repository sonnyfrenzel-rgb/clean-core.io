import type { AffSchemaSource } from './aff-check';
import bdefV1 from '@/lib/generated/aff-schemas/bdef-v1.json';
import clasV1 from '@/lib/generated/aff-schemas/clas-v1.json';
import dclsV1 from '@/lib/generated/aff-schemas/dcls-v1.json';
import ddlsV1 from '@/lib/generated/aff-schemas/ddls-v1.json';
import sajcV1 from '@/lib/generated/aff-schemas/sajc-v1.json';
import sajtV1 from '@/lib/generated/aff-schemas/sajt-v1.json';
import srvbV1 from '@/lib/generated/aff-schemas/srvb-v1.json';
import srvdV1 from '@/lib/generated/aff-schemas/srvd-v1.json';
import tablV1 from '@/lib/generated/aff-schemas/tabl-v1.json';
import tabtV1 from '@/lib/generated/aff-schemas/tabt-v1.json';

/**
 * The AFF JSON schemas the weekly sync copies from SAP/abap-file-formats (MIT,
 * `scripts/sync-sap-references.ts`), by `<type>-v<formatVersion>`, for the
 * file-format check (`./aff-check.ts`). Imported statically so the browser's
 * generation can run the check; about 50 kB. A type or version the sync did not
 * copy answers null, and the check reads it as not run, never as a pass.
 * `tests/transformation-aff-check.spec.ts` holds this table to the folder.
 */
export const AFF_SCHEMAS: Readonly<Record<string, unknown>> = Object.freeze({
  'bdef-v1': bdefV1,
  'clas-v1': clasV1,
  'dcls-v1': dclsV1,
  'ddls-v1': ddlsV1,
  'sajc-v1': sajcV1,
  'sajt-v1': sajtV1,
  'srvb-v1': srvbV1,
  'srvd-v1': srvdV1,
  'tabl-v1': tablV1,
  'tabt-v1': tabtV1,
});

export const affSchemaSource: AffSchemaSource = (type, formatVersion) =>
  AFF_SCHEMAS[`${type.toLowerCase()}-v${formatVersion}`] ?? null;
