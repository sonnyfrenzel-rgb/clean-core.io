*&---------------------------------------------------------------------*
*&  Include           ZSD_KASSE_BARVERKAUF_C01
*&---------------------------------------------------------------------*
*  Kassenlogik: Positionen, Preisfindung am Grid, Buchung Barverkauf
*----------------------------------------------------------------------*
CLASS lcl_kasse DEFINITION FINAL.
  PUBLIC SECTION.
    DATA mt_pos TYPE tt_pos.

    METHODS has_open_items
      RETURNING VALUE(rv_open) TYPE abap_bool.
    METHODS buchen.
    METHODS on_data_changed
      FOR EVENT data_changed OF cl_gui_alv_grid
      IMPORTING er_data_changed.
ENDCLASS.

CLASS lcl_kasse IMPLEMENTATION.

  METHOD has_open_items.
    rv_open = xsdbool( mt_pos IS NOT INITIAL ).
  ENDMETHOD.

*----------------------------------------------------------------------*
*  Preis aus Konditionssatz PR00 nachlesen, sobald Material erfasst
*----------------------------------------------------------------------*
  METHOD on_data_changed.
    DATA: ls_cell  TYPE lvc_s_modi,
          lv_matnr TYPE matnr,
          lv_knumh TYPE knumh,
          lv_kbetr TYPE kbetr.

    LOOP AT er_data_changed->mt_mod_cells INTO ls_cell.
      CASE ls_cell-fieldname.
        WHEN 'MATNR'.
          lv_matnr = ls_cell-value.
          SELECT SINGLE knumh FROM a004 INTO lv_knumh
            WHERE kappl = 'V'
              AND kschl = 'PR00'
              AND vkorg = p_vkorg
              AND vtweg = gc_vtweg
              AND matnr = lv_matnr
              AND datbi >= sy-datum
              AND datab <= sy-datum.
          IF sy-subrc <> 0.
            er_data_changed->add_protocol_entry(
              i_msgid     = 'ZPOS'
              i_msgty     = 'E'
              i_msgno     = '401'
              i_msgv1     = ls_cell-value
              i_fieldname = ls_cell-fieldname
              i_row_id    = ls_cell-row_id ).
            CONTINUE.
          ENDIF.
          SELECT SINGLE kbetr FROM konp INTO lv_kbetr
            WHERE knumh = lv_knumh
              AND kopos = '01'.
          er_data_changed->modify_cell( i_row_id    = ls_cell-row_id
                                        i_fieldname = 'PREIS'
                                        i_value     = lv_kbetr ).
*       WHEN 'MENGE'.     "Mengenpruefung macht jetzt das Grid (Domaene)
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.

*----------------------------------------------------------------------*
*  Barverkauf buchen: Sofortauftrag ZBV an CPD-Kunde
*----------------------------------------------------------------------*
  METHOD buchen.
    DATA: ls_header  TYPE bapisdhd1,
          lt_items   TYPE STANDARD TABLE OF bapisditm,
          lt_partner TYPE STANDARD TABLE OF bapiparnr,
          lt_sched   TYPE STANDARD TABLE OF bapischdl,
          lt_return  TYPE STANDARD TABLE OF bapiret2,
          ls_return  TYPE bapiret2,
          lv_vbeln   TYPE vbeln_va,
          lv_summe   TYPE netwr,
          ls_journal TYPE zpos_journal,
          lv_frage   TYPE string.

    CHECK mt_pos IS NOT INITIAL.

    lv_summe = REDUCE netwr( INIT s TYPE netwr
                             FOR ls_p IN mt_pos
                             NEXT s = s + ls_p-menge * ls_p-preis ).
    lt_items = VALUE #( FOR ls_p IN mt_pos ( itm_number = ls_p-posnr
                                             material   = ls_p-matnr
                                             target_qty = ls_p-menge ) ).
    lt_sched = VALUE #( FOR ls_p IN mt_pos ( itm_number = ls_p-posnr
                                             req_qty    = ls_p-menge ) ).

    lv_frage = |Betrag { lv_summe } kassiert?|.
    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar       = 'Barverkauf'(t10)
        text_question  = lv_frage
        default_button = '1'
      IMPORTING
        answer         = gv_answer.
    CHECK gv_answer = '1'.

    ls_header-doc_type   = gc_auart.
    ls_header-sales_org  = p_vkorg.
    ls_header-distr_chan = gc_vtweg.
    ls_header-division   = gc_spart.
    ls_header-sales_off  = p_vkbur.
    ls_header-purch_no_c = |KASSE { p_kasse } { sy-datum }|.
    APPEND VALUE #( partn_role = 'AG' partn_numb = gc_cpd_kund ) TO lt_partner.

    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in    = ls_header
      IMPORTING
        salesdocument      = lv_vbeln
      TABLES
        return             = lt_return
        order_items_in     = lt_items
        order_partners     = lt_partner
        order_schedules_in = lt_sched.

    IF lv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
      MESSAGE ls_return-message TYPE 'I' DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

*   Kassenjournal fuer den Tagesabschluss
    ls_journal-mandt = sy-mandt.
    ls_journal-kasse = p_kasse.
    ls_journal-datum = sy-datum.
    ls_journal-uzeit = sy-uzeit.
    ls_journal-vbeln = lv_vbeln.
    ls_journal-betrag = lv_summe.
    ls_journal-kassierer = sy-uname.
    INSERT zpos_journal FROM ls_journal.

    MESSAGE s403(zpos) WITH lv_vbeln lv_summe.
    CLEAR mt_pos.
*   go_grid->refresh_table_display( ).   "macht PBO nicht - TODO Ticket 5512
  ENDMETHOD.

ENDCLASS.
