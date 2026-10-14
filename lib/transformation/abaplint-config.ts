import { cleanAbapAbaplintRules } from '@/lib/clean-abap-rules';
import { SAP_STUBS_FOLDER } from './abap-sap-stubs';
/**
 * The abaplint configuration of the ABAP Cloud route (roadmap 3.0.12, DSAG
 * ABAP guide review B5): the one the server runs on a RAP package
 * (`abaplint-check.ts`) and the one the Delivery tool hands out as
 * `abaplint.json` — the same object, so a package that passed here passes the
 * same rules in the customer's own CI.
 *
 * What changed against the file Delivery wrote before (3.0.11):
 *
 *   - `syntax.version` is `"Cloud"` — abaplint's own name for ABAP Cloud
 *     (`Version.Cloud` in `@abaplint/core`: the newest release under the
 *     cloud-language restrictions). It was `"v750"`, a classic on-premise
 *     release, so a statement ABAP Cloud forbids passed;
 *   - `allowed_object_types` takes `{ allowed: [...] }` (the rule's own
 *     configuration shape) and names every type the scaffold writes: TABL,
 *     DCLS and INTF were missing, so the delivered package failed its own lint;
 *   - `forbidden_statements` is gone: abaplint has no rule by that key, so it
 *     never checked anything. Whether a table is released is a semantic check
 *     that needs SAP's definitions (see below);
 *   - `errorForAllowed` and `keypath` are gone: no abaplint syntax setting
 *     carries those names.
 *
 * Since 3.0.13 `check_syntax` and `unknown_types` run (an ABAP package is
 * "complete" only when it has no parser and no syntax error in its own
 * objects), and `dependencies` names `checks/sap-stubs/` — the SAP classes the
 * package inherits from, as declarations (`abap-sap-stubs.ts`). Other SAP
 * objects are not there; a reference the check cannot resolve is counted apart.
 *
 * Pure, no abaplint import — the Delivery page imports it without abaplint itself.
 */

/** Object types the RAP scaffold writes (DEVC: the root package's `package.devc.xml`), and the ones its Application Job may add. abaplint knows every one. */
export const ABAPLINT_ALLOWED_OBJECT_TYPES: readonly string[] = ['CLAS', 'INTF', 'TABL', 'DDLS', 'DCLS', 'BDEF', 'SRVD', 'SRVB', 'DEVC', 'SAJC', 'SAJT'];

/** The rules the check runs. Each needs no SAP definitions. */
export const ABAPLINT_RULES = {
  /** ABAP that does not parse, or a statement ABAP Cloud does not have (`WRITE`, `CALL TRANSACTION`). */
  parser_error: true,
  /** A CDS data definition that does not parse. */
  cds_parser_error: true,
  /**
   * The semantic syntax check over the package's own objects (3.0.13): a method called with a parameter it
   * does not have, a variable that is not declared, a type that is not there. SAP's released objects are not in
   * the check — `errorNamespace` makes a reference to them void, and the classes the package inherits from are
   * declared in `checks/sap-stubs/` (the dependency below); what still cannot be resolved is counted apart
   * (`abap-check.ts`), never as an error of the package.
   */
  check_syntax: true,
  /** A type the package uses and declares nowhere (`DATA ls_x TYPE ty_claim` without `ty_claim`). */
  unknown_types: true,
  /** An object type ABAP Cloud does not support. */
  cloud_types: true,
  allowed_object_types: { allowed: [...ABAPLINT_ALLOWED_OBJECT_TYPES] },
  /** ABAP Doc on every public method of a global class or interface (the generated-code rule, B9). */
  abapdoc: { checkLocal: false },
  obsolete_statement: true,
  check_subrc: true,
  /**
   * The abapGit metadata files (3.0.12, abapGit package): well-formed XML, a class's or interface's
   * name and description against its source, a transparent table with delivery class and size category.
   */
  xml_consistency: true,
  /** Every object name within its type's length and pattern — a transparent table 16 characters, a binding 26. */
  allowed_object_naming: true,
  /** An object with both an AFF JSON and an abapGit XML metadata file: abapGit would read only one. */
  aff_and_xml: true,
  /** abapGit writes its XML files with a UTF-8 byte order mark. */
  xml_bom: true,
} as const;

/**
 * The Clean ABAP rules (`lib/clean-abap-rules.ts`: the adopted ones only, each
 * citing its section of SAP's style guide), merged in beside the ones above, so
 * both the server's check and the delivered `abaplint.json` carry them. A key the
 * rules above already set keeps their value: the Cloud check and its object
 * types are not configurable from there.
 */
export function additionalAbaplintRules(): Record<string, unknown> {
  return cleanAbapAbaplintRules();
}

/** The configuration, with `extra` rules merged under the ones this module sets. */
export function abaplintConfig(extra: Record<string, unknown> = additionalAbaplintRules()) {
  return {
    global: { files: '/src/**/*.*' },
    // The SAP classes the package inherits from, as declarations only (`abap-sap-stubs.ts`): delivered with the
    // package, so its own CI reads exactly what the server's check read.
    dependencies: [{ folder: `/${SAP_STUBS_FOLDER}`, files: '/*.*' }] as Array<{ folder: string; files: string }>,
    syntax: { version: 'Cloud', errorNamespace: '^(Z|Y|LCL_|TY_|LIF_|LTD_|LTC_|LHC_|LSC_)' },
    rules: { ...extra, ...ABAPLINT_RULES } as Record<string, unknown>,
  };
}

export const ABAPLINT_CONFIG = abaplintConfig();

/** `abaplint.json` as the Delivery tool hands it out. */
export function abaplintConfigJson(): string {
  return JSON.stringify(ABAPLINT_CONFIG, null, 2);
}
