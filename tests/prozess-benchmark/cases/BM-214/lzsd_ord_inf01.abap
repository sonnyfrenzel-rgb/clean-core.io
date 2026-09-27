*----------------------------------------------------------------------*
* Include LZSD_ORD_INF01 - Hilfsroutinen
*----------------------------------------------------------------------*
FORM check_duplicate USING is_order TYPE ty_order
                     RAISING lcx_order_in.
  DATA lv_vbeln TYPE vbeln_va.

* gleiche Kundenbestellnummer beim gleichen Auftraggeber = Doppelsendung
  SELECT SINGLE vbeln FROM vbak INTO lv_vbeln
    WHERE kunnr = is_order-kunag
      AND bstnk = is_order-bstkd
      AND vbtyp = 'C'.
  IF sy-subrc = 0.
    RAISE EXCEPTION TYPE lcx_order_in
      EXPORTING iv_text = |Bestellung { is_order-bstkd } bereits als { lv_vbeln } erfasst|.
  ENDIF.
ENDFORM.

FORM set_status USING iv_docnum TYPE edi_docnum
                      iv_status TYPE edi_status
                      iv_text   TYPE csequence.
  APPEND VALUE #( docnum = iv_docnum
                  status = iv_status
                  msgty  = COND #( WHEN iv_status = '53' THEN 'S' ELSE 'E' )
                  msgid  = 'ZSD_EDI'
                  msgno  = '010'
                  msgv1  = iv_text
                  msgv2  = COND #( WHEN strlen( iv_text ) > 50 THEN iv_text+50 )
                  repid  = sy-repid ) TO gt_status.
ENDFORM.

*FORM alte_preispruefung USING is_order TYPE ty_order.
*  "bis 2019: Preisabweichung EDI-Preis gegen PR00 > 2 % -> Status 51
*  "entfallen, Handel sendet keine Preise mehr
*ENDFORM.
