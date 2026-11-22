/**
 * Engine 4.0, L4: the reference table read against what we know (ADR-133 (2); docs/design/engine4.md,
 * "L4: graded references"). Every reference the source does not define gets SAP's facts from `lib/knowledge/`:
 * listed or not, release state, classification state, object type, successors, and whether SAP released the class,
 * interface, CDS view or lists the function module as a classic API. From those facts one plain `standing`:
 *
 *   - `customer`   — a `Z…`/`Y…` name: SAP's files never apply;
 *   - `released`   — SAP released it for ABAP Cloud;
 *   - `classicApi` — SAP classifies it as a classic API (usable on-premise and in Private Edition, not in ABAP Cloud);
 *   - `notReleased`— SAP lists it, neither released nor a classic API (`notToBeReleased`, `deprecated`, `noAPI`, …);
 *   - `unlisted`   — an SAP-looking name neither file holds;
 *   - `unknown`    — a namespaced name neither file holds, or a dynamic name that stays open.
 *
 * No A–D letter: the level is a rule of the readings on top of these facts (`lib/abap/abcd-classification.ts`),
 * and it stays out of anything signed. Pure and inert: imports only `./` and `../knowledge/`.
 */
import {
  isReleasedClass, isReleasedInterface, isSapFunctionModule, isSapTypeGroup, releasedCdsView, sapFacts, typeGroupOf, type SapFacts,
} from '../knowledge/index';
import type { Reference, ReferenceKind, ReferenceTable } from './references';

export type Standing = 'customer' | 'released' | 'classicApi' | 'notReleased' | 'unlisted' | 'unknown';

export interface GradedReference extends Reference {
  /** SAP's facts about the name; null for a dynamic name that stays open. */
  facts: SapFacts | null;
  standing: Standing;
  /** For a `type` named `<group>_<x>`: the SAP type group it belongs to. */
  typeGroup?: string;
}

const CLASSIC = new Set(['classicAPI']);

function standingOf(kind: ReferenceKind, facts: SapFacts): Standing {
  if (facts.isCustomerObject) return 'customer';
  const name = facts.name;
  const released =
    facts.releaseState === 'released' ||
    ((kind === 'class' || kind === 'classOrInterface' || kind === 'exception') && isReleasedClass(name)) ||
    ((kind === 'interface' || kind === 'classOrInterface') && isReleasedInterface(name)) ||
    (kind === 'table' && releasedCdsView(name) !== null);
  if (released) return 'released';
  // The release state decides before the classification (SAP lists CL_HTTP_CLIENT as `classicAPI` and as
  // `notToBeReleased` with a successor): the same precedence as the shipping level rule.
  if (facts.releaseState) return 'notReleased';
  if (CLASSIC.has(facts.classificationState ?? '') || (kind === 'functionModule' && isSapFunctionModule(name))) return 'classicApi';
  if (facts.listed) return 'notReleased';
  return facts.isSapObject ? 'unlisted' : 'unknown';
}

/** Kinds whose names are repository objects SAP's files can list. */
const CATALOG_KINDS = new Set<ReferenceKind>(['class', 'interface', 'classOrInterface', 'exception', 'type', 'table', 'functionModule']);

/** Every reference of the table with its facts and standing; references the source defines are left out. */
export function gradeReferences(table: ReferenceTable): GradedReference[] {
  const out: GradedReference[] = [];
  for (const r of table.references) {
    if (r.defined) continue;
    if (!r.name) { out.push({ ...r, facts: null, standing: 'unknown' }); continue; }
    if (r.kind === 'typePool') {
      const facts = sapFacts(r.name);
      // A type group is no object of SAP's two files; the curated list only says it is SAP's.
      const standing: Standing = facts.isCustomerObject ? 'customer' : facts.listed ? standingOf('type', facts) : 'unlisted';
      out.push({ ...r, facts, standing, ...(isSapTypeGroup(r.name) ? { typeGroup: r.name } : {}) });
      continue;
    }
    if (!CATALOG_KINDS.has(r.kind)) {
      const facts = sapFacts(r.name);
      out.push({ ...r, facts, standing: facts.isCustomerObject ? 'customer' : 'unknown' });
      continue;
    }
    const facts = sapFacts(r.name);
    const group = r.kind === 'type' ? typeGroupOf(r.name) : null;
    out.push({ ...r, facts, standing: standingOf(r.kind, facts), ...(group ? { typeGroup: group } : {}) });
  }
  return out;
}

/** Per kind and standing: how many references — the countable claim a reading reports from. */
export function standingCounts(graded: readonly GradedReference[]): Record<string, Record<Standing, number>> {
  const out: Record<string, Record<Standing, number>> = {};
  for (const g of graded) {
    const row = (out[g.kind] ??= { customer: 0, released: 0, classicApi: 0, notReleased: 0, unlisted: 0, unknown: 0 });
    row[g.standing] += 1;
  }
  return out;
}
