import { test, expect } from '@playwright/test';
import { absentClaims, capabilityPresence, isAbsent } from '../lib/documentation-capabilities';
import { capabilityFactsOf } from '../lib/documentation-facts';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { sopFactsBlock } from '../lib/business-sop-prompt';

/**
 * "What the program does not do" is only said where the analysis can exclude
 * it. A read whose table, or a call whose function, the code names only at
 * run time could be a ledger table, a credit total, a workflow or a send
 * function — so the capability is not determined, and no absence sentence is
 * written. A possible target the source shows for such a read counts as the
 * program possibly doing it. Server-free.
 */

const factsOf = (source: string) => capabilityFactsOf(source, buildProcessSkeleton(source));
const LEDGER_ABSENT = 'It does not reconcile against the general ledger';

const DYNAMIC_READ = `REPORT zdyn_read.
PARAMETERS p_bukrs TYPE bukrs.
DATA lv_tab TYPE tabname.
DATA lt_data TYPE STANDARD TABLE OF bsid.
lv_tab = p_bukrs.
SELECT * FROM (lv_tab) INTO TABLE lt_data WHERE bukrs = p_bukrs.
`;

const POSSIBLE_LEDGER = `REPORT zdyn_acdoca.
PARAMETERS p_tab TYPE tabname DEFAULT 'ACDOCA'.
DATA lt_data TYPE STANDARD TABLE OF bsid.
SELECT * FROM (p_tab) INTO TABLE lt_data.
`;

const DYNAMIC_CALL = `REPORT zdyn_fm.
PARAMETERS p_fm TYPE rs38l_fnam.
DATA lv_fm TYPE rs38l_fnam.
lv_fm = p_fm.
CALL FUNCTION lv_fm.
`;

const STATIC_ONLY = `REPORT zstatic.
PARAMETERS p_bukrs TYPE bukrs.
DATA lt_items TYPE STANDARD TABLE OF bsid.
SELECT * FROM bsid INTO TABLE lt_items WHERE bukrs = p_bukrs.
CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' TABLES t_outtab = lt_items.
`;

test.describe('a capability is undetermined while run-time names are unresolved', () => {
  test('a SELECT from a variable leaves the ledger and credit exposure undetermined, with no absence sentence', () => {
    const facts = factsOf(DYNAMIC_READ);
    expect(facts.reads.map((r) => r.name)).not.toContain('ACDOCA');
    expect(facts.dynamicReads).toEqual([{ name: 'LV_TAB', line: 6 }]);
    const presence = capabilityPresence(facts);
    expect(presence.ledger.present).toBe(false);
    expect(presence.ledger.determined).toBe(false);
    expect(isAbsent(presence.ledger)).toBe(false);
    expect(presence['credit-exposure'].determined).toBe(false);
    expect(absentClaims('The totals are reconciled against the general ledger.', facts)).toEqual([]);
    expect(sopFactsBlock(facts)).not.toContain(LEDGER_ABSENT);
    // No dynamic call: a call-only capability stays determined.
    expect(presence.mail.determined).toBe(true);
    // Facts stored before dynamic reads were recorded fall back to the dynamic count.
    const { dynamicReads: _dr, possibleReads: _pr, ...stored } = facts;
    void _dr; void _pr;
    expect(capabilityPresence(stored).ledger.determined).toBe(false);
  });

  test('a run-time table whose possible target is ACDOCA counts the ledger as present', () => {
    const facts = factsOf(POSSIBLE_LEDGER);
    expect(facts.reads.map((r) => r.name)).not.toContain('ACDOCA');
    expect(facts.possibleReads?.map((r) => r.name)).toContain('ACDOCA');
    const ledger = capabilityPresence(facts).ledger;
    expect(ledger.present).toBe(true);
    expect(ledger.evidence.map((e) => e.name)).toContain('ACDOCA');
    expect(absentClaims('The totals are reconciled against the general ledger.', facts)).toEqual([]);
  });

  test('a function module named at run time leaves every call-based capability undetermined', () => {
    const facts = factsOf(DYNAMIC_CALL);
    const presence = capabilityPresence(facts);
    for (const cap of ['ledger', 'credit-exposure', 'approval', 'mail', 'audit-log', 'posting'] as const) {
      expect(presence[cap].determined, cap).toBe(false);
    }
    // A DESTINATION is written in the statement: no destination, no other system.
    expect(isAbsent(presence.remote)).toBe(true);
    expect(absentClaims('The manager approves and the customer is e-mailed.', facts)).toEqual([]);
    expect(sopFactsBlock(facts)).not.toContain(LEDGER_ABSENT);
  });

  test('a dynamic call with a DESTINATION is a call into another system', () => {
    const facts = factsOf(`REPORT zdyn_rfc.
PARAMETERS p_fm TYPE rs38l_fnam.
CALL FUNCTION p_fm DESTINATION 'ERP_PRD'.
`);
    expect(capabilityPresence(facts).remote.present).toBe(true);
  });

  test('a program with only static reads and calls still says it does not reconcile against the ledger', () => {
    const facts = factsOf(STATIC_ONLY);
    expect(facts.dynamic).toBe(0);
    const presence = capabilityPresence(facts);
    for (const cap of ['ledger', 'credit-exposure', 'approval', 'mail', 'remote', 'posting'] as const) {
      expect(isAbsent(presence[cap]), cap).toBe(true);
    }
    expect(absentClaims('The totals are reconciled against the general ledger.', facts).map((c) => c.capability)).toEqual(['ledger']);
    expect(sopFactsBlock(facts)).toContain(LEDGER_ABSENT);
  });
});
