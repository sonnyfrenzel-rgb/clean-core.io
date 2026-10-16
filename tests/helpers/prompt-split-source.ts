/**
 * A synthetic ABAP report for the prompt-split spec (roadmap 3.0.17): one routine of `checks` range checks
 * on a claim, four lines each, written for this test — no real program. Each check refuses the claim with an
 * error code and an error message, so the engine reads it as a guard and as a business rule. With `loop`
 * the checks stand inside one LOOP: one top-level statement the engine does not cut.
 */
export function promptSplitSource(checks: number, opts: { loop?: boolean } = {}): string {
  const fields = Array.from({ length: 14 }, (_, i) => `f${String(i + 1).padStart(2, '0')}`);
  const indent = opts.loop ? '    ' : '  ';
  const blocks: string[] = [];
  for (let k = 0; k < checks; k++) {
    const field = fields[k % fields.length];
    const limit = 100 + k * 37;
    const code = `${field.toUpperCase()}_RANGE_${String(k + 1).padStart(3, '0')}`;
    blocks.push(
      `${indent}IF gs_claim-${field} > ${limit} OR gs_claim-${field} < ${k % 3 === 0 ? -5 : 0}.`,
      `${indent}  gv_error = '${code}'.`,
      `${indent}  MESSAGE 'Claim ${field.toUpperCase()} is outside ${k % 3 === 0 ? -5 : 0} to ${limit} (check ${k + 1})' TYPE 'E'.`,
      `${indent}ENDIF.`,
    );
  }
  return [
    'REPORT zcc_prompt_split.',
    'TYPES: BEGIN OF ty_claim,',
    '         claim TYPE c LENGTH 10,',
    ...fields.map((f) => `         ${f} TYPE p LENGTH 13 DECIMALS 2,`),
    '       END OF ty_claim.',
    'DATA gs_claim TYPE ty_claim.',
    'DATA gt_claims TYPE STANDARD TABLE OF ty_claim.',
    'DATA gv_error TYPE string.',
    'PARAMETERS p_bukrs TYPE c LENGTH 4 OBLIGATORY.',
    'START-OF-SELECTION.',
    '  PERFORM validate_claim.',
    '  PERFORM report_result.',
    'FORM validate_claim.',
    ...(opts.loop ? ['  LOOP AT gt_claims INTO gs_claim.'] : []),
    ...blocks,
    ...(opts.loop ? ['  ENDLOOP.'] : []),
    'ENDFORM.',
    'FORM report_result.',
    '  IF gv_error IS NOT INITIAL.',
    "    MESSAGE gv_error TYPE 'E'.",
    '  ENDIF.',
    "  WRITE: / 'Claim checked', gs_claim-claim.",
    'ENDFORM.',
    '',
  ].join('\n');
}
