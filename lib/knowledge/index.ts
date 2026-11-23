/**
 * The knowledge tree (ADR-133 (2); docs/design/engine4.md, "Knowledge sources"): what SAP's synced files and our
 * curated lists say about names — facts, with the `meta` of their source — read by both engines. Pure data:
 * JSON imports and their types only; no import from `lib/abap/` code, `lib/engine4/`, React, Firebase or I/O
 * (`tests/engine4-layer-guard.spec.ts`). No level rule lives here: the A–D grade stays a rule of the readings and
 * out of anything signed.
 */
export { CLOUDIFICATION_META, isCustomerName, isNamespacedName, sapFacts, type CatalogEntry, type KnowledgeMeta, type SapFacts } from './cloudification';
export { IDENTIFIERS_META, isReleasedClass, isReleasedInterface, isSapFunctionModule, releasedCdsView } from './identifiers';
export { SAP_TYPE_GROUPS, isSapTypeGroup, typeGroupOf } from './type-groups';
