*&---------------------------------------------------------------------*
*&  Include           ZQM_ERG_ERFASSUNG_C02
*&---------------------------------------------------------------------*
*  Erfassung: Grid-Pruefung (DATA_CHANGED) und Sichern
*----------------------------------------------------------------------*

CLASS lcl_erfassung DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_data_changed
      FOR EVENT data_changed OF cl_gui_alv_grid
      IMPORTING er_data_changed.
    METHODS sichern
      RAISING lcx_erf.
  PRIVATE SECTION.
    METHODS vollstaendig_pruefen
      RAISING lcx_erf.
ENDCLASS.

CLASS lcl_erfassung IMPLEMENTATION.

*----------------------------------------------------------------------*
* Jede Eingabe sofort bewerten und die Bewertung ins Grid schreiben
*----------------------------------------------------------------------*
  METHOD on_data_changed.
    DATA: ls_cell TYPE lvc_s_modi,
          lo_bew  TYPE REF TO lif_bewerter,
          lv_bew  TYPE qbewertg,
          lx_erf  TYPE REF TO lcx_erf.

    LOOP AT er_data_changed->mt_good_cells INTO ls_cell
         WHERE fieldname = 'MESSWERT' OR fieldname = 'CODE'.
      ASSIGN gt_merk[ ls_cell-row_id ] TO FIELD-SYMBOL(<ls_m>).

      IF <ls_m>-status = 'X'.
        er_data_changed->add_protocol_entry(
          i_msgid     = 'ZQM'
          i_msgty     = 'E'
          i_msgno     = '403'
          i_msgv1     = <ls_m>-merknr
          i_fieldname = ls_cell-fieldname
          i_row_id    = ls_cell-row_id ).
        CONTINUE.
      ENDIF.

      lo_bew = lcl_bewerter_fabrik=>fuer( <ls_m> ).
      TRY.
          lv_bew = lo_bew->bewerten( is_merk = <ls_m>
                                     iv_wert = ls_cell-value ).
          er_data_changed->modify_cell( i_row_id    = ls_cell-row_id
                                        i_fieldname = 'BEWERTUNG'
                                        i_value     = lv_bew ).
        CATCH lcx_erf INTO lx_erf.
          er_data_changed->add_protocol_entry(
            i_msgid     = lx_erf->if_t100_message~t100key-msgid
            i_msgty     = 'E'
            i_msgno     = lx_erf->if_t100_message~t100key-msgno
            i_msgv1     = lx_erf->if_t100_dyn_msg~msgv1
            i_msgv2     = lx_erf->if_t100_dyn_msg~msgv2
            i_fieldname = ls_cell-fieldname
            i_row_id    = ls_cell-row_id ).
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Alle offenen Merkmale muessen bewertet sein
*----------------------------------------------------------------------*
  METHOD vollstaendig_pruefen.
    LOOP AT gt_merk INTO DATA(ls_m) WHERE status <> 'X' AND bewertung IS INITIAL.
      RAISE EXCEPTION TYPE lcx_erf
        MESSAGE e404(zqm) WITH ls_m-merknr ls_m-kurztext.
    ENDLOOP.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Ergebnisse zum Vorgang buchen; bei Zurueckweisung Maengel asynchron
*----------------------------------------------------------------------*
  METHOD sichern.
    DATA: lt_res    TYPE STANDARD TABLE OF bapi2045d2,
          lt_rettab TYPE STANDARD TABLE OF bapiret2,
          ls_return TYPE bapiret2.

    TRY.
        vollstaendig_pruefen( ).

        lt_res = VALUE #( FOR ls_m IN gt_merk WHERE ( status <> 'X' )
                          ( insplot    = p_los
                            inspoper   = p_vorg
                            inspchar   = ls_m-merknr
                            mean_value = ls_m-messwert
                            code1      = ls_m-code
                            code_grp1  = ls_m-auswmenge1
                            evaluation = ls_m-bewertung ) ).

        CALL FUNCTION 'BAPI_INSPOPER_RECORDRESULTS'
          EXPORTING
            insplot      = p_los
            inspoper     = p_vorg
          IMPORTING
            return       = ls_return
          TABLES
            char_results = lt_res
            returntable  = lt_rettab.
        IF ls_return-type CA 'EA'.
          RAISE EXCEPTION TYPE lcx_erf
            MESSAGE ID ls_return-id TYPE 'E' NUMBER ls_return-number
            WITH ls_return-message_v1 ls_return-message_v2.
        ENDIF.

        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        lcl_log=>add( |{ p_los }/{ p_vorg }: { lines( lt_res ) } Ergebnisse gebucht| ).

      CLEANUP.
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        lcl_log=>add( |{ p_los }/{ p_vorg }: Rollback| ).
    ENDTRY.

*   Zurueckgewiesene Merkmale: Maengelmeldung Q2 im Hintergrund anlegen
*   (dauert bis 20 s, Laborant soll nicht warten - Absprache 2018)
    IF line_exists( gt_merk[ bewertung = 'R' status = space ] ).
      CALL FUNCTION 'Z_QM_MAENGEL_ANLEGEN'
        STARTING NEW TASK 'ZQM_MAENGEL'
        DESTINATION 'NONE'
        EXPORTING
          iv_prueflos = p_los
          iv_vorgang  = p_vorg.
    ENDIF.

*   gebuchte Merkmale im Grid sperren
    MODIFY gt_merk FROM VALUE #( status = 'X' ) TRANSPORTING status
           WHERE status = space.
  ENDMETHOD.

ENDCLASS.
