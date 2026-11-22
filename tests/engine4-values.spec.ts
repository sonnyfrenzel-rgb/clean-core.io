import { test, expect } from '@playwright/test';
import { readSource } from '../lib/engine4/index';
import { references, type Reference } from '../lib/engine4/references';
import { certainty, valueAt, valueContext, type ValueResolution } from '../lib/engine4/values';
import { runValueShadow } from '../scripts/engine4/shadow-values';
import { shadowCorpus } from '../scripts/engine4/shadow';

/**
 * Engine 4.0, L4: which values a name can hold (`lib/engine4/values.ts`; engine review of 22.11.2026, A1–A3).
 * Inert (ADR-125). The answer is one value only where the source proves it. The metamorphic specs below change a
 * program so that it can only reach more values — routines reordered, a write wrapped in IF or DO, another call
 * site, another write in another routine — and require that no answer becomes more certain or a different single
 * value. Server-free.
 */
const dyn = (src: string) => {
  const r = readSource(src);
  return references(r.statements, r.tree).references.filter((x) => x.via && x.resolution !== 'declaredType');
};
const at = (src: string, row: number) => dyn(src).find((r) => r.row === row)!;
const short = (r: Reference) => `${r.name ?? 'open'} ${r.resolution}${r.candidates ? ` [${r.candidates.join(',')}]` : ''}`;

test.describe('A1: a name is resolved only within its scope', () => {
  test('a constant of one FORM does not resolve the same name in another FORM', () => {
    const src = [
      'REPORT z.', 'FORM shadow.', "  CONSTANTS lv_t TYPE tabname VALUE 'VBAK'.", '  SELECT * FROM (lv_t) INTO TABLE @DATA(a).', 'ENDFORM.',
      'FORM other USING p TYPE tabname.', '  DATA lv_t TYPE tabname.', '  lv_t = p.', '  DELETE FROM (lv_t).', 'ENDFORM.',
    ].join('\n');
    expect(short(at(src, 4))).toBe('VBAK constant');
    expect(short(at(src, 9))).toBe('open dynamic []');
    expect(at(src, 9).scope).toBe('routine:form OTHER#2');
  });

  test('a local variable is not the global of the same name', () => {
    const src = ['REPORT z.', 'DATA lv_fm TYPE funcname.', 'START-OF-SELECTION.', "  lv_fm = 'Z_GLOBAL'.", '  PERFORM f.', 'FORM f.', '  DATA lv_fm TYPE funcname.', '  CALL FUNCTION lv_fm.', 'ENDFORM.'].join('\n');
    expect(short(at(src, 8))).toBe('open dynamic []');
  });

  test('a class attribute is the class\'s: a write in another class does not count', () => {
    const src = [
      'CLASS a DEFINITION.', '  PUBLIC SECTION.', "    CONSTANTS c_fm TYPE funcname VALUE 'Z_A'.", '    METHODS run.', 'ENDCLASS.',
      'CLASS a IMPLEMENTATION.', '  METHOD run.', '    CALL FUNCTION c_fm.', '  ENDMETHOD.', 'ENDCLASS.',
      'CLASS b DEFINITION.', '  PUBLIC SECTION.', "    CONSTANTS c_fm TYPE funcname VALUE 'Z_B'.", '    METHODS run.', 'ENDCLASS.',
      'CLASS b IMPLEMENTATION.', '  METHOD run.', '    CALL FUNCTION c_fm.', '  ENDMETHOD.', 'ENDCLASS.',
    ].join('\n');
    expect(short(at(src, 8))).toBe('Z_A constant');
    expect(short(at(src, 18))).toBe('Z_B constant');
  });
});

test.describe('A2: loops', () => {
  test('a write inside a loop after the use makes the use open, with both values', () => {
    const src = ['REPORT z.', 'DATA lv_tab TYPE tabname.', "lv_tab = 'MARA'.", 'DO 2 TIMES.', '  SELECT COUNT(*) FROM (lv_tab).', "  lv_tab = 'BSEG'.", 'ENDDO.'].join('\n');
    expect(short(at(src, 5))).toBe('open dynamic [MARA,BSEG]');
  });

  test('a write before the use in the same iteration still decides it', () => {
    const src = ['REPORT z.', 'DATA lv_tab TYPE tabname.', 'DO 2 TIMES.', "  lv_tab = 'MARA'.", '  SELECT COUNT(*) FROM (lv_tab).', "  lv_tab = 'BSEG'.", 'ENDDO.'].join('\n');
    expect(short(at(src, 5))).toBe('MARA assigned');
  });

  test('for a global, a call inside the loop around the use opens it', () => {
    const src = ['REPORT z.', 'DATA lv_fm TYPE funcname.', "lv_fm = 'Z_A'.", 'DO 2 TIMES.', '  CALL FUNCTION lv_fm.', '  PERFORM f.', 'ENDDO.', 'FORM f.', "  lv_fm = 'Z_B'.", 'ENDFORM.'].join('\n');
    expect(short(at(src, 5))).toBe('open dynamic [Z_A,Z_B]');
  });
});

test.describe('A3: across routines', () => {
  test('a global written before two PERFORMs is open in the FORM, not the last write', () => {
    const src = ['REPORT z.', 'DATA lv_fm TYPE funcname.', "lv_fm = 'Z_HARMLESS_READ'.", 'PERFORM call_it.', "lv_fm = 'BAPI_ACC_DOCUMENT_POST'.", 'PERFORM call_it.', 'FORM call_it.', '  CALL FUNCTION lv_fm.', 'ENDFORM.'].join('\n');
    expect(short(at(src, 8))).toBe('open dynamic [Z_HARMLESS_READ,BAPI_ACC_DOCUMENT_POST]');
  });

  test('a call between write and use opens a global, not a local', () => {
    const global = ['REPORT z.', 'DATA g TYPE funcname.', 'START-OF-SELECTION.', "  g = 'Z_A'.", '  PERFORM f.', '  CALL FUNCTION g.', 'FORM f.', "  g = 'Z_B'.", 'ENDFORM.'].join('\n');
    expect(short(at(global, 6))).toBe('open dynamic [Z_A,Z_B]');
    const local = ['FORM g.', '  DATA l TYPE funcname.', "  l = 'Z_A'.", '  PERFORM f.', '  CALL FUNCTION l.', 'ENDFORM.', 'FORM f.', 'ENDFORM.'].join('\n');
    expect(short(at(local, 5))).toBe('Z_A assigned');
  });

  test('a write in another event block is no straight path', () => {
    const src = ['REPORT z.', 'DATA g TYPE funcname.', 'INITIALIZATION.', "  g = 'Z_A'.", 'START-OF-SELECTION.', '  CALL FUNCTION g.', 'AT SELECTION-SCREEN.', "  g = 'Z_B'."].join('\n');
    expect(short(at(src, 6))).toBe('open dynamic [Z_A,Z_B]');
  });
});

test.describe('FORM parameters are closed over every call site', () => {
  const form = (sites: string[]) => ['REPORT z.', 'START-OF-SELECTION.', ...sites, 'FORM upd USING p_tab TYPE tabname.', '  UPDATE (p_tab) SET flag = 1.', 'ENDFORM.'].join('\n');
  test('one value at every site', () => {
    const src = form(["  PERFORM upd USING 'MARC'.", "  PERFORM upd USING 'MARC'."]);
    const r = at(src, 6);
    expect(short(r)).toBe('MARC parameter');
    expect(r.provenance?.map((p) => `${p.how}@${p.row}=${p.value}`)).toEqual(['callSite@3=MARC', 'callSite@4=MARC']);
  });
  test('values that differ stay open with both', () => {
    expect(short(at(form(["  PERFORM upd USING 'MARC'.", "  PERFORM upd USING 'ZSTOCK'."]), 6))).toBe('open dynamic [MARC,ZSTOCK]');
  });
  test('a constant passed in is resolved at its call site', () => {
    const src = ['REPORT z.', "CONSTANTS gc TYPE tabname VALUE 'MARD'.", 'START-OF-SELECTION.', '  PERFORM upd USING gc.', 'FORM upd USING p_tab TYPE tabname.', '  UPDATE (p_tab) SET flag = 1.', 'ENDFORM.'].join('\n');
    expect(short(at(src, 6))).toBe('MARD parameter');
  });
  test('no call site, or a site the reading cannot see into, stays open', () => {
    expect(short(at(form([]), 4))).toBe('open dynamic []');
    expect(short(at(form(["  PERFORM upd USING 'MARC'.", '  PERFORM upd IN PROGRAM zother USING lv.']), 6))).toBe('open dynamic [MARC]');
    expect(short(at(form(["  PERFORM upd USING 'MARC'.", '  PERFORM (lv_form) IN PROGRAM zother.']), 6))).toBe('open dynamic [MARC]');
  });
});

// ---- Metamorphic soundness ----

/** A small random report: globals, a START-OF-SELECTION, FORMs with a parameter and a local; every use tagged. */
function program(seed: number): string[] {
  let s = seed;
  const rnd = (n: number) => (((s = (s * 1103515245 + 12345) & 0x7fffffff) >>> 16) % n);
  let tag = 0;
  const forms = 2 + rnd(2);
  const lits = ['A', 'B', 'C'];
  const stmt = (inForm: boolean, depth: number): string[] => {
    const vars = inForm ? ['g1', 'g2', 'l', 'p'] : ['g1', 'g2'];
    const v = vars[rnd(vars.length)];
    switch (rnd(depth > 1 ? 4 : 6)) {
      case 0: return [`${v === 'p' ? 'l' : v} = 'Z_${lits[rnd(3)]}'.`];
      case 1: return [`CALL FUNCTION ${v} EXPORTING tag = ${++tag}.`];
      case 2: return [`PERFORM f${rnd(forms)} USING 'Z_${lits[rnd(3)]}'.`];
      case 3: return [`PERFORM f${rnd(forms)} USING ${inForm ? vars[rnd(vars.length)] : 'g1'}.`];
      case 4: return ['IF x = 1.', ...stmt(inForm, depth + 1), 'ENDIF.'];
      default: return ['DO 2 TIMES.', ...stmt(inForm, depth + 1), ...stmt(inForm, depth + 1), 'ENDDO.'];
    }
  };
  const out = ['REPORT z.', 'DATA g1 TYPE funcname.', "DATA g2 TYPE funcname VALUE 'Z_G'.", 'START-OF-SELECTION.'];
  for (let k = 0; k < 3 + rnd(5); k++) out.push(...stmt(false, 0));
  for (let f = 0; f < forms; f++) {
    out.push(`FORM f${f} USING p TYPE funcname.`, '  DATA l TYPE funcname.');
    for (let k = 0; k < 1 + rnd(4); k++) out.push(...stmt(true, 0));
    out.push('ENDFORM.');
  }
  return out;
}

const answers = (lines: string[]) => {
  const out = new Map<string, { name: string | null; resolution: ValueResolution }>();
  for (const r of dyn(lines.join('\n'))) {
    const m = /tag = (\d+)/.exec(lines[r.row - 1]);
    if (m) out.set(m[1], { name: r.name, resolution: r.resolution as ValueResolution });
  }
  return out;
};

/** The transformations: each one can only add paths, never remove one. */
const TRANSFORMS: Record<string, (lines: string[], rnd: (n: number) => number) => string[] | null> = {
  'reorder routines': (lines) => {
    const start = lines.findIndex((l) => l.startsWith('FORM '));
    const forms: string[][] = [];
    for (let i = start; i < lines.length; i++) {
      if (lines[i].startsWith('FORM ')) forms.push([lines[i]]);
      else forms[forms.length - 1].push(lines[i]);
    }
    return [...lines.slice(0, start), ...forms.reverse().flat()];
  },
  'wrap a write in IF': (lines, rnd) => {
    const writes = lines.map((l, i) => (/^\s*\w+ = 'Z_/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!writes.length) return null;
    const i = writes[rnd(writes.length)];
    return [...lines.slice(0, i), 'IF y = 1.', lines[i], 'ENDIF.', ...lines.slice(i + 1)];
  },
  'wrap a write in DO': (lines, rnd) => {
    const writes = lines.map((l, i) => (/^\s*\w+ = 'Z_/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!writes.length) return null;
    const i = writes[rnd(writes.length)];
    return [...lines.slice(0, i), 'DO 3 TIMES.', lines[i], 'ENDDO.', ...lines.slice(i + 1)];
  },
  'add a call site': (lines, rnd) => {
    const called = [...new Set(lines.map((l) => /PERFORM (f\d)/.exec(l)?.[1]).filter((x): x is string => !!x))];
    if (!called.length) return null;
    const end = lines.findIndex((l) => l.startsWith('FORM '));
    const i = 4 + rnd(end - 4 + 1);
    return [...lines.slice(0, i), `PERFORM ${called[rnd(called.length)]} USING 'Z_NEW'.`, ...lines.slice(i)];
  },
  'add a write in another routine': (lines, rnd) => {
    const ends = lines.map((l, i) => (l === 'ENDFORM.' ? i : -1)).filter((i) => i >= 0);
    const i = ends[rnd(ends.length)];
    return [...lines.slice(0, i), `g${1 + rnd(2)} = 'Z_W'.`, ...lines.slice(i)];
  },
};

test('metamorphic: no transformation that adds paths makes an answer more certain or a different value', () => {
  let compared = 0;
  let resolvedBase = 0;
  const violations: string[] = [];
  for (let seed = 1; seed <= 400; seed++) {
    const base = program(seed);
    const before = answers(base);
    for (const v of before.values()) if (v.name) resolvedBase += 1;
    for (const [name, t] of Object.entries(TRANSFORMS)) {
      let s = seed * 31 + name.length;
      const rnd = (n: number) => (((s = (s * 1103515245 + 12345) & 0x7fffffff) >>> 16) % n);
      const changed = t(base, rnd);
      if (!changed) continue;
      const after = answers(changed);
      for (const [tag, a] of before) {
        const b = after.get(tag);
        if (!b) continue;
        compared += 1;
        const ok = certainty(b.resolution) <= certainty(a.resolution) && (b.name === null || b.name === a.name);
        if (!ok) violations.push(`seed ${seed}, ${name}, tag ${tag}: ${a.name ?? 'open'} ${a.resolution} -> ${b.name ?? 'open'} ${b.resolution}\n${changed.join('\n')}`);
      }
    }
  }
  expect(violations.slice(0, 3)).toEqual([]);
  expect(compared).toBeGreaterThan(3000);
  expect(resolvedBase).toBeGreaterThan(100);
});

test('valueAt answers with provenance and the scope it read', () => {
  const src = ['REPORT z.', 'DATA g TYPE funcname.', 'START-OF-SELECTION.', "  g = 'Z_A'.", '  CALL FUNCTION g.'].join('\n');
  const r = readSource(src);
  const a = valueAt(valueContext(r.statements, r.tree, new Set([4])), 'G', 4);
  expect(a).toEqual({ name: 'Z_A', resolution: 'assigned', row: 4, provenance: [{ row: 4, value: 'Z_A', how: 'assignment' }], scope: 'global' });
});

test('shadow against the first-step resolver: no answer changes to a different single value', () => {
  const r = runValueShadow(shadowCorpus());
  expect(r.files).toBeGreaterThanOrEqual(390);
  expect(r.categories['different-single-value:unexplained'] ?? 0).toBe(0);
  expect(Object.keys(r.categories).filter((k) => k.endsWith(':unexplained'))).toEqual([]);
});
