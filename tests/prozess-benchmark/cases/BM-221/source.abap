REPORT zfi_op_debitor_liste.
*----------------------------------------------------------------------*
* Offene Posten eines Debitors auflisten
* Anforderung Kreditmanagement, Ticket 4711 (2009)
*----------------------------------------------------------------------*
TABLES: bsid.

PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_kunnr TYPE kunnr OBLIGATORY.

DATA: gt_bsid TYPE STANDARD TABLE OF bsid,
      gs_bsid TYPE bsid.

START-OF-SELECTION.
  SELECT * FROM bsid INTO TABLE gt_bsid
    WHERE bukrs = p_bukrs
      AND kunnr = p_kunnr.
* nur offene Posten, ausgeglichene stehen in BSAD
  IF sy-subrc <> 0.
    MESSAGE s001(zfi) WITH p_kunnr DISPLAY LIKE 'W'.
    RETURN.
  ENDIF.

  LOOP AT gt_bsid INTO gs_bsid.
    WRITE: / gs_bsid-belnr, gs_bsid-gjahr, gs_bsid-zfbdt,
             gs_bsid-shkzg, gs_bsid-dmbtr.
  ENDLOOP.
