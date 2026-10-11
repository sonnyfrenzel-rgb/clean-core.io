import { test, expect } from '@playwright/test';
import { buildProcessSkeleton } from '../lib/abap/process-skeleton';
import { plainLabels } from '../lib/abap/plain-language';
import { buildBpmnExport } from '../lib/bpmn/export';
import { parseBpmn } from '../lib/process-map';

/**
 * Owner, 11.10.2026: "Does a business consumer understand something like
 * 'ALV LIST' in the BPMNs? Not everyone does."
 *
 * A step says what it does for the business; the SAP technique that does it
 * stays underneath — the element's technical name, its documentation ("In the
 * code: CALL SCREEN 9000 (dynpro) (line 19)") and its line anchor. Only names
 * and documentation change: ids, anchors and the structure of the file are the
 * same with plain names as with technical ones, so a Signavio round trip and a
 * stored revision keep matching element by element.
 *
 * Pure: no browser, no server.
 */

const SOURCE = [
  /*  1 */ 'REPORT zmm_technique_words.',
  /*  2 */ '',
  /*  3 */ 'TABLES ekko.',
  /*  4 */ 'DATA: gt_bdc   TYPE TABLE OF bdcdata,',
  /*  5 */ '      gt_lines TYPE TABLE OF string,',
  /*  6 */ '      gt_out   TYPE TABLE OF ekko.',
  /*  7 */ '',
  /*  8 */ 'SELECT-OPTIONS s_ebeln FOR ekko-ebeln.',
  /*  9 */ 'PARAMETERS p_file TYPE string.',
  /* 10 */ '',
  /* 11 */ 'START-OF-SELECTION.',
  /* 12 */ "  CALL FUNCTION 'GUI_UPLOAD'",
  /* 13 */ '    EXPORTING',
  /* 14 */ '      filename = p_file',
  /* 15 */ '    TABLES',
  /* 16 */ '      data_tab = gt_lines.',
  /* 17 */ '  CALL SELECTION-SCREEN 1100.',
  /* 18 */ '  CALL SCREEN 9000.',
  /* 19 */ "  CALL TRANSACTION 'ME21N' USING gt_bdc MODE 'N'.",
  /* 20 */ '  COMMIT WORK.',
  /* 21 */ '  SUBMIT zmm_follow_up AND RETURN.',
  /* 22 */ "  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'",
  /* 23 */ '    TABLES',
  /* 24 */ '      t_outtab = gt_out.',
  /* 25 */ "  CALL FUNCTION 'GUI_DOWNLOAD'",
  /* 26 */ '    EXPORTING',
  /* 27 */ '      filename = p_file',
  /* 28 */ '    TABLES',
  /* 29 */ '      data_tab = gt_lines.',
  /* 30 */ '  NEW-PAGE PRINT ON.',
  /* 31 */ "  WRITE: / 'Done'.",
  /* 32 */ '  NEW-PAGE PRINT OFF.',
  /* 33 */ "  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'.",
  /* 34 */ "  CALL TRANSACTION 'FB03'.",
  /* 35 */ "  CALL FUNCTION 'Z_POST_LATER' IN UPDATE TASK.",
  /* 36 */ "  CALL FUNCTION 'ZFI_UNKNOWN_THING' DESTINATION 'NONE'.",
].join('\n');

/** Construct → business label → technique underneath → the line it is anchored on. */
const EXPECTED: Array<{ token: string; label: string; technique: string; line: number }> = [
  { token: 'START-OF-SELECTION', label: 'Run starts with the entered selection', technique: 'START-OF-SELECTION (after the selection screen)', line: 11 },
  { token: 'GUI_UPLOAD', label: "Read a file from the user's PC", technique: "CALL FUNCTION 'GUI_UPLOAD'", line: 12 },
  { token: '9000', label: 'Enter data on screen 9000', technique: 'CALL SCREEN 9000 (dynpro)', line: 18 },
  { token: 'ME21N', label: 'Create purchase order (ME21N) by simulated entry', technique: "CALL TRANSACTION 'ME21N' USING … (batch input)", line: 19 },
  { token: 'ZMM_FOLLOW_UP', label: 'Start the report ZMM_FOLLOW_UP', technique: 'SUBMIT ZMM_FOLLOW_UP AND RETURN', line: 21 },
  { token: 'REUSE_ALV_GRID_DISPLAY', label: 'Show the result list', technique: "CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY' (ALV list)", line: 22 },
  { token: 'GUI_DOWNLOAD', label: "Save a file to the user's PC", technique: "CALL FUNCTION 'GUI_DOWNLOAD'", line: 25 },
  { token: 'NEW-PAGE', label: 'Print the list', technique: 'NEW-PAGE (list output to the spool)', line: 30 },
  { token: 'BAPI_TRANSACTION_COMMIT', label: 'Save the changes', technique: "CALL FUNCTION 'BAPI_TRANSACTION_COMMIT' (BAPI)", line: 33 },
  { token: 'FB03', label: 'Display accounting document (FB03)', technique: "CALL TRANSACTION 'FB03'", line: 34 },
  { token: 'Z_POST_LATER', label: 'Post later', technique: "CALL FUNCTION 'Z_POST_LATER' IN UPDATE TASK (runs when the changes are saved)", line: 35 },
  // Unknown: the humanised name the developer wrote, never a meaning it does not carry.
  { token: 'ZFI_UNKNOWN_THING', label: 'Zfi unknown thing', technique: "CALL FUNCTION 'ZFI_UNKNOWN_THING' DESTINATION NONE (remote call)", line: 36 },
];

/** Words of the SAP technique that a business label must not use. */
const TECHNIQUE_WORDS = /\b(?:ALV|BAPI|BDC|batch input|dynpro|GUI_\w+|SUBMIT|COMMIT|function module|spool|update task|RFC|selection-screen)\b/i;

function decode(text: string): string {
  return text.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

test.describe('process steps say what they do for the business (owner, 11.10.2026)', () => {
  const skeleton = buildProcessSkeleton(SOURCE);
  const labels = plainLabels(skeleton, SOURCE);
  const nodeOf = (token: string) => {
    const node = skeleton.nodes.find((n) => n.label === token && n.kind !== 'end');
    if (!node) throw new Error(`no node for ${token}`);
    return node;
  };

  test('every construct gets its business label; the technique and its line stay underneath', () => {
    for (const row of EXPECTED) {
      const node = nodeOf(row.token);
      expect(labels.nodes.get(node.id), row.token).toBe(row.label);
      expect(labels.technique(node.id), row.token).toBe(row.technique);
      expect(node.anchor?.lineStart, row.token).toBe(row.line);
      // The token itself is unchanged: the technical name the map's "Technical names" view shows.
      expect(labels.technical(node.id), row.token).toBe(row.token);
    }
  });

  test('no business label names a technique, and the ones the map does not draw stay undrawn', () => {
    for (const label of labels.nodes.values()) expect(label, label).not.toMatch(TECHNIQUE_WORDS);
    // `COMMIT WORK` (L20) and `CALL SELECTION-SCREEN` (L17) are no step of the
    // skeleton: a commit boundary and a screen call draw no BPMN element (§5.8).
    // The labels did not make one up.
    expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 20)).toBe(false);
    expect(skeleton.nodes.some((n) => n.anchor?.lineStart === 17)).toBe(false);
  });

  test('the BPMN file carries the business name, the technique in the documentation, and the same ids', () => {
    const options = { processName: 'Technique words', sourceFileName: 'ZMM_TECHNIQUE_WORDS.abap', source: SOURCE };
    const plain = buildBpmnExport(skeleton, { ...options, names: 'plain' });
    const technical = buildBpmnExport(skeleton, { ...options, names: 'technical' });

    // Only names and documentation differ: every element id, and the node each was drawn from, is the same.
    expect(Object.keys(plain.elementNode).sort()).toEqual(Object.keys(technical.elementNode).sort());
    expect(plain.elementNode).toEqual(technical.elementNode);
    const parsedPlain = parseBpmn(plain.xml);
    const parsedTechnical = parseBpmn(technical.xml);
    expect(parsedPlain.elements.map((e) => e.id)).toEqual(parsedTechnical.elements.map((e) => e.id));
    expect(parsedPlain.flows.map((f) => f.id)).toEqual(parsedTechnical.flows.map((f) => f.id));

    const elementIdOf = (nodeId: string) => Object.entries(plain.elementNode).find(([, n]) => n === nodeId)?.[0] ?? '';
    for (const row of EXPECTED) {
      const id = elementIdOf(nodeOf(row.token).id);
      expect(id, row.token).not.toBe('');
      const element = new RegExp(`<bpmn:\\w+ id="${id}" name="([^"]*)"[^>]*>([\\s\\S]*?)<bpmn:extensionElements`).exec(plain.xml);
      expect(element, row.token).not.toBeNull();
      expect(decode(element?.[1] ?? ''), row.token).toBe(row.label);
      const documentation = /<bpmn:documentation>([\s\S]*?)<\/bpmn:documentation>/.exec(element?.[2] ?? '')?.[1] ?? '';
      const anchor = nodeOf(row.token).anchor;
      const lines = anchor && anchor.lineEnd !== anchor.lineStart ? `${anchor.lineStart}–${anchor.lineEnd}` : `${row.line}`;
      expect(decode(documentation), row.token).toBe(`In the code: ${row.technique} (line ${lines})`);
      // The trace keeps the token for the technical view and a round trip.
      expect(parsedPlain.elements.find((e) => e.id === id)?.trace?.technicalName, row.token).toBe(row.token);
    }
  });
});

/**
 * QA review of 11e3bc7d90e8: a `WRITE` in a loop after `NEW-PAGE PRINT ON` is a
 * step of its own whose lines hold no `PRINT ON`; it prints all the same. The
 * print mode is the last `NEW-PAGE PRINT ON|OFF` before the step, in source order.
 */
test.describe('list output prints while NEW-PAGE PRINT ON is in force', () => {
  const PRINTING = [
    /*  1 */ 'REPORT zmm_print_mode.',
    /*  2 */ 'DATA gt TYPE TABLE OF string.',
    /*  3 */ 'DATA gs TYPE string.',
    /*  4 */ 'START-OF-SELECTION.',
    /*  5 */ '  NEW-PAGE PRINT ON.',
    /*  6 */ '  LOOP AT gt INTO gs.',
    /*  7 */ '    WRITE: / gs.',
    /*  8 */ '  ENDLOOP.',
    /*  9 */ '  NEW-PAGE PRINT OFF.',
    /* 10 */ '  LOOP AT gt INTO gs.',
    /* 11 */ '    WRITE: / gs.',
    /* 12 */ '  ENDLOOP.',
  ].join('\n');
  const skeleton = buildProcessSkeleton(PRINTING);
  const labels = plainLabels(skeleton, PRINTING);
  const at = (line: number) => {
    const node = skeleton.nodes.find((n) => n.kind === 'output' && n.anchor?.lineStart === line);
    if (!node) throw new Error(`no output node on line ${line}`);
    return node.id;
  };

  test('PRINT ON before the WRITE step: the step prints the list', () => {
    expect(labels.nodes.get(at(7))).toBe('Print the list');
    expect(labels.technique(at(7))).toBe('WRITE (list output to the spool)');
  });

  test('PRINT OFF in between: the WRITE after it shows the list, and the switch itself prints nothing', () => {
    expect(labels.nodes.get(at(11))).toBe('Show the result list');
    expect(labels.technique(at(11))).toBe('WRITE (list output)');
    expect(labels.nodes.get(at(9))).toBe('Show the result list');
    expect(labels.nodes.get(at(5))).toBe('Print the list');
  });
});
