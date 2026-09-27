*----------------------------------------------------------------------*
* BAdI INVOICE_UPDATE - Implementierung ZMM_INVOICE_UPDATE
* Zusaetzliche Preis-/Mengenpruefung in MIRO beim Sichern
* 2010-09 AB  Erstellung (Projekt P2P-Harmonisierung)
* 2017-02 CD  Kreditorspezifische Toleranzen aus ZMM_IV_TOL
* 2019-06 CD  Harte Grenze: Sichern verhindern statt nur Protokoll
*----------------------------------------------------------------------*
CLASS zcl_im_invoice_update DEFINITION
  PUBLIC FINAL CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_ex_invoice_update.
ENDCLASS.

CLASS zcl_im_invoice_update IMPLEMENTATION.

  METHOD if_ex_invoice_update~change_at_save.
    DATA: lo_check    TYPE REF TO zcl_mm_iv_check,
          ls_tol      TYPE zmm_iv_tol,
          ls_rseg     TYPE mrmrseg,
          ls_result   TYPE zcl_mm_iv_check=>ty_result,
          lt_log      TYPE STANDARD TABLE OF zmm_iv_log,
          ls_log      TYPE zmm_iv_log,
          lv_block    TYPE abap_bool,
          lv_sum_diff TYPE wrbtr.

*   Gutschriften und nachtraegliche Belastungen nicht pruefen
    IF s_rbkp_new-xrech <> 'X' OR s_rbkp_new-tbtkz = 'X'.
      RETURN.
    ENDIF.

    CREATE OBJECT lo_check.
    ls_tol = lo_check->get_tolerance( iv_bukrs = s_rbkp_new-bukrs
                                      iv_lifnr = s_rbkp_new-lifnr ).
    IF ls_tol-inaktiv = 'X'.
      RETURN.
    ENDIF.

    LOOP AT ti_rseg_new INTO ls_rseg WHERE ebeln IS NOT INITIAL.
      ls_result = lo_check->check_item( is_rseg = ls_rseg ).
      IF ls_result-not_found = abap_true.
        CONTINUE.
      ENDIF.

      CLEAR ls_log.
      IF ls_result-price_dev_pct > ls_tol-preis_pct.
        ls_log-reason = 'P'.
      ELSEIF ls_result-qty_over > 0 AND ls_tol-menge_ueber = space.
        ls_log-reason = 'M'.
      ELSE.
        CONTINUE.
      ENDIF.

      lv_block = abap_true.
      lv_sum_diff = lv_sum_diff + ls_result-diff_amount.
      ls_log-belnr  = s_rbkp_new-belnr.
      ls_log-gjahr  = s_rbkp_new-gjahr.
      ls_log-buzei  = ls_rseg-buzei.
      ls_log-ebeln  = ls_rseg-ebeln.
      ls_log-ebelp  = ls_rseg-ebelp.
      ls_log-lifnr  = s_rbkp_new-lifnr.
      ls_log-diff   = ls_result-diff_amount.
      ls_log-uname  = sy-uname.
      ls_log-datum  = sy-datum.
      APPEND ls_log TO lt_log.
    ENDLOOP.

    IF lv_block = abap_false.
      RETURN.
    ENDIF.

*   harte Grenze: Beleg darf so nicht gesichert werden
    IF ls_tol-hart_betrag > 0 AND lv_sum_diff > ls_tol-hart_betrag.
      MESSAGE e120(zmm) WITH lv_sum_diff ls_tol-hart_betrag
        RAISING error_with_message.
    ENDIF.

*   weiche Abweichung: protokollieren fuer Nachbearbeitung Kreditorenbuchhaltung
    CALL FUNCTION 'Z_MM_IV_LOG_WRITE' IN UPDATE TASK
      TABLES
        it_log = lt_log.

  ENDMETHOD.

  METHOD if_ex_invoice_update~change_before_update.
  ENDMETHOD.

  METHOD if_ex_invoice_update~change_in_update.
  ENDMETHOD.

ENDCLASS.
