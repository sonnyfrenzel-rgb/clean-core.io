/**
 * The stamp of the hand-written SAP API catalog (`sap-api-catalog.ts`): the
 * release it was compiled for and the day it was last reviewed. Its own module,
 * free of imports, so a client component can show it beside a curated
 * successor without loading the catalog (roadmap 3.0.13).
 */

export const SAP_API_CATALOG_VERSION = '2024.FPS02';

/** The day the entries of the catalog were last reviewed by hand (not a sync date). */
export const SAP_API_CATALOG_REVIEWED = '2026-10-12';

/** The words shown beside a hit in this layer. */
export const SAP_API_CATALOG_STAMP = `this product's curated SAP API catalog, compiled for ${SAP_API_CATALOG_VERSION}, reviewed ${SAP_API_CATALOG_REVIEWED}; not synced from SAP`;
