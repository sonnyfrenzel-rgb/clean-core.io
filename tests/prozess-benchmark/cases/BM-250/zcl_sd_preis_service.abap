CLASS zcl_sd_preis_service DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_freigabe,
             vbeln    TYPE vbeln_va,
             posnr    TYPE posnr_va,
             neupreis TYPE kbetr,
             waerk    TYPE waerk,
             op_index TYPE i,
           END OF ty_freigabe,
           tt_freigabe TYPE STANDARD TABLE OF ty_freigabe WITH EMPTY KEY,
           tt_vbeln    TYPE STANDARD TABLE OF vbeln_va WITH EMPTY KEY.

    CONSTANTS: gc_kschl_manuell TYPE kscha VALUE 'ZMAN',
               gc_lifsk_preis   TYPE lifsk VALUE 'ZP'.

    METHODS constructor
      IMPORTING io_collector TYPE REF TO zcl_sd_msg_collector.

    "! Setzt den freigegebenen Preis als manuelle Kondition ZMAN und
    "! nimmt die Liefersperre ZP (Preispruefung) zurueck
    METHODS freigeben
      CHANGING ct_freigabe TYPE tt_freigabe
      RAISING  /iwbep/cx_mgw_busi_exception.

  PRIVATE SECTION.
    DATA mo_collector TYPE REF TO zcl_sd_msg_collector.
ENDCLASS.



CLASS zcl_sd_preis_service IMPLEMENTATION.

  METHOD constructor.
    mo_collector = io_collector.
  ENDMETHOD.


  METHOD freigeben.
    DATA: ls_header_in  TYPE bapisdh1,
          ls_header_inx TYPE bapisdh1x,
          lt_cond       TYPE STANDARD TABLE OF bapicond,
          lt_condx      TYPE STANDARD TABLE OF bapicondx,
          lt_return     TYPE STANDARD TABLE OF bapiret2,
          lv_updkz      TYPE updkz_d.

    DATA(lt_vbeln) = VALUE tt_vbeln( FOR GROUPS grp OF ls_f IN ct_freigabe
                                         GROUP BY ls_f-vbeln ( grp ) ).

    LOOP AT lt_vbeln INTO DATA(lv_vbeln).

      CALL FUNCTION 'ENQUEUE_EVVBAKE'
        EXPORTING
          vbeln          = lv_vbeln
        EXCEPTIONS
          foreign_lock   = 1
          system_failure = 2
          OTHERS         = 3.
      IF sy-subrc <> 0.
        mo_collector->add_text( iv_type = 'E'
                                iv_text = |Auftrag { lv_vbeln } ist gesperrt ({ sy-msgv1 })| ).
        mo_collector->raise_if_errors( ).
      ENDIF.

      SELECT SINGLE vbeln, lifsk, knumv FROM vbak
        WHERE vbeln = @lv_vbeln
        INTO @DATA(ls_vbak).

      CLEAR: ls_header_in, ls_header_inx, lt_cond, lt_condx, lt_return.
      ls_header_inx-updateflag = 'U'.

      IF ls_vbak-lifsk = gc_lifsk_preis.
        ls_header_in-dlv_block  = space.
        ls_header_inx-dlv_block = abap_true.
      ELSE.
        mo_collector->add_text( iv_type = 'W'
                                iv_text = |Auftrag { lv_vbeln } hat keine Preispruefsperre| ).
      ENDIF.

      LOOP AT ct_freigabe INTO DATA(ls_frei) WHERE vbeln = lv_vbeln.

*       Position schon komplett erledigt? (Gesamtstatus aus VBUP)
        SELECT SINGLE gbsta FROM vbup
          WHERE vbeln = @ls_frei-vbeln
            AND posnr = @ls_frei-posnr
          INTO @DATA(lv_gbsta).
        IF lv_gbsta = 'C'.
          mo_collector->add_text( iv_type = 'E'
                                  iv_text = |Position { ls_frei-posnr } ist bereits erledigt| ).
          CONTINUE.
        ENDIF.

*       Manuelle Kondition vorhanden -> aendern, sonst neu
        SELECT SINGLE kschl FROM konv
          WHERE knumv = @ls_vbak-knumv
            AND kposn = @ls_frei-posnr
            AND kschl = @gc_kschl_manuell
          INTO @DATA(lv_kschl).
        lv_updkz = COND #( WHEN sy-subrc = 0 THEN 'U' ELSE 'I' ).

        APPEND VALUE #( itm_number = ls_frei-posnr
                        cond_type  = gc_kschl_manuell
                        cond_value = ls_frei-neupreis
                        currency   = ls_frei-waerk ) TO lt_cond.
        APPEND VALUE #( itm_number = ls_frei-posnr
                        cond_type  = gc_kschl_manuell
                        updateflag = lv_updkz
                        cond_value = abap_true
                        currency   = abap_true ) TO lt_condx.
      ENDLOOP.

      CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
        EXPORTING
          salesdocument    = lv_vbeln
          order_header_in  = ls_header_in
          order_header_inx = ls_header_inx
        TABLES
          return           = lt_return
          conditions_in    = lt_cond
          conditions_inx   = lt_condx.

      mo_collector->add_bapiret( lt_return ).
      mo_collector->raise_if_errors( ).

      CALL FUNCTION 'DEQUEUE_EVVBAKE'
        EXPORTING
          vbeln = lv_vbeln.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
