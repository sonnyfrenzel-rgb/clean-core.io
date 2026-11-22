/**
 * Knowledge: names SAP publishes as its own — released classes and interfaces (derived from the Cloudification
 * Repository by the catalog sync) and the SAP identifier lists (released CDS views, classic BAPIs/function
 * modules; `scripts/sync-sap-identifiers.ts`, Apache-2.0 plus CC BY 4.0 per fact). ADR-133 (2): pure data, JSON
 * imports only.
 */
import releasedClasses from '../abap/generated/released-classes.latest.json';
import releasedInterfaces from '../abap/generated/released-interfaces.latest.json';
import identifiers from '../abap/generated/sap-identifiers.json';

interface NameList { key: string; release?: string; url?: string; fetchedAt?: string; sourceSha256?: string; names: string[] }

const CLASSES = new Set((releasedClasses as { classes: string[] }).classes.map((n) => n.toUpperCase()));
const INTERFACES = new Set((releasedInterfaces as { interfaces: string[] }).interfaces.map((n) => n.toUpperCase()));
const LISTS = (identifiers as unknown as { lists: NameList[] }).lists;
const byKey = (key: string) => new Set((LISTS.find((l) => l.key === key)?.names ?? []).map((n) => n.toUpperCase()));
const CDS_PUBLIC = byKey('cds-public');
const CDS_PRIVATE = byKey('cds-private');
const FUNCTION_MODULES = byKey('bapi-classic');

export const IDENTIFIERS_META = Object.freeze({
  releasedClasses: (releasedClasses as { meta: Record<string, unknown> }).meta,
  releasedInterfaces: (releasedInterfaces as { meta: Record<string, unknown> }).meta,
  lists: LISTS.map(({ key, release, url, fetchedAt, sourceSha256 }) => ({ key, release, url, fetchedAt, sourceSha256 })),
});

const up = (name: string) => (name || '').toUpperCase().trim();

/** A class SAP released for ABAP Cloud (S/4HANA Cloud Public Edition, latest). */
export function isReleasedClass(name: string): boolean {
  return CLASSES.has(up(name));
}

/** An interface SAP released for ABAP Cloud. */
export function isReleasedInterface(name: string): boolean {
  return INTERFACES.has(up(name));
}

/** A CDS view SAP released, and in which edition's list. */
export function releasedCdsView(name: string): { public: boolean; private: boolean } | null {
  const n = up(name);
  const pub = CDS_PUBLIC.has(n);
  const priv = CDS_PRIVATE.has(n);
  return pub || priv ? { public: pub, private: priv } : null;
}

/** A function module SAP lists as a classic API (BAPI): a `CALL FUNCTION` of it is no missing upload. */
export function isSapFunctionModule(name: string): boolean {
  return FUNCTION_MODULES.has(up(name));
}
