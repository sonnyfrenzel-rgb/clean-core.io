/**
 * The synced SAP name lists (`npm run sync:identifiers`), as a module of its
 * own so that `lib/sap-identifiers.ts` can load it with a dynamic `import()`:
 * the ~0.5 MB of names becomes a chunk fetched on demand, never part of a
 * page's bundle (tests/client-catalog-boundary.spec.ts). Import it nowhere
 * else statically.
 */
import file from './abap/generated/sap-identifiers.json';

export default file as unknown;
