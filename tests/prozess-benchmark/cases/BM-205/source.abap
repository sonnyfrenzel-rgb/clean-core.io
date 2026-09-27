REPORT zmm_soft_reserve.
*----------------------------------------------------------------------*
* Weiche Bestandsreservierung fuer Kundenauftraege (ohne RESB)
* Sperrverwaltung ueber lokale Sperr-Manager-Klasse
* 05.2018 JNE  Anforderung Produktion/Vertrieb, Ticket 4711
*----------------------------------------------------------------------*
PARAMETERS: p_matnr TYPE matnr   OBLIGATORY,
            p_werks TYPE werks_d OBLIGATORY,
            p_lgort TYPE lgort_d OBLIGATORY,
            p_vbeln TYPE vbeln_va OBLIGATORY,
            p_menge TYPE menge_d OBLIGATORY.

CLASS lcx_locked DEFINITION INHERITING FROM cx_static_check.
ENDCLASS.
CLASS lcx_insufficient DEFINITION INHERITING FROM cx_static_check.
ENDCLASS.

CLASS lcl_lock_manager DEFINITION.
  PUBLIC SECTION.
    METHODS acquire RAISING lcx_locked.
    METHODS release.
ENDCLASS.

CLASS lcl_lock_manager IMPLEMENTATION.
  METHOD acquire.
    CALL FUNCTION 'ENQUEUE_EZMM_SOFTRESV'
      EXPORTING
        matnr          = p_matnr
        werks          = p_werks
        lgort          = p_lgort
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_locked.
    ENDIF.
  ENDMETHOD.

  METHOD release.
    CALL FUNCTION 'DEQUEUE_EZMM_SOFTRESV'
      EXPORTING
        matnr = p_matnr
        werks = p_werks
        lgort = p_lgort.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_reservation DEFINITION.
  PUBLIC SECTION.
    METHODS reserve RAISING lcx_insufficient.
ENDCLASS.

CLASS lcl_reservation IMPLEMENTATION.
  METHOD reserve.
    DATA: lv_labst TYPE labst,
          lv_resv  TYPE menge_d,
          ls_resv  TYPE zmm_soft_resv.

    SELECT SINGLE labst FROM mard INTO lv_labst
      WHERE matnr = p_matnr AND werks = p_werks AND lgort = p_lgort.
*   bereits weich reservierte Menge anderer Auftraege
    SELECT SUM( menge ) FROM zmm_soft_resv INTO lv_resv
      WHERE matnr = p_matnr AND werks = p_werks AND lgort = p_lgort
        AND erledigt = space.
    IF lv_labst - lv_resv < p_menge.
      RAISE EXCEPTION TYPE lcx_insufficient.
    ENDIF.

    ls_resv-matnr = p_matnr.
    ls_resv-werks = p_werks.
    ls_resv-lgort = p_lgort.
    ls_resv-vbeln = p_vbeln.
    ls_resv-menge = p_menge.
    ls_resv-ernam = sy-uname.
    ls_resv-erdat = sy-datum.
    INSERT zmm_soft_resv FROM ls_resv.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  DATA(go_lock) = NEW lcl_lock_manager( ).
  DATA(go_resv) = NEW lcl_reservation( ).

  TRY.
      go_lock->acquire( ).
      go_resv->reserve( ).
      COMMIT WORK.
      MESSAGE s398(00) WITH 'Menge reserviert fuer Auftrag' p_vbeln.
    CATCH lcx_locked.
      MESSAGE i398(00) WITH 'Material/Lagerort wird gerade bearbeitet'.
    CATCH lcx_insufficient.
      MESSAGE i398(00) WITH 'Nicht genug freier Bestand'.
  ENDTRY.

  go_lock->release( ).
