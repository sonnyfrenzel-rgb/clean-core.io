*----------------------------------------------------------------------*
***INCLUDE LZWM_RF_INVC01.
*----------------------------------------------------------------------*
*  Zaehllogik je Lagerplatz
*----------------------------------------------------------------------*

CLASS lcx_rf_inv DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_rf_inv IMPLEMENTATION.
ENDCLASS.

CLASS lcl_zaehlung DEFINITION FINAL.
  PUBLIC SECTION.
    DATA: mv_ivnum TYPE lvs_ivnum READ-ONLY,
          mt_zaehl TYPE tt_zaehl READ-ONLY.
    METHODS platz_pruefen
      IMPORTING iv_lgpla TYPE lgpla
      RAISING   lcx_rf_inv.
    METHODS quant_erfassen
      IMPORTING iv_matnr TYPE matnr
                iv_charg TYPE charg_d
                iv_menge TYPE lvs_gesme
      RAISING   lcx_rf_inv.
    METHODS leerplatz
      RAISING lcx_rf_inv.
    METHODS nachzaehlung_noetig
      RETURNING VALUE(rv_ja) TYPE abap_bool.
    METHODS speichern
      RAISING lcx_rf_inv.
    METHODS freigeben.
    METHODS anzahl
      RETURNING VALUE(rv_anz) TYPE i.
  PRIVATE SECTION.
    DATA mv_lgpla TYPE lgpla.
ENDCLASS.

CLASS lcl_zaehlung IMPLEMENTATION.

*----------------------------------------------------------------------*
* Platz muss in einem aktiven, noch nicht gezaehlten Inventurbeleg stehen
*----------------------------------------------------------------------*
  METHOD platz_pruefen.
    DATA lv_istat TYPE linv-istat.

    SELECT SINGLE ivnum istat FROM linv
      INTO (mv_ivnum, lv_istat)
      WHERE lgnum = gv_lgnum
        AND lgpla = iv_lgpla.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_rf_inv
        MESSAGE e101 WITH iv_lgpla.            "kein Inventurbeleg zum Platz
    ENDIF.
    IF lv_istat <> 'N'.                        "N = nicht gezaehlt
      RAISE EXCEPTION TYPE lcx_rf_inv
        MESSAGE e102 WITH iv_lgpla lv_istat.
    ENDIF.

    CALL FUNCTION 'ENQUEUE_EZWM_INVPL'
      EXPORTING
        lgnum          = gv_lgnum
        lgpla          = iv_lgpla
      EXCEPTIONS
        foreign_lock   = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_rf_inv
        MESSAGE e103 WITH iv_lgpla sy-msgv1.
    ENDIF.

    mv_lgpla = iv_lgpla.
    SELECT lqnum matnr charg gesme AS soll meins
      FROM linv
      INTO CORRESPONDING FIELDS OF TABLE mt_zaehl
      WHERE lgnum = gv_lgnum
        AND ivnum = mv_ivnum
        AND lgpla = iv_lgpla.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Gescannten Quant zaehlen; unerwartetes Material nur nach Rueckfrage
*----------------------------------------------------------------------*
  METHOD quant_erfassen.
    READ TABLE mt_zaehl ASSIGNING FIELD-SYMBOL(<ls_z>)
         WITH KEY matnr = iv_matnr charg = iv_charg.
    IF sy-subrc = 0.
      <ls_z>-menge = <ls_z>-menge + iv_menge.
      RETURN.
    ENDIF.

    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar              = 'Fremdmaterial'(t01)
        text_question         = 'Material nicht im Beleg. Trotzdem zaehlen?'(q01)
        default_button        = '2'
        display_cancel_button = space
      IMPORTING
        answer                = gv_answer.
    IF gv_answer <> '1'.
      RAISE EXCEPTION TYPE lcx_rf_inv
        MESSAGE e104 WITH iv_matnr.            "Scan verworfen
    ENDIF.

    APPEND VALUE #( matnr = iv_matnr charg = iv_charg menge = iv_menge
                    fremd = abap_true ) TO mt_zaehl.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Leerplatz bestaetigen: alle erwarteten Quants mit Menge 0
*----------------------------------------------------------------------*
  METHOD leerplatz.
    LOOP AT mt_zaehl ASSIGNING FIELD-SYMBOL(<ls_z>).
      IF <ls_z>-menge > 0.
        RAISE EXCEPTION TYPE lcx_rf_inv
          MESSAGE e106 WITH <ls_z>-matnr.       "schon Menge gezaehlt
      ENDIF.
      <ls_z>-menge = 0.
    ENDLOOP.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Nachzaehlung, wenn irgendeine Position mehr als 2 % abweicht
*----------------------------------------------------------------------*
  METHOD nachzaehlung_noetig.
    LOOP AT mt_zaehl INTO DATA(ls_z) WHERE fremd = abap_false.
      IF ls_z-soll = 0 OR
         abs( ls_z-menge - ls_z-soll ) * 100 / ls_z-soll > gc_toleranz_proz.
        rv_ja = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

*----------------------------------------------------------------------*
* Zaehlergebnis an WM uebergeben
*----------------------------------------------------------------------*
  METHOD speichern.
    DATA lt_linv TYPE STANDARD TABLE OF linv_vb.

    lt_linv = VALUE #( FOR ls_z IN mt_zaehl
                       ( lgnum = gv_lgnum ivnum = mv_ivnum lgpla = mv_lgpla
                         lqnum = ls_z-lqnum matnr = ls_z-matnr charg = ls_z-charg
                         menga = ls_z-menge altme = ls_z-meins ) ).

    CALL FUNCTION 'L_INV_COUNT_EXT'
      EXPORTING
        i_lgnum  = gv_lgnum
        i_ivnum  = mv_ivnum
        i_commit = space
      TABLES
        t_linv   = lt_linv
      EXCEPTIONS
        OTHERS   = 1.
    IF sy-subrc <> 0.
      ROLLBACK WORK.
      RAISE EXCEPTION TYPE lcx_rf_inv
        MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
        WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
    ENDIF.

    COMMIT WORK AND WAIT.
    zcl_wm_rf_log=>schreiben( iv_lgnum = gv_lgnum iv_text = |INV { mv_ivnum } { mv_lgpla }| ).
    freigeben( ).
  ENDMETHOD.

  METHOD freigeben.
    CALL FUNCTION 'DEQUEUE_EZWM_INVPL'
      EXPORTING
        lgnum = gv_lgnum
        lgpla = mv_lgpla.
    CLEAR: mv_lgpla, mv_ivnum, mt_zaehl.
  ENDMETHOD.

  METHOD anzahl.
    rv_anz = lines( mt_zaehl ).
  ENDMETHOD.

ENDCLASS.
