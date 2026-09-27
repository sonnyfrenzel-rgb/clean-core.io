*----------------------------------------------------------------------*
***INCLUDE LZ_IDOC_ZWEGRF01 - Unterprogramme WE-Eingang Dienstleister
*----------------------------------------------------------------------*

FORM segmente_lesen TABLES   pt_data  STRUCTURE edidd
                             pt_pos   STRUCTURE z1wegri
                    USING    pv_docnum TYPE edi_docnum
                    CHANGING ps_head  TYPE z1wegrh
                             pv_error TYPE abap_bool
                             pv_msg   TYPE bapi_msg.
  DATA ls_pos TYPE z1wegri.

  LOOP AT pt_data WHERE docnum = pv_docnum.
    CASE pt_data-segnam.
      WHEN 'Z1WEGRH'.
        ps_head = pt_data-sdata.
      WHEN 'Z1WEGRI'.
        ls_pos = pt_data-sdata.
        APPEND ls_pos TO pt_pos.
      WHEN OTHERS.
*       unbekannte Segmente ignorieren (Version 2 des Dienstleisters)
    ENDCASE.
  ENDLOOP.

  IF ps_head-ebeln IS INITIAL OR pt_pos[] IS INITIAL.
    pv_error = abap_true.
    pv_msg   = 'Kopfsegment oder Positionen fehlen'.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM pruefen_bestellung TABLES   pt_pos   STRUCTURE z1wegri
                        USING    ps_head  TYPE z1wegrh
                        CHANGING pv_error TYPE abap_bool
                                 pv_msg   TYPE bapi_msg.
  DATA: ls_ekko TYPE ekko,
        ls_ekpo TYPE ekpo.

  SELECT SINGLE * FROM ekko INTO ls_ekko
    WHERE ebeln = ps_head-ebeln.
  IF sy-subrc <> 0 OR ls_ekko-loekz <> space.
    pv_error = abap_true.
    pv_msg   = |Bestellung { ps_head-ebeln } unbekannt oder geloescht|.
    RETURN.
  ENDIF.
  ps_head-lifnr = ls_ekko-lifnr.

  LOOP AT pt_pos.
    SELECT SINGLE * FROM ekpo INTO ls_ekpo
      WHERE ebeln = ps_head-ebeln
        AND ebelp = pt_pos-ebelp.
    IF sy-subrc <> 0 OR ls_ekpo-loekz <> space OR ls_ekpo-elikz = 'X'.
      pv_error = abap_true.
      pv_msg   = |Position { pt_pos-ebelp } nicht offen|.
      RETURN.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM pruefen_dublette USING    ps_head  TYPE z1wegrh
                      CHANGING pv_error TYPE abap_bool
                               pv_msg   TYPE bapi_msg.
  SELECT SINGLE mblnr FROM zmm_3pl_we INTO @DATA(lv_mblnr)
    WHERE xblnr = @ps_head-lfsnr
      AND lifnr = @ps_head-lifnr.
  IF sy-subrc = 0.
    pv_error = abap_true.
    pv_msg   = |Lieferschein { ps_head-lfsnr } bereits mit { lv_mblnr } gebucht|.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM buchen_we TABLES   pt_pos   STRUCTURE z1wegri
               USING    ps_head  TYPE z1wegrh
               CHANGING pv_mblnr TYPE mblnr
                        pv_mjahr TYPE mjahr
                        pv_error TYPE abap_bool
                        pv_msg   TYPE bapi_msg.
  DATA: ls_head   TYPE bapi2017_gm_head_01,
        ls_code   TYPE bapi2017_gm_code,
        lt_item   TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        ls_item   TYPE bapi2017_gm_item_create,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2.

  ls_code-gm_code     = '01'.
  ls_head-pstng_date  = ps_head-budat.
  ls_head-doc_date    = ps_head-bldat.
  ls_head-ref_doc_no  = ps_head-lfsnr.
  ls_head-header_txt  = 'WE Dienstleister'.

  LOOP AT pt_pos.
    CLEAR ls_item.
    ls_item-move_type = '101'.
    ls_item-mvt_ind   = 'B'.
    ls_item-po_number = ps_head-ebeln.
    ls_item-po_item   = pt_pos-ebelp.
    ls_item-entry_qnt = pt_pos-menge.
    ls_item-batch     = pt_pos-charg.
    ls_item-stge_loc  = pt_pos-lgort.
    APPEND ls_item TO lt_item.
  ENDLOOP.

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_head
      goodsmvt_code    = ls_code
    IMPORTING
      materialdocument = pv_mblnr
      matdocumentyear  = pv_mjahr
    TABLES
      goodsmvt_item    = lt_item
      return           = lt_return.

  READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
  IF sy-subrc = 0 OR pv_mblnr IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    pv_error = abap_true.
    pv_msg   = ls_return-message.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM status_setzen TABLES pt_status STRUCTURE bdidocstat
                   USING  pv_docnum TYPE edi_docnum
                          pv_status TYPE edi_status
                          pv_msg    TYPE bapi_msg.
  CLEAR pt_status.
  pt_status-docnum = pv_docnum.
  pt_status-status = pv_status.
  pt_status-msgty  = COND #( WHEN pv_status = '53' THEN 'S' ELSE 'E' ).
  pt_status-msgid  = 'ZMM'.
  pt_status-msgno  = '200'.
  pt_status-msgv1  = pv_msg(50).
  pt_status-msgv2  = pv_msg+50(50).
  APPEND pt_status.
ENDFORM.
