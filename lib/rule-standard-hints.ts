import { SAP_SCOPE_ITEMS } from './sap-scope-items';
import { CURATED_SCOPE_ITEM_LIST } from './sap-curated-lists';

/**
 * Where a business rule may be met by SAP standard — roadmap 3.0.20, owner
 * decision 21.10.2026 (6): the hint comes from the curated scope items, not
 * from a list of functions written into the rule engine.
 *
 * The scope items are the two lists model output is checked against
 * (`lib/sap-reference-check.ts`): SAP's scope items with the public SAP
 * page that states each (`lib/sap-scope-items.ts`) and the owner's hand-curated
 * list (`lib/sap-curated-lists.ts`). This file adds no scope item and no title.
 * What it adds is which field a rule tests that one of those scope items is
 * about — and it is deliberately short: a hint is offered only where the field
 * names the function the scope item carries (a release indicator of a
 * requisition, a payment block, a delivery or billing block of a sales order).
 *
 * Three rules hold it honest:
 *
 *   - **Only curated entries.** A row whose scope item is in neither list gives
 *     no hint (`curatedHintRows` drops it, and a guard checks every row).
 *   - **Worded as a check.** "may cover … check whether it meets the need" —
 *     never "SAP standard does this".
 *   - **None when nothing curated matches.** A credit status, the blocks of a
 *     business partner or payment terms have no curated scope item today, so
 *     they get no hint; the rule engine then proposes what the code itself
 *     suggests.
 *
 * Pure, no I/O. Imports only the two import-free lists.
 */

export interface RuleStandardHint {
  /** The scope item ID, as the list holds it. */
  id: string;
  /** Its title, exactly as the list writes it. */
  title: string;
  /** Where the title was read — the SAP page, or the curated list. */
  source: string;
  /** The sentence for the rule's proposal. */
  text: string;
}

interface HintRow {
  /** Field stems (`lib/abap/business-rule-set-explain.ts` `fieldStem`) the scope item is about. */
  stems: RegExp;
  /** The scope item, by ID — its title is read from the lists, never written here. */
  scopeItem: string;
  /** What the field is, in words, for the sentence. */
  what: string;
}

const ROWS: readonly HintRow[] = Object.freeze([
  { stems: /^(?:frgkz|frggr|frgst|frgzu|frgrl|release_group|release_strategy)$/, scopeItem: '18J', what: 'the release of purchase requisitions' },
  { stems: /^(?:zlspr)$/, scopeItem: 'J60', what: 'the payment block of a supplier invoice' },
  { stems: /^(?:lifsk)$/, scopeItem: 'BD9', what: 'the delivery block of a sales order' },
  { stems: /^(?:faksk)$/, scopeItem: 'BD9', what: 'the billing block of a sales order' },
]);

/** The scope item as one of the two lists holds it, SAP's page first; null when neither does. */
export function curatedScopeItem(id: string): { id: string; title: string; source: string } | null {
  const sap = SAP_SCOPE_ITEMS.find((s) => s.id === id);
  if (sap) return { id: sap.id, title: sap.title, source: sap.source.label };
  const curated = CURATED_SCOPE_ITEM_LIST.entries.find((e) => e.id === id && !e.deprecated);
  if (curated) return { id: curated.id, title: curated.title, source: CURATED_SCOPE_ITEM_LIST.label };
  return null;
}

/** The rows whose scope item is curated — every other row is left out, whatever it says. */
export function curatedHintRows(rows: readonly HintRow[] = ROWS): Array<HintRow & { item: { id: string; title: string; source: string } }> {
  return rows.flatMap((row) => {
    const item = curatedScopeItem(row.scopeItem);
    return item ? [{ ...row, item }] : [];
  });
}

const CURATED_ROWS = curatedHintRows();

/** Every row the table holds, for the guard that checks each is curated. */
export const RULE_STANDARD_HINT_ROWS: readonly HintRow[] = ROWS;

/**
 * The hint for a rule on these field stems, or null. The first field with a
 * curated scope item wins; a field with none gives none.
 */
export function ruleStandardHint(stems: readonly string[]): RuleStandardHint | null {
  for (const row of CURATED_ROWS) {
    if (!stems.some((s) => row.stems.test(s))) continue;
    const { id, title, source } = row.item;
    return {
      id,
      title,
      source,
      text: `SAP standard has a scope item for ${row.what} that may cover this: ${id} “${title}”. Check whether it meets the need before the rule is rebuilt.`,
    };
  }
  return null;
}
