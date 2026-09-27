*----------------------------------------------------------------------*
***INCLUDE LZHR_ABWF01.
*----------------------------------------------------------------------*
FORM kontingent_ermitteln USING    pv_pernr TYPE persno
                                   pv_datum TYPE datum
                          CHANGING cv_rest  TYPE p.
  DATA: lt_p2006 TYPE STANDARD TABLE OF pa2006,
        ls_p2006 TYPE pa2006.

  CLEAR cv_rest.
* Urlaubskontingente (Typ 10/11), zum Datum abtragbar
  SELECT * FROM pa2006 INTO TABLE lt_p2006
    WHERE pernr = pv_pernr
      AND ktart IN ('10', '11')
      AND desta <= pv_datum
      AND deend >= pv_datum.
  CHECK sy-subrc = 0.

  LOOP AT lt_p2006 INTO ls_p2006.
    cv_rest = cv_rest + ls_p2006-anzhl - ls_p2006-kverb.
  ENDLOOP.
ENDFORM.
