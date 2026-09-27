FUNCTION z_sd_pick_split_rfc.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (remotefähig)
*"  IMPORTING
*"     VALUE(IT_VBELN) TYPE  ZSD_T_VBELN
*"     VALUE(IV_MAXGW) TYPE  BRGEW
*"     VALUE(IV_TEST) TYPE  XFELD DEFAULT SPACE
*"  EXPORTING
*"     VALUE(ET_RESULT) TYPE  ZSD_T_PICK_RESULT
*"----------------------------------------------------------------------
* Je Lieferung: sperren, ggf. nach Gewicht splitten, kommissionieren
*----------------------------------------------------------------------
  DATA: lo_split  TYPE REF TO zcl_sd_pick_split,
        lt_split  TYPE zcl_sd_pick_split=>tt_split_item,
        lv_neu    TYPE vbeln_vl,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        lv_text   TYPE bapi_msg.

  LOOP AT it_vbeln INTO DATA(lv_vbeln).

    CALL FUNCTION 'ENQUEUE_EVVBLKE'
      EXPORTING
        vbeln          = lv_vbeln
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      APPEND VALUE #( vbeln = lv_vbeln status = 'E'
                      text  = 'Lieferung in Bearbeitung' ) TO et_result.
      CONTINUE.
    ENDIF.

    TRY.
        lo_split = NEW zcl_sd_pick_split( iv_vbeln = lv_vbeln
                                          iv_maxgw = iv_maxgw ).
      CATCH zcx_sd_pick INTO DATA(lx_pick).
        APPEND VALUE #( vbeln = lv_vbeln status = 'E'
                        text  = lx_pick->get_text( ) ) TO et_result.
        CALL FUNCTION 'DEQUEUE_EVVBLKE'
          EXPORTING
            vbeln = lv_vbeln.
        CONTINUE.
    ENDTRY.

    lt_split = lo_split->determine_split( ).
    CLEAR lv_neu.

    IF lt_split IS NOT INITIAL AND iv_test = abap_false.
      CLEAR lt_return.
      CALL FUNCTION 'BAPI_OUTB_DELIVERY_SPLIT_DEC'
        EXPORTING
          delivery      = lv_vbeln
        IMPORTING
          new_delivery  = lv_neu
        TABLES
          item_data_spl = lt_split
          return        = lt_return.
      READ TABLE lt_return INTO DATA(ls_ret) WITH KEY type = 'E'.
      IF sy-subrc = 0.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        APPEND VALUE #( vbeln = lv_vbeln status = 'E'
                        text  = ls_ret-message ) TO et_result.
        CALL FUNCTION 'DEQUEUE_EVVBLKE'
          EXPORTING
            vbeln = lv_vbeln.
        CONTINUE.
      ENDIF.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      lo_split->remove_split_items( lt_split ).
    ENDIF.

*   Kommissionierung der (verbleibenden) Positionen
    lo_split->pick( EXPORTING iv_test = iv_test
                    IMPORTING ev_text = lv_text ).

    IF lv_neu IS NOT INITIAL.
      APPEND VALUE #( vbeln = lv_vbeln vbeln_neu = lv_neu status = 'W'
                      text  = |Gesplittet; { lv_text }| ) TO et_result.
    ELSEIF lt_split IS NOT INITIAL.
      APPEND VALUE #( vbeln = lv_vbeln status = 'W'
                      text  = |Split nötig (Testlauf); { lv_text }| ) TO et_result.
    ELSE.
      APPEND VALUE #( vbeln = lv_vbeln status = 'S' text = lv_text )
             TO et_result.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_EVVBLKE'
      EXPORTING
        vbeln = lv_vbeln.
  ENDLOOP.
ENDFUNCTION.
