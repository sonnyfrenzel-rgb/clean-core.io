*----------------------------------------------------------------------*
***INCLUDE LZFI_ZAHLFREIGABEF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  BANKAENDERUNG_PRUEFEN
*&---------------------------------------------------------------------*
*       Wurde die Bankverbindung des Kreditors in den letzten
*       pv_tage Tagen geaendert? (Aenderungsbelege KRED / LFBK)
*----------------------------------------------------------------------*
FORM bankaenderung_pruefen USING ps_reguh TYPE reguh
                                 pv_tage  TYPE i.
  DATA: lt_cdhdr TYPE STANDARD TABLE OF cdhdr,
        ls_cdhdr TYPE cdhdr,
        lv_ab    TYPE datum,
        lv_objid TYPE cdobjectv,
        lv_text  TYPE char80.

  lv_ab    = sy-datum - pv_tage.
  lv_objid = ps_reguh-lifnr.

  SELECT * FROM cdhdr INTO TABLE lt_cdhdr
    WHERE objectclas = gc_objclas
      AND objectid   = lv_objid
      AND udate     >= lv_ab.
  CHECK sy-subrc = 0.

  LOOP AT lt_cdhdr INTO ls_cdhdr.
*   nur Aenderungen an der Bankverbindung zaehlen
    SELECT SINGLE changenr FROM cdpos INTO ls_cdhdr-changenr
      WHERE objectclas = gc_objclas
        AND objectid   = lv_objid
        AND changenr   = ls_cdhdr-changenr
        AND tabname    = 'LFBK'.
    IF sy-subrc = 0.
      CONCATENATE 'Bankverbindung geaendert am' ls_cdhdr-udate
                  'von' ls_cdhdr-username
        INTO lv_text SEPARATED BY space.
      PERFORM befund_add USING ps_reguh 'R' lv_text.
      EXIT.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  BEFUND_ADD
*&---------------------------------------------------------------------*
FORM befund_add USING ps_reguh  TYPE reguh
                      pv_klasse TYPE c
                      pv_text   TYPE c.
  DATA ls_befund TYPE gty_befund.

  ls_befund-lifnr  = ps_reguh-lifnr.
  ls_befund-vblnr  = ps_reguh-vblnr.
  ls_befund-klasse = pv_klasse.
  ls_befund-text   = pv_text.
  APPEND ls_befund TO gt_befund.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  RISIKO_BEWERTEN
*&---------------------------------------------------------------------*
*       rot   = mindestens eine Bankdatenaenderung
*       gelb  = sonstige Befunde (Limit, CPD)
*       gruen = keine Befunde
*----------------------------------------------------------------------*
FORM risiko_bewerten CHANGING cv_status TYPE c.
  DATA ls_befund TYPE gty_befund.

  cv_status = gc_gruen.

  LOOP AT gt_befund INTO ls_befund WHERE klasse = 'R'.
    cv_status = gc_rot.
    RETURN.
  ENDLOOP.

  IF gt_befund IS NOT INITIAL.
    cv_status = gc_gelb.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& alte Limitpruefung je Hausbank (bis 2017) - ersetzt durch IV_LIMIT
*&---------------------------------------------------------------------*
*FORM limit_hausbank USING ps_reguh TYPE reguh
*                    CHANGING cv_ueber TYPE xfeld.
*  DATA lv_limit TYPE dmbtr.
*  CLEAR cv_ueber.
*  SELECT SINGLE limit FROM zfi_hbk_limit INTO lv_limit
*    WHERE hbkid = ps_reguh-hbkid.
*  IF sy-subrc = 0 AND ps_reguh-rbetr > lv_limit.
*    cv_ueber = 'X'.
*  ENDIF.
*ENDFORM.
