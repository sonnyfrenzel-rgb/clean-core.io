/**
 * Which building block of `cloudServiceDetails`
 * (`components/design/CloudServiceIntegrations.tsx`) a model-named cloud
 * service is read as. Out of the component since roadmap 3.0.9, so the design
 * export and the SAP reference mapping (`lib/sap-reference-architectures.ts`)
 * read the same key the screen does without importing a client component.
 */

/** The keys of `cloudServiceDetails`, in its order (`tests/sap-reference-architectures.spec.ts` holds the two equal). */
export const CLOUD_SERVICE_KEYS = [
  'xsuaa',
  'destination',
  'eventmesh',
  'postgresql',
  'hanaCloud',
  'cdsView',
  'iamRoles',
  'luwManager',
  'badi',
  'rapService',
  'default',
] as const;
export type CloudServiceKey = (typeof CLOUD_SERVICE_KEYS)[number];

/**
 * "SAP S/4HANA …" is the ERP system, not a database service. The substring `hana`
 * sits inside it, so any rule that matches on `hana` alone claims every S/4HANA
 * destination, OData service and extension name as a database.
 */
const S4 = /s\/?4\s*hana/;

/**
 * The building block a model-named service is read as — the key of
 * `cloudServiceDetails`, and of its SAP reference pattern
 * (`REFERENCE_OF_SERVICE`, `lib/sap-reference-architectures.ts`).
 */
export const getCloudServiceKey = (serviceName: string): CloudServiceKey => {
  const name = serviceName.toLowerCase();
  // BTP / Node.js services
  if (name.includes('xsuaa') || (name.includes('identity') && !name.includes('iam'))) return 'xsuaa';
  if (name.includes('destination') || name.includes('connectivity') || name.includes('sdk')) return 'destination';
  if (name.includes('mesh') || name.includes('messaging') || name.includes('amqp')) return 'eventmesh';
  /*
   * One rule used to read `postgres || hana || database` and return the PostgreSQL
   * guide for all three. "SAP HANA Cloud Database" therefore handed an architect the
   * `pg` package, PostgreSQL credentials and a PostgreSQL connection — for a service
   * that speaks none of it. The guide was not merely
   * unhelpful; it was copyable, and it cannot connect.
   *
   * So each database is matched by its own name, and a service that only says
   * "database" gets the generic binding guide at the bottom rather than a driver
   * picked by guesswork. Naming the wrong client is worse than naming none.
   */
  if (name.includes('postgres')) return 'postgresql';
  if (name.includes('hana') && !S4.test(name)) return 'hanaCloud';
  // A database with no vendor in its name: the generic service-binding guide,
  // before the RAP branch below can read the word "service" in it.
  if (name.includes('database') || /\bdb\b/.test(name)) return 'default';
  // SAP-native / RAP services
  if (name.includes('cds') || name.includes('view') || name.includes('i_') || name.includes('projection')) return 'cdsView';
  if (name.includes('iam') || name.includes('role') || name.includes('auth')) return 'iamRoles';
  if (name.includes('luw') || name.includes('transaction') || name.includes('session')) return 'luwManager';
  if (name.includes('badi') || name.includes('enhancement') || name.includes('exit')) return 'badi';
  if (name.includes('service') || name.includes('srvb') || name.includes('srvd') || name.includes('rap') || name.includes('odata')) return 'rapService';
  return 'default';
};
