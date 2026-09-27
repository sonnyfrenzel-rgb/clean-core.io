REPORT zmm_inv_diff.
* Inventurdifferenzen je Werk/Lagerort - gezaehlt, aber noch nicht gebucht
PARAMETERS: p_werks TYPE iseg-werks OBLIGATORY,
            p_lgort TYPE iseg-lgort,
            p_gjahr TYPE iseg-gjahr DEFAULT sy-datum(4).

DATA: gt_iseg TYPE STANDARD TABLE OF iseg,
      gs_iseg TYPE iseg,
      gv_diff TYPE menge_d.

START-OF-SELECTION.
  SELECT * FROM iseg INTO TABLE gt_iseg
    WHERE werks = p_werks
      AND gjahr = p_gjahr
      AND xzael = 'X'
      AND xdiff = space.
  IF p_lgort IS NOT INITIAL.
    DELETE gt_iseg WHERE lgort <> p_lgort.
  ENDIF.

  LOOP AT gt_iseg INTO gs_iseg.
    gv_diff = gs_iseg-menge - gs_iseg-buchm.
    IF gv_diff < 0.
      FORMAT COLOR COL_NEGATIVE.
    ELSE.
      FORMAT COLOR COL_POSITIVE.
    ENDIF.
    WRITE: / gs_iseg-iblnr, gs_iseg-zeili, gs_iseg-matnr, gs_iseg-lgort,
             gs_iseg-buchm, gs_iseg-menge, gv_diff.
    FORMAT COLOR OFF.
  ENDLOOP.
