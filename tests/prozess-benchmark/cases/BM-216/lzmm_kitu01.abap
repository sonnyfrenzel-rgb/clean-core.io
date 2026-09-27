FUNCTION z_mm_kit_reserve.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_AUFNR) TYPE  AUFNR
*"     VALUE(IV_WERKS) TYPE  WERKS_D
*"     VALUE(IV_PARTIAL) TYPE  ABAP_BOOL DEFAULT ABAP_FALSE
*"     VALUE(IV_SIMULATE) TYPE  ABAP_BOOL DEFAULT ABAP_FALSE
*"  EXPORTING
*"     VALUE(EV_RSNUM) TYPE  RSNUM
*"     VALUE(ET_RESULT) TYPE  ZMM_KIT_RESULT_T
*"----------------------------------------------------------------------
  DATA: lo_lock     TYPE REF TO lcl_lock_manager,
        lo_strategy TYPE REF TO lif_alloc_strategy,
        lx_kit      TYPE REF TO lcx_kit,
        lt_comp     TYPE tt_comp.

  FIELD-SYMBOLS <ls_comp> TYPE ty_comp.

  CLEAR: gt_result, ev_rsnum.

* MES-Benutzer braucht Reservierungsberechtigung fuer 311
  AUTHORITY-CHECK OBJECT 'M_MRES_BWA'
    ID 'ACTVT' FIELD '01'
    ID 'BWART' FIELD gc_bwart.
  IF sy-subrc <> 0.
    PERFORM log_result USING space 'E' 'Keine Berechtigung fuer Reservierungen'.
    et_result = gt_result.
    RETURN.
  ENDIF.

  lo_lock = NEW lcl_lock_manager( ).

  TRY.
      TRY.
          lt_comp = lcl_kit_builder=>components_for_order( iv_aufnr = iv_aufnr
                                                           iv_werks = iv_werks ).
          LOOP AT lt_comp ASSIGNING <ls_comp>.
            lo_lock->lock_material( iv_matnr = <ls_comp>-matnr
                                    iv_werks = iv_werks ).
            lo_strategy = lcl_alloc_factory=>for_material( iv_matnr = <ls_comp>-matnr
                                                           iv_werks = iv_werks ).
            lo_strategy->allocate( CHANGING cs_comp = <ls_comp> ).
            IF <ls_comp>-open_qty > 0.
              PERFORM log_result USING <ls_comp>-matnr 'W' 'Fehlmenge'.
            ENDIF.
          ENDLOOP.

          lcl_kit_builder=>assert_complete( it_comp    = lt_comp
                                            iv_partial = iv_partial ).

          IF iv_simulate = abap_false.
            PERFORM post_reservation USING lt_comp iv_aufnr CHANGING ev_rsnum.
          ENDIF.
        CLEANUP.
*         Sperren auch bei Ausnahme loesen
          lo_lock->release_all( ).
      ENDTRY.
    CATCH lcx_kit INTO lx_kit.
      PERFORM log_result USING space 'E' lx_kit->mv_text.
      et_result = gt_result.
      RETURN.
  ENDTRY.

  lo_lock->release_all( ).
  et_result = gt_result.
ENDFUNCTION.
