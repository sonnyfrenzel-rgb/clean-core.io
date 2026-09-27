*&---------------------------------------------------------------------*
*& Include ZSD_RET_DISPOSITION_F01
*&---------------------------------------------------------------------*
FORM select_returns.
* Retourenauftraege, deren Retourenlieferung wareneingangsgebucht ist
  SELECT k~vbeln p~posnr k~augru k~kunnr p~matnr p~werks p~lgort
         p~charg p~kwmeng AS menge p~vrkme
    FROM vbak AS k
    INNER JOIN vbap AS p ON p~vbeln = k~vbeln
    INNER JOIN vbfa AS f ON f~vbelv = p~vbeln
                        AND f~posnv = p~posnr
                        AND f~vbtyp_n = 'T'
    INNER JOIN vbuk AS u ON u~vbeln = f~vbeln
    INTO CORRESPONDING FIELDS OF TABLE gt_ret
    WHERE k~vkorg IN s_vkorg
      AND k~erdat IN s_erdat
      AND k~augru IN s_augru
      AND k~auart = 'RE'
      AND u~wbstk = 'C'.

* bereits disponierte Positionen kennzeichnen
  LOOP AT gt_ret ASSIGNING <gs_ret>.
    SELECT SINGLE status FROM zsd_ret_log INTO @DATA(lv_status)
      WHERE vbeln = @<gs_ret>-vbeln
        AND posnr = @<gs_ret>-posnr.
    IF sy-subrc = 0 AND lv_status = 'DONE'.
      <gs_ret>-status = 'DONE'.
    ENDIF.
  ENDLOOP.
ENDFORM.

FORM post_movement USING    iv_bwart TYPE bwart
                            iv_lgort TYPE lgort_d
                            iv_kostl TYPE kostl
                   CHANGING cs_ret   TYPE ty_ret
                   RAISING  zcx_sd_ret.
  DATA: ls_head   TYPE bapi2017_gm_head_01,
        lt_items  TYPE STANDARD TABLE OF bapi2017_gm_item_create,
        lt_return TYPE STANDARD TABLE OF bapiret2.

  ls_head-pstng_date = sy-datum.
  ls_head-doc_date   = sy-datum.
  ls_head-header_txt = |Retoure { cs_ret-vbeln }|.

  APPEND VALUE #( material   = cs_ret-matnr
                  plant      = cs_ret-werks
                  stge_loc   = cs_ret-lgort
                  batch      = cs_ret-charg
                  move_type  = iv_bwart
                  entry_qnt  = cs_ret-menge
                  entry_uom  = cs_ret-vrkme
                  move_stloc = COND #( WHEN iv_lgort <> cs_ret-lgort THEN iv_lgort )
                  costcenter = iv_kostl ) TO lt_items.

  CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
    EXPORTING
      goodsmvt_header  = ls_head
      goodsmvt_code    = COND bapi2017_gm_code( WHEN iv_kostl IS INITIAL THEN '04' ELSE '03' )
    IMPORTING
      materialdocument = cs_ret-mblnr
    TABLES
      goodsmvt_item    = lt_items
      return           = lt_return.

  IF cs_ret-mblnr IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    RAISE EXCEPTION TYPE zcx_sd_ret
      EXPORTING
        textid = zcx_sd_ret=>movement_failed
        bwart  = iv_bwart.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
ENDFORM.

FORM create_credit_memos.
  DATA: lt_bill    TYPE STANDARD TABLE OF bapivbrk,
        lt_return  TYPE STANDARD TABLE OF bapiret1,
        lt_success TYPE STANDARD TABLE OF bapivbrksuccess.

* je vollstaendig disponiertem Retourenauftrag eine Gutschrift (RE -> G2)
  lt_bill = VALUE #( FOR GROUPS grp OF r IN gt_ret
                     WHERE ( status = 'DONE' )
                     GROUP BY r-vbeln
                     ( ref_doc = grp ref_doc_ca = 'H' bill_date = sy-datum ) ).
  IF lt_bill IS INITIAL.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_BILLINGDOC_CREATEMULTIPLE'
    TABLES
      billingdatain = lt_bill
      return        = lt_return
      success       = lt_success.
  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.

  DATA(lv_cnt) = lines( lt_success ).
  MESSAGE s398(00) WITH lv_cnt 'Gutschrift(en) erzeugt'.
ENDFORM.
