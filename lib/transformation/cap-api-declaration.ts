/**
 * The part of the `@sap/cds` API the generated CAP shell uses, declared by Clean-Core.io (roadmap 3.0.13,
 * CAP shell). It stands in for SAP's own typings (`@cap-js/cds-types`, Apache-2.0) where those are not
 * installed: in the server's type check of a candidate (`lib/test-sandbox/type-check.ts`, as virtual files) and
 * in the specs that run `tsc` on a written package. It is never shipped: the package's `devDependencies` name
 * `@cap-js/cds-types`, and `npm run typecheck` in the package checks against SAP's typings.
 *
 * Why a stand-in and not the real typings on the server: `@cap-js/cds-types` declares `@sap/cds` as a peer
 * dependency, and npm installs peers — the server would then carry `@sap/cds` and `@sap/cds-compiler`, which
 * are under the SAP Developer License, not an open-source licence (see `cds-compile.ts`).
 *
 * The declaration is a subset: every member is one the real typings declare with a compatible signature
 * (`@cap-js/cds-types` 0.20: `ApplicationService`, `Service.on/init/run`, `Request.data/error/reject`,
 * `connect.to`, the global `SELECT`/`INSERT`). The optional acceptance step type-checks the generated shell
 * against the real typings too.
 */

export const CAP_TYPES_PACKAGE = '@cap-js/cds-types';

const DTS = `// Stand-in for ${CAP_TYPES_PACKAGE}: the part of the @sap/cds API the CAP shell uses (Clean-Core.io). Not shipped.
declare module '@sap/cds' {
  export interface Query {
    where(predicate: Record<string, unknown>): Query;
    columns(...columns: string[]): Query;
    limit(rows: number): Query;
    entries(...rows: Array<Record<string, unknown>>): Query;
  }
  export interface Request {
    data: any;
    error(status: number, message?: string, target?: string): Error;
    reject(status: number, message?: string, target?: string): never;
  }
  export class Service {
    init(): Promise<void>;
    on(event: string, handler: (req: Request) => unknown): this;
    run(query: Query): Promise<any>;
  }
  export class ApplicationService extends Service {}
  export const connect: { to(datasource: string): Promise<Service> };
  const cds: { ApplicationService: typeof ApplicationService; Service: typeof Service; connect: typeof connect };
  export default cds;
}
declare const SELECT: { from(entity: string): import('@sap/cds').Query };
declare const INSERT: { into(entity: string): import('@sap/cds').Query };
`;

/** The stand-in as package files, relative to the candidate's root. */
export const CAP_TYPES_STANDIN: ReadonlyArray<{ path: string; content: string }> = Object.freeze([
  { path: `node_modules/${CAP_TYPES_PACKAGE}/package.json`, content: `${JSON.stringify({ name: CAP_TYPES_PACKAGE, version: '0.0.0-clean-core-standin', types: 'index.d.ts' })}\n` },
  { path: `node_modules/${CAP_TYPES_PACKAGE}/index.d.ts`, content: DTS },
]);
