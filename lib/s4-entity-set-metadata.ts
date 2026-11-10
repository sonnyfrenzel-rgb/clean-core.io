/**
 * The fields an OData entity set offers, read from the service's `$metadata`
 * document — never from a record (3.0.21, owner decision 22.10.2026: the
 * privacy policy, terms and trust page of Fassung 1.1 promise that the tenant
 * check reads no record and no count; `/api/test-s4-odata-read` used to read
 * `$top=1` with an inline count).
 *
 * OData v2 and v4 both describe an entity set as
 * `<EntitySet Name="…" EntityType="Namespace.Type"/>` and the type as
 * `<EntityType Name="Type">` with `<Property Name="…"/>` children. Read with
 * patterns, not a DOM: the document is the tenant's and only names are taken.
 *
 * Pure: no imports.
 */

export interface EntitySetFields {
  /** The entity type the set is declared with, as written in the document. */
  entityType: string;
  /** The property names of that type, in document order. */
  fields: string[];
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

/** The set's type and its property names, or null when the document does not declare the set. */
export function entitySetFields(xml: string, entitySet: string): EntitySetFields | null {
  const setTag = [...xml.matchAll(/<(?:[\w]+:)?EntitySet\b[^>]*>/g)].map((m) => m[0]).find((tag) => attr(tag, 'Name') === entitySet);
  if (!setTag) return null;
  const entityType = attr(setTag, 'EntityType');
  if (!entityType) return null;
  const typeName = entityType.split('.').pop() as string;
  const typeOpen = [...xml.matchAll(/<(?:[\w]+:)?EntityType\b[^>]*>/g)].find((m) => attr(m[0], 'Name') === typeName);
  if (!typeOpen || typeOpen.index === undefined) return { entityType, fields: [] };
  const rest = xml.slice(typeOpen.index + typeOpen[0].length);
  const close = rest.search(/<\/(?:[\w]+:)?EntityType>/);
  const body = close >= 0 ? rest.slice(0, close) : '';
  const fields = [...body.matchAll(/<(?:[\w]+:)?Property\b[^>]*>/g)].map((m) => attr(m[0], 'Name')).filter((n): n is string => !!n);
  return { entityType, fields };
}
