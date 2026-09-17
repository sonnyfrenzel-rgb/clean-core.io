/**
 * bpmnlint, as much of it as roadmap 3.3 uses.
 *
 * The package ships JSDoc types for its own internals but no `types` entry and
 * no declarations for the two sub-paths this product imports, so `tsc` would
 * refuse them. Declared narrowly on purpose: the linter is called in exactly one
 * place (`lib/process-hints.ts`) and a wider surface here would be a wider
 * surface to keep true.
 */

declare module 'bpmnlint/lib/linter' {
  interface LinterOptions {
    resolver: unknown;
    config?: unknown;
  }
  interface Report {
    id?: string;
    message: string;
    category?: string;
    path?: string[];
  }
  class Linter {
    constructor(options: LinterOptions);
    lint(root: unknown, config?: unknown): Promise<Record<string, Report[]>>;
  }
  export default Linter;
}

declare module 'bpmnlint/lib/resolver/static-resolver' {
  class StaticResolver {
    constructor(cache: Record<string, unknown>);
    resolveRule(pkg: string, ruleName: string): unknown;
    resolveConfig(pkg: string, configName: string): unknown;
  }
  export default StaticResolver;
}

/** Every rule module exports one factory: `(options?) => { check }`. */
declare module 'bpmnlint/rules/*' {
  const rule: (options?: unknown) => unknown;
  export default rule;
}
