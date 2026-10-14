/**
 * `docs/developer-guidelines.md` of the delivery package — release 3.0.13 (SD
 * review of 3.0.12, CR-D7).
 *
 * The file was one template per route, written into every package: BSEG, VBAK
 * and KNA1 as the standard tables, `ZCL_DEMO_RAP_BEHAVIOR` as the behaviour
 * class and "≥85 % code coverage" — for a program that reads none of those
 * tables, a package with no such class, and a threshold nobody set. It is now
 * written from the package and the engine's findings:
 *
 *   - the standard tables are the ones the engine found the program reading or
 *     writing, each with the successor SAP's catalog names and how sure that
 *     is (`sapReplacement`), or none;
 *   - the classes are the ones in the package (`src/*.clas.abap`), the
 *     behaviour pool and the test classes by their names;
 *   - no coverage threshold: Clean-Core.io sets none, the team does.
 *
 * Findings that could not be read are said, never filled in with an example.
 * Pure.
 */

import { BTP, BTP_FIRST } from './sap-naming';

/** The part of an engine finding the guidelines read (`/api/projects/{id}/evidence`). */
export interface GuidelineFinding {
  kind: string;
  objectName?: string;
  lineStart?: number;
  sapReplacement?: { objectName: string; objectType?: string; confidence?: string } | null;
}

export interface DeveloperGuidelinesInput {
  projectName: string;
  isAbapCloud: boolean;
  /** Every path in the package; `null` for the guide downloaded on its own, outside a package. */
  paths: readonly string[] | null;
  /** The engine's findings, or `null` when they could not be read. */
  findings: readonly GuidelineFinding[] | null;
  /** Why the findings could not be read, when they could not. */
  findingsUnread?: string | null;
}

const TABLE_KINDS = new Set(['standard-table-read', 'standard-table-write', 'table-access']);

const CONFIDENCE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  Verified: 'verified',
  'Catalog Match': 'name found in catalog',
  Candidate: 'candidate — check before use',
  'Needs Validation': 'needs validation',
});

/** The standard tables the engine found, one line each, with the successor and how sure it is. */
function tableLines(findings: readonly GuidelineFinding[]): string[] {
  const byTable = new Map<string, { kinds: Set<string>; lines: number[]; successor: string | null }>();
  for (const f of findings) {
    if (!TABLE_KINDS.has(f.kind) || !f.objectName) continue;
    const name = f.objectName.toUpperCase();
    if (/^[ZY]/.test(name)) continue;
    const row = byTable.get(name) ?? { kinds: new Set<string>(), lines: [], successor: null };
    row.kinds.add(f.kind === 'standard-table-write' ? 'writes' : 'reads');
    if (typeof f.lineStart === 'number') row.lines.push(f.lineStart);
    if (!row.successor && f.sapReplacement?.objectName) {
      const r = f.sapReplacement;
      row.successor = `${r.objectType && r.objectType !== 'Unknown' ? `${r.objectType} ` : ''}'${r.objectName}' (${CONFIDENCE_WORDS[r.confidence ?? ''] ?? 'check before use'})`;
    }
    byTable.set(name, row);
  }
  return [...byTable.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, r]) => {
      const lines = [...new Set(r.lines)].sort((a, b) => a - b);
      const at = lines.length ? ` (line${lines.length === 1 ? '' : 's'} ${lines.slice(0, 6).join(', ')}${lines.length > 6 ? ', …' : ''})` : '';
      return `   - ${name} — the program ${[...r.kinds].sort().join(' and ')} it${at} -> ${r.successor ?? 'no released successor named in the catalog; decide with the architect'}`;
    });
}

const className = (path: string) => (/(?:^|\/)([\w]+)\.clas\.abap$/i.exec(path)?.[1] ?? '').toUpperCase();

/** The guidelines file — see the file comment. */
export function developerGuidelinesMarkdown(input: DeveloperGuidelinesInput): string {
  if (!input.isAbapCloud) {
    return `# Side-by-Side Extensibility Guidelines - ${input.projectName}

## Overview
Side-by-Side Extensibility on ${BTP_FIRST} using CAP (Node.js/TypeScript). S/4HANA core remains decoupled.

## Development Rules
1. **Decoupled Architecture**: Direct DB access is blocked. Integrate via released OData APIs through SAP Destination service destinations on ${BTP}.
2. **Endpoint Security**: Secure every service endpoint with SAP XSUAA and enforce JWT verification. What the package wires today is listed in STATUS.md.
3. **Testing**: Mock ERP data for local development. Run the test suite before container packaging.
4. **CI/CD Quality Gates**: Run the GitHub Actions pipeline in .github/workflows on every PR.
5. **Containerization**: Build the container from the root Dockerfile once the open steps in STATUS.md are done; it is not approved for production.
`;
  }

  const paths = input.paths ?? [];
  const classes = [...new Set(paths.map(className).filter(Boolean))].sort();
  const pools = classes.filter((c) => c.startsWith('ZBP_'));
  const testClasses = [
    ...new Set([
      ...paths.filter((p) => /\.clas\.testclasses\.abap$/i.test(p)).map((p) => `${(/(?:^|\/)([\w]+)\.clas\.testclasses\.abap$/i.exec(p)?.[1] ?? '').toUpperCase()} (local test classes)`),
      ...classes.filter((c) => /TEST/.test(c)),
    ]),
  ].sort();
  const others = classes.filter((c) => !pools.includes(c) && !/TEST/.test(c));
  const noPackage = input.paths === null;

  const tables =
    input.findings === null
      ? [`   - The engine's findings could not be read${input.findingsUnread ? ` (${input.findingsUnread})` : ''}, so the tables the program uses are not listed here. Analyze lists them.`]
      : (() => {
          const t = tableLines(input.findings);
          return t.length ? t : ['   - The engine found no read or write of an SAP standard table in this program.'];
        })();

  const classLines = noPackage
    ? ["   - The class names are the delivery package's: its copy of this guide lists the behaviour pool and every class it carries."]
    : [
        pools.length ? `   - Behaviour pool${pools.length === 1 ? '' : 's'}: ${pools.join(', ')}.` : '   - The package carries no behaviour pool (ZBP_…) yet.',
        others.length ? `   - Further classes of the package: ${others.join(', ')}.` : '',
      ].filter(Boolean);
  const testing = noPackage
    ? "The package's copy of this guide names its ABAP Unit test classes."
    : testClasses.length
      ? `ABAP Unit tests of the package: ${testClasses.join(', ')}.`
      : 'The package carries no ABAP Unit test class yet.';

  return `# Developer Extensibility Guidelines - ${input.projectName}

## Overview
ABAP Cloud / Developer Extensibility model for S/4HANA. All code must align with SAP Clean Core. Written by Clean-Core.io from ${noPackage ? '' : 'this package and '}the engine's findings${noPackage ? '' : ' — the names below are the ones in the package'}.

## Development Rules
1. **No direct access to SAP standard tables**: ABAP Cloud blocks SELECT/INSERT/UPDATE on them.
2. **Released API Consumption**: The standard tables this program uses, and the successor the catalog names — check each against the target release before use:
${tables.join('\n')}
3. **RAP Service Tiering**:
${classLines.join('\n')}
   - Expose services via Service Definitions (SRVD) and Service Bindings (SRVB) using OData V4.
4. **Automated Testing**: ${testing} Clean-Core.io sets no coverage threshold — the team sets one and checks it in ADT.
5. **Linter Gate**: Run the local 'abaplint.json' check variant before releasing any transport.
`;
}
