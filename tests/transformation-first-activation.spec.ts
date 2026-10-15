import { test, expect } from '@playwright/test';
import { abapCheck } from '../lib/transformation/abap-check';
import { candidateFiles, guardContextOf, prepareEngineLed, type EngineLedPrepared } from '../lib/transformation/engine-led';
import { bodyGuards, findRegions, scaffoldDigest, spliceBodies } from '../lib/transformation/markers';
import { cloudPhrase } from '../lib/transformation/rap-contract';
import { SCAFFOLD_VERSION, type ScaffoldFile } from '../lib/transformation/types';
import { fixture, poDemo } from './helpers/transformation-scaffold';

/**
 * Scaffold version 11 — the first SAP activation and ABAP Unit run of an engine-led RAP package (SAP BTP ABAP
 * environment, abapGit, 15.10.2026). The package activated and ABAP Unit ran only after hand patches; each is a
 * scaffold fix here, so a freshly generated package needs none:
 *
 *   A. `PARAMETERS p_file TYPE rlgrap-filename` was carried as `TYPE rlgrap-filename` — "The use of Table RLGRAP is
 *      not permitted". A component of a table or structure the program does not declare is a built-in type.
 *   B. A body wrote `DATA lt_vbak TYPE STANDARD TABLE OF vbak` — "Type VBAK is unknown"; abaplint cannot see SAP's
 *      types. Each SAP table the access layer reads has a row type of the class, and such a body is refused.
 *   C. The ABAP Unit double was `INTERFACES … PARTIALLY IMPLEMENTED` with no method: every golden-master case died
 *      with CX_SY_DYN_CALL_ILLEGAL_METHOD at the first access call.
 *   D. The fill markers were ABAP Doc (`"! @cc-fill …`) inside methods: 71 activation warnings.
 *
 * Synthetic source only (never the owner's program). Server-free: abaplint runs in-process.
 */

const SOURCE = `REPORT zcc_first_activation.
TYPES: BEGIN OF ty_order,
         vbeln TYPE vbeln_va,
         erdat TYPE d,
         netwr TYPE p LENGTH 8 DECIMALS 2,
         name  TYPE kna1-name1,
       END OF ty_order.
DATA gt_orders TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY.
DATA gv_total TYPE p LENGTH 10 DECIMALS 2.
DATA gv_count TYPE i.
PARAMETERS p_file TYPE rlgrap-filename.
PARAMETERS p_vbeln TYPE vbak-vbeln.
PARAMETERS p_text TYPE bseg-sgtxt.
PARAMETERS p_vkorg TYPE vkorg.
SELECT-OPTIONS s_vkorg FOR p_vkorg.
SELECT-OPTIONS s_auart FOR vbak-auart.

START-OF-SELECTION.
  PERFORM read_orders.
  PERFORM sum_items.

FORM read_orders.
  SELECT vbeln erdat netwr FROM vbak INTO TABLE gt_orders WHERE vkorg IN s_vkorg AND auart IN s_auart.
  IF sy-subrc <> 0.
    MESSAGE 'No orders' TYPE 'S'.
  ENDIF.
ENDFORM.

FORM sum_items.
  DATA lt_vbap TYPE STANDARD TABLE OF vbap.
  DATA ls_vbap TYPE vbap.
  SELECT * FROM vbap INTO TABLE lt_vbap WHERE vbeln = p_vbeln.
  LOOP AT lt_vbap INTO ls_vbap.
    gv_total = gv_total + ls_vbap-netwr.
    gv_count = gv_count + 1.
  ENDLOOP.
ENDFORM.
`;

function prep(source: string): EngineLedPrepared {
  const p = prepareEngineLed({ source, track: 'rap', program: null, decisions: [], contextText: 'PLATFORM KNOWLEDGE (test)' });
  if (!p.ok) throw new Error(p.reason);
  return p;
}

const fileOf = (p: EngineLedPrepared, suffix: string) => p.scaffold.files.find((f) => f.path.endsWith(suffix))!.content;
const syntaxOf = (r: ReturnType<typeof abapCheck>) => JSON.stringify(r.ran && r.findings.filter((f) => f.kind === 'syntax' || f.kind === 'parser').slice(0, 5));

test('the scaffold version is at least 11', () => {
  // 12 (3.0.14): whole numbers are numbers on the Node track; this file's RAP text is unchanged.
  expect(SCAFFOLD_VERSION).toBeGreaterThanOrEqual(11);
  expect(prep(SOURCE).scaffold.version).toBe(SCAFFOLD_VERSION);
});

/* ------------------------------------------------------------------ A */

test.describe('A — a type ABAP Cloud does not release is a built-in type', () => {
  const p = prep(SOURCE);
  const logic = fileOf(p, '_logic.clas.abap');

  test('rlgrap-filename and the other SAP components: built-in types, each with a comment naming the original', () => {
    expect(logic).not.toMatch(/TYPE\s+(?:RANGE OF\s+)?(?:rlgrap|vbak|vbap|bseg|kna1)-/i);
    expect(logic).toContain('    TYPES p_file TYPE c LENGTH 128.');
    expect(logic).toContain('    DATA p_file TYPE c LENGTH 128.');
    expect(logic).toContain('" p_file: the original types it by rlgrap-filename, which ABAP Cloud does not release - a built-in type instead.');
    expect(logic).toContain('    DATA p_vbeln TYPE c LENGTH 10.');
    // Not in the curated list: a string.
    expect(logic).toContain('    DATA p_text TYPE string.');
    // A range of an SAP component: RANGE OF takes no `c LENGTH n`, so a range of string.
    expect(logic).toContain('    DATA s_auart TYPE RANGE OF string.');
    // A structure component of the program's own type.
    expect(logic).toMatch(/" name: the original types it by kna1-name1, which ABAP Cloud does not release - a built-in type instead\.\n\s+TYPES name TYPE c LENGTH 35\./);
    // Data elements by plain name stay: they activated in the trial.
    expect(logic).toContain('TYPES vbeln TYPE vbeln_va.');
    expect(logic).toContain('    DATA p_vkorg TYPE vkorg.');
    const r = abapCheck(p.scaffold.files);
    expect(r.ran && r.activation.activatable, syntaxOf(r)).toBe(true);
  });

  test("the custom entity's parameters stay consistent: the built-in length, abap.char( 255 ) for an unknown one", () => {
    const ce = fileOf(p, '_ce.ddls.asddls');
    expect(ce).toContain('p_file : abap.char( 128 )');
    expect(ce).toContain('p_vbeln : abap.char( 10 )');
    expect(ce).toContain('p_text : abap.char( 255 )');
    expect(ce).not.toMatch(/abap\.string/);
  });

  test('cloudPhrase: what it keeps and what it replaces', () => {
    const none = () => false;
    expect(cloudPhrase('TYPE rlgrap-filename', none)).toEqual({ phrase: 'TYPE c LENGTH 128', was: 'rlgrap-filename' });
    expect(cloudPhrase('TYPE RANGE OF vbak-vkorg', none)).toEqual({ phrase: 'TYPE RANGE OF string', was: 'vbak-vkorg' });
    expect(cloudPhrase('TYPE STANDARD TABLE OF vbak-vbeln WITH DEFAULT KEY', none).phrase).toBe('TYPE STANDARD TABLE OF string WITH DEFAULT KEY');
    expect(cloudPhrase('TYPE bseg-sgtxt', none).phrase).toBe('TYPE string');
    // Kept: the system fields, customer names, the program's own types, a plain data element.
    for (const kept of ['TYPE sy-datum', 'TYPE zsd_log-kunnr', 'TYPE /zns/tab-field', 'TYPE ty_order-vbeln', 'TYPE vbeln_va', 'TYPE c LENGTH 10']) {
      expect(cloudPhrase(kept, (h) => h === 'ty_order'), kept).toEqual({ phrase: kept, was: null });
    }
    // An SAP table the access layer reads, as a whole: its row type.
    const rows = new Map([['vbak', 'ty_vbak_row']]);
    expect(cloudPhrase('TYPE vbak', none, rows)).toEqual({ phrase: 'TYPE ty_vbak_row', was: 'vbak' });
    expect(cloudPhrase('TYPE STANDARD TABLE OF vbak WITH DEFAULT KEY', none, rows).phrase).toBe('TYPE STANDARD TABLE OF ty_vbak_row WITH DEFAULT KEY');
    expect(cloudPhrase('TYPE kna1', none, rows).was).toBeNull();
  });

  test('the PO demo: p_banfn TYPE eban-banfn is carried as c LENGTH 10, and the package still activates', () => {
    const po = prep(poDemo());
    const cls = fileOf(po, '_logic.clas.abap');
    expect(cls).not.toMatch(/TYPE\s+eban-/i);
    expect(cls).toContain('DATA p_banfn TYPE c LENGTH 10.');
    const r = abapCheck(po.scaffold.files);
    expect(r.ran && r.activation.activatable, syntaxOf(r)).toBe(true);
  });
});

/* ------------------------------------------------------------------ B */

test.describe('B — data typed by an SAP table: a row type of the class, and a body typing by the table is refused', () => {
  const p = prep(SOURCE);
  const logic = fileOf(p, '_logic.clas.abap');
  // The two short FORMs fold into the orchestrator: one body reads both tables.
  const unit = p.plan.units.find((u) => u.kind === 'orchestrator')!;

  test('ty_vbak_row from the fields the SELECT names, typed by the structure it reads into', () => {
    expect(logic).toContain("    \" ty_vbak_row: a row of VBAK with the fields the original uses - ABAP Cloud has no type VBAK.\n    TYPES BEGIN OF ty_vbak_row.");
    const row = logic.slice(logic.indexOf('TYPES BEGIN OF ty_vbak_row.'), logic.indexOf('TYPES END OF ty_vbak_row.'));
    expect(row).toContain('TYPES vbeln TYPE vbeln_va.');
    expect(row).toContain('TYPES erdat TYPE d.');
    expect(row).toContain('TYPES netwr TYPE p LENGTH 8 DECIMALS 2.');
    // `FOR vbak-auart`: a field the original names, typed from the curated list.
    expect(row).toContain('TYPES auart TYPE c LENGTH 4.');
    // VBAP is read with SELECT *: its row holds the fields the original uses of it (ls_vbap-netwr).
    const vbap = logic.slice(logic.indexOf('TYPES BEGIN OF ty_vbap_row.'), logic.indexOf('TYPES END OF ty_vbap_row.'));
    expect(vbap).toContain('TYPES netwr TYPE p LENGTH 8 DECIMALS 2.');
    // …and the field its WHERE compares.
    expect(vbap).toContain('TYPES vbeln TYPE c LENGTH 10.');
    // The fill request names them.
    expect(p.scaffold.rap!.unitTypes[unit.id]).toContain('TYPES BEGIN OF ty_vbak_row.');
    expect(p.scaffold.rap!.unitTypes[unit.id]).toContain('TYPES BEGIN OF ty_vbap_row.');
    expect(p.scaffold.rap!.regions[unit.id].sapTypes).toEqual({ vbak: 'ty_vbak_row', vbap: 'ty_vbap_row' });
  });

  test("the run's body shape is refused, naming the row type; the row type passes and activates", () => {
    const ctx = guardContextOf(p, unit.id);
    const refused = bodyGuards('DATA: lt_vbak TYPE STANDARD TABLE OF vbak,\n      lt_vbap TYPE STANDARD TABLE OF vbap.\nmo_access->read_vbak( CHANGING ct_rows = lt_vbak ).', ctx).find((r) => r.code === 'sap-type');
    expect(refused?.message).toContain('VBAK (use ty_vbak_row, the row type of the logic class: DATA lt_rows TYPE STANDARD TABLE OF ty_vbak_row WITH EMPTY KEY, read with mo_access->read_vbak( CHANGING ct_rows = lt_rows )');
    expect(refused?.message).toContain('VBAP (use ty_vbap_row');
    for (const typed of ['DATA ls_x TYPE vbak.', 'DATA lv_x TYPE vbak-vbeln.', 'DATA lt_x TYPE SORTED TABLE OF vbap WITH UNIQUE KEY vbeln posnr.', 'DATA ls_x TYPE LINE OF vbak.']) {
      expect(bodyGuards(typed, ctx).map((r) => r.code), typed).toContain('sap-type');
    }
    const body = [
      'DATA lt_vbak TYPE STANDARD TABLE OF ty_vbak_row WITH EMPTY KEY.',
      'mo_access->read_vbak( CHANGING ct_rows = lt_vbak ).',
      'gt_orders = CORRESPONDING #( lt_vbak ).',
      'IF gt_orders IS INITIAL.',
      "  APPEND 'No orders' TO mt_messages.",
      'ENDIF.',
    ].join('\n');
    expect(bodyGuards(body, ctx)).toEqual([]);
    const r = abapCheck(candidateFiles(p, new Map([[unit.id, body]])));
    expect(r.ran && r.activation.activatable, syntaxOf(r)).toBe(true);
  });

  test('a customer table is not an SAP table: its own structure, as in scaffold version 9', () => {
    const po = prep(poDemo());
    const regions = Object.values(po.scaffold.rap!.regions);
    for (const r of regions) for (const t of Object.keys(r.sapTypes ?? {})) expect(t).not.toMatch(/^z/);
    expect(fileOf(po, '_logic.clas.abap')).toContain('TYPES BEGIN OF zmm_po_appr.');
  });
});

/* ------------------------------------------------------------------ C */

test.describe('C — the ABAP Unit double implements every method of the access interface', () => {
  for (const [name, source] of [
    ['synthetic', SOURCE],
    ['PO demo', poDemo()],
    ['CO shape', fixture('co-shape')],
  ] as const) {
    test(`${name}: a METHOD for every METHODS, none PARTIALLY IMPLEMENTED`, () => {
      const p = prep(source);
      const intf = p.scaffold.files.find((f) => /zif_\w+_access\.intf\.abap$/.test(f.path))!;
      const accessIf = intf.path.split('/').pop()!.replace(/\.intf\.abap$/, '');
      const declared = [...intf.content.matchAll(/^\s*METHODS (\w+)/gm)].map((m) => m[1]);
      expect(declared.length).toBeGreaterThan(0);
      const tests = fileOf(p, '.testclasses.abap');
      expect(tests).not.toContain('PARTIALLY IMPLEMENTED');
      const double = tests.slice(tests.indexOf('CLASS ltd_access IMPLEMENTATION.'), tests.indexOf('ENDCLASS.', tests.indexOf('CLASS ltd_access IMPLEMENTATION.')));
      const implemented = [...double.matchAll(/^\s*METHOD (\w+)~(\w+)\./gm)].map((m) => {
        expect(m[1]).toBe(accessIf);
        return m[2];
      });
      expect(implemented).toEqual(declared);
      const r = abapCheck(p.scaffold.files);
      expect(r.ran && r.activation.activatable, syntaxOf(r)).toBe(true);
    });
  }
});

/* ------------------------------------------------------------------ D */

/** Every line between METHOD and ENDMETHOD of an ABAP file that is ABAP Doc (`"!`). */
function abapDocInMethods(files: readonly ScaffoldFile[]): string[] {
  const out: string[] = [];
  for (const f of files.filter((x) => x.path.endsWith('.abap'))) {
    let inside = false;
    f.content.split('\n').forEach((line, i) => {
      if (/^\s*METHOD\s/i.test(line)) inside = true;
      else if (/^\s*ENDMETHOD\./i.test(line)) inside = false;
      else if (inside && /^\s*"!/.test(line)) out.push(`${f.path}:${i + 1}: ${line.trim()}`);
    });
  }
  return out;
}

test.describe('D — the fill markers are plain comments; the reader takes both forms', () => {
  for (const [name, source] of [
    ['synthetic', SOURCE],
    ['PO demo', poDemo()],
    ['SD shape', fixture('sd-shape')],
  ] as const) {
    test(`${name}: no ABAP Doc inside a method`, () => {
      const p = prep(source);
      expect(p.scaffold.regions.length).toBeGreaterThan(0);
      expect(abapDocInMethods(p.scaffold.files)).toEqual([]);
      const logic = fileOf(p, '_logic.clas.abap');
      expect(logic).toMatch(/^ {4}" @cc-fill BEGIN U\d+ [0-9a-f]{8}$/m);
      expect(logic).not.toContain('"! @cc-fill');
    });
  }

  test('a package stored before version 11 ("! markers) keeps its regions, its digest and its splice', () => {
    const p = prep(fixture('co-shape'));
    const old = p.scaffold.files.map((f) => ({ ...f, content: f.content.replace(/^(\s*)" @cc-fill /gm, '$1"! @cc-fill ') }));
    expect(old.some((f) => f.content.includes('"! @cc-fill BEGIN'))).toBe(true);
    const strip = (rs: ReturnType<typeof findRegions>) => rs.map((r) => ({ id: r.regionId, hash: r.hash, stub: r.stub, file: r.file }));
    expect(strip(findRegions(old))).toEqual(strip(findRegions(p.scaffold.files)));
    // Its digest is its own (the marker lines are engine text), and a splice into it holds against it.
    const digest = scaffoldDigest(old);
    const region = p.scaffold.regions[0];
    const spliced = spliceBodies({ files: old, digest, track: 'rap' }, [{ regionId: region.regionId, body: 'RETURN.' }], () => null);
    expect(spliced.ok).toBe(true);
    expect(spliced.applied).toEqual([region.regionId]);
    expect(spliced.files.find((f) => f.path === region.file)!.content).toContain('"! @cc-fill END');
    // The new form round-trips the same way.
    const fresh = spliceBodies(p.scaffold, [{ regionId: region.regionId, body: 'RETURN.' }], () => null);
    expect(fresh.ok).toBe(true);
    expect(findRegions(fresh.files).map((r) => r.regionId)).toEqual(p.scaffold.regions.map((r) => r.regionId));
  });
});
