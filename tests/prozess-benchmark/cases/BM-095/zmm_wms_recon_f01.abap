*----------------------------------------------------------------------*
***INCLUDE ZMM_WMS_RECON_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form ADD_ITEM - Differenz als Zugangs- oder Abgangsposition
*&---------------------------------------------------------------------*
FORM add_item USING pv_matnr TYPE matnr
                    pv_diff  TYPE p.
  DATA ls_item TYPE bapi2017_gm_item_create.

  ls_item-material = pv_matnr.
  ls_item-plant    = p_werks.
  ls_item-stge_loc = p_lgort.
  IF pv_diff > 0.
    ls_item-move_type = 'Z11'.
    ls_item-entry_qnt = pv_diff.
    APPEND ls_item TO gt_in.
  ELSE.
    ls_item-move_type = 'Z12'.
    ls_item-entry_qnt = abs( pv_diff ).
    APPEND ls_item TO gt_out.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form POST_GROUP - ein Materialbeleg je Bewegungsgruppe
*&---------------------------------------------------------------------*
FORM post_group USING pv_code  TYPE gm_code
                      pt_items TYPE STANDARD TABLE.
  DATA: ls_head   TYPE bapi2017_gm_head_01,
        ls_code   TYPE bapi2017_gm_code,
        lv_mblnr  TYPE mblnr,
        lv_mjahr  TYPE mjahr,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2.

  IF pt_items IS INITIAL.
    RETURN.
  ENDIF.

  ls_head-pstng_date = sy-datum.
  ls_head-doc_date   = sy-datum.
  ls_head-header_txt = 'WMS-Abgleich'.
  ls_code-gm_code    = pv_code.

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_head
      goodsmvt_code    = ls_code
    IMPORTING
      materialdocument = lv_mblnr
      matdocumentyear  = lv_mjahr
    TABLES
      goodsmvt_item    = pt_items
      return           = lt_return.
  READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    WRITE: / 'Buchung fehlgeschlagen:', ls_return-message.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    WRITE: / 'Materialbeleg', lv_mblnr, lv_mjahr, 'gebucht'.
  ENDIF.
ENDFORM.
