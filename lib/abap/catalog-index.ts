/**
 * Catalog index helpers for the public /catalog pages.
 *
 * Derives lightweight, serializable views from the merged catalog
 * (lib/abap/catalog-service.ts) — WITHOUT shipping the full 23k-entry map to
 * the client. Object pages render server-side via resolveApi(); these helpers
 * only provide names, slugs and A–Z grouping for navigation.
 *
 * Navigation is alphabetical (A–Z browse) and by SAP application area
 * (getModuleAreas / getObjectsByModule). The area comes from the generated
 * artifacts' `appComponent` field, read here directly — these helpers run
 * server-side only, so the artifacts never reach the client.
 */

import { MERGED_TABLE_MAP, NO_PATH_OBJECTS } from './catalog-service';
import crLatest from './generated/cloudification-repo.latest.json';
import crClassifications from './generated/cloudification-repo.classifications-sap.json';
import type { CloudificationArtifact } from './cloudification-repo';

/** Only plain object names are routable as clean slugs (namespaced /NS/OBJ excluded). */
const ROUTABLE = /^[A-Z0-9_]+$/;

export function objectToSlug(name: string): string {
  return name.toLowerCase();
}
export function slugToObject(slug: string): string {
  return (slug || '').toUpperCase();
}

/** Union of mapped objects and honest no-path objects, sorted, routable only. */
export function getAllCatalogObjectNames(): string[] {
  const set = new Set<string>([...Object.keys(MERGED_TABLE_MAP), ...NO_PATH_OBJECTS]);
  return Array.from(set).filter((n) => ROUTABLE.test(n)).sort();
}

/** Objects whose name starts with a given A–Z letter (or '0' bucket for digits). */
export function getObjectsByLetter(letter: string): string[] {
  const L = (letter || '').toUpperCase();
  return getAllCatalogObjectNames().filter((n) => {
    const first = n[0];
    if (L === '0') return /[0-9]/.test(first);
    return first === L;
  });
}

export const CATALOG_LETTERS = ['0', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];

/** Slim list for client-side search on the index page. Names only. */
export function getCatalogSearchIndex(): string[] {
  return getAllCatalogObjectNames();
}

/**
 * Only objects with a real mapped successor (routable). These are the unique,
 * index-worthy pages. The honest "no released-API path" pages carry near-identical
 * boilerplate, so they are kept accessible (browse + noindex,follow) but excluded
 * from the sitemap to avoid thin/duplicate-content signals.
 */
export function getMappedCatalogObjectNames(): string[] {
  return Object.keys(MERGED_TABLE_MAP).filter((n) => ROUTABLE.test(n)).sort();
}

/* ---------- SAP application areas ---------- */

const CR_REL = crLatest as unknown as CloudificationArtifact;
const CR_CLS = crClassifications as unknown as CloudificationArtifact;

/**
 * SAP application component of an object, e.g. "SD-SLS-SO" for a sales order
 * object. Present for 357 of the 387 mapped objects.
 */
export function getObjectAppComponent(name: string): string {
  const key = (name || '').toUpperCase();
  return CR_REL.entries?.[key]?.appComponent || CR_CLS.entries?.[key]?.appComponent || '';
}

/** Top-level area of an application component: "SD-SLS-SO" -> "SD". */
export function getObjectModuleArea(name: string): string {
  return (getObjectAppComponent(name).split('-')[0] || '').toUpperCase();
}

export interface ModuleArea {
  code: string;
  name: string;
  /** One line describing what the area covers, for the hub page and its meta. */
  blurb: string;
}

/**
 * Named SAP application areas. Only areas we can name correctly appear as hub
 * pages — an area page titled with a bare three-letter code and holding two
 * objects is the thin-content pattern the catalog deliberately avoids.
 */
const MODULE_AREA_NAMES: Record<string, { name: string; blurb: string }> = {
  SD: { name: 'Sales and Distribution', blurb: 'Sales orders, deliveries, billing, pricing and customer master data.' },
  MM: { name: 'Materials Management', blurb: 'Purchasing, inventory management, material master and invoice verification.' },
  FI: { name: 'Financial Accounting', blurb: 'General ledger, accounts payable and receivable, asset accounting and taxes.' },
  CO: { name: 'Controlling', blurb: 'Cost centres, internal orders, profitability analysis and product costing.' },
  FIN: { name: 'Financials (SAP S/4HANA)', blurb: 'The S/4HANA finance components that superseded parts of classic FI and CO.' },
  LO: { name: 'Logistics – General', blurb: 'Cross-logistics master data, batches, business partners and variant configuration.' },
  LE: { name: 'Logistics Execution', blurb: 'Shipping, transportation and warehouse processing.' },
  PP: { name: 'Production Planning and Control', blurb: 'Production orders, MRP, routings and capacity planning.' },
  QM: { name: 'Quality Management', blurb: 'Inspection lots, quality notifications and certificates.' },
  PM: { name: 'Plant Maintenance', blurb: 'Maintenance orders, functional locations and equipment.' },
  SCM: { name: 'Supply Chain Management', blurb: 'Advanced planning, available-to-promise and supply chain integration.' },
  CA: { name: 'Cross-Application Components', blurb: 'Components shared across modules — document management, classification, output.' },
  BC: { name: 'Basis Components', blurb: 'Platform services: communication, security, ABAP runtime, system administration.' },
  EC: { name: 'Enterprise Controlling', blurb: 'Consolidation, profit centre accounting and executive information.' },
  EHS: { name: 'Environment, Health and Safety', blurb: 'Product safety, dangerous goods and industrial hygiene.' },
  CRM: { name: 'Customer Relationship Management', blurb: 'CRM objects reachable from the SAP S/4HANA stack.' },
};

/**
 * An area needs this many indexed objects to get its own hub page. Below it the
 * page would carry a handful of rows and little else, which is exactly the
 * thin-content shape the object catalog is careful not to produce.
 */
const MIN_OBJECTS_PER_AREA = 5;

function buildAreaIndex(): Map<string, string[]> {
  const byArea = new Map<string, string[]>();
  for (const name of getMappedCatalogObjectNames()) {
    const area = getObjectModuleArea(name);
    if (!area || !MODULE_AREA_NAMES[area]) continue;
    const list = byArea.get(area);
    if (list) list.push(name);
    else byArea.set(area, [name]);
  }
  for (const [area, list] of byArea) {
    if (list.length < MIN_OBJECTS_PER_AREA) byArea.delete(area);
    else list.sort();
  }
  return byArea;
}

const AREA_INDEX = buildAreaIndex();

/** Areas that qualify for a hub page, largest first. */
export function getModuleAreas(): Array<ModuleArea & { objectCount: number }> {
  return Array.from(AREA_INDEX.entries())
    .map(([code, list]) => ({
      code,
      name: MODULE_AREA_NAMES[code].name,
      blurb: MODULE_AREA_NAMES[code].blurb,
      objectCount: list.length,
    }))
    .sort((a, b) => b.objectCount - a.objectCount || a.code.localeCompare(b.code));
}

export function getModuleArea(code: string): ModuleArea | undefined {
  const key = (code || '').toUpperCase();
  const meta = MODULE_AREA_NAMES[key];
  if (!meta || !AREA_INDEX.has(key)) return undefined;
  return { code: key, name: meta.name, blurb: meta.blurb };
}

/** Indexed objects belonging to an area, sorted. */
export function getObjectsByModule(code: string): string[] {
  return AREA_INDEX.get((code || '').toUpperCase()) ?? [];
}

/**
 * Sibling objects from the same area, for the "related objects" block on an
 * object page. Internal links between catalog pages were previously limited to
 * "back to catalog", which left 387 pages as topical islands.
 */
export function getRelatedObjects(name: string, limit = 8): string[] {
  const area = getObjectModuleArea(name);
  const key = (name || '').toUpperCase();
  return getObjectsByModule(area)
    .filter((n) => n !== key)
    .slice(0, limit);
}
