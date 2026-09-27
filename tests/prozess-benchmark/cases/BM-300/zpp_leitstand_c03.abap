*&---------------------------------------------------------------------*
*&  Include           ZPP_LEITSTAND_C03
*&---------------------------------------------------------------------*
*  Die drei Aktionen
*----------------------------------------------------------------------*

*----------------------------------------------------------------------*
* Vorziehen: Eckstarttermin des Auftrags um einen Tag frueher
*----------------------------------------------------------------------*
CLASS lcl_akt_vorziehen IMPLEMENTATION.
  METHOD durchfuehren.
    DATA: ls_data   TYPE bapi_pp_order_change,
          ls_datax  TYPE bapi_pp_order_changex,
          ls_return TYPE bapiret2,
          lv_neu    TYPE datum.

    lv_neu = is_vorg-fsavd - 1.
    IF lv_neu < sy-datum.
      RAISE EXCEPTION TYPE lcx_leit
        MESSAGE e810(zpp_ls) WITH is_vorg-aufnr lv_neu.  "Vergangenheit
    ENDIF.

    ls_data-basic_start_date  = lv_neu.
    ls_datax-basic_start_date = abap_true.
    CALL FUNCTION 'BAPI_PRODORD_CHANGE'
      EXPORTING
        number     = is_vorg-aufnr
        orderdata  = ls_data
        orderdatax = ls_datax
      IMPORTING
        return     = ls_return.
    IF ls_return-type CA 'EA'.
      RAISE EXCEPTION TYPE lcx_leit
        MESSAGE ID ls_return-id TYPE 'E' NUMBER ls_return-number
        WITH ls_return-message_v1 ls_return-message_v2.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Freigeben: Auftrag freigeben (Status FREI)
*----------------------------------------------------------------------*
CLASS lcl_akt_freigeben IMPLEMENTATION.
  METHOD durchfuehren.
    DATA: lt_orders TYPE STANDARD TABLE OF bapi_order_key,
          lt_detret TYPE STANDARD TABLE OF bapi_order_return,
          ls_return TYPE bapiret2.

    APPEND VALUE #( order_number = is_vorg-aufnr ) TO lt_orders.
    CALL FUNCTION 'BAPI_PRODORD_RELEASE'
      IMPORTING
        return        = ls_return
      TABLES
        orders        = lt_orders
        detail_return = lt_detret.
    IF ls_return-type CA 'EA'.
      RAISE EXCEPTION TYPE lcx_leit
        MESSAGE ID ls_return-id TYPE 'E' NUMBER ls_return-number
        WITH ls_return-message_v1 ls_return-message_v2.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Drucken: Arbeitspapiere asynchron (Druck dauert, Meister wartet nicht)
*----------------------------------------------------------------------*
CLASS lcl_akt_drucken IMPLEMENTATION.
  METHOD durchfuehren.
    DATA lv_task TYPE c LENGTH 32.

    lv_task = |DRUCK{ is_vorg-aufnr }|.
    CALL FUNCTION 'Z_PP_ARBEITSPAPIERE'
      STARTING NEW TASK lv_task
      DESTINATION IN GROUP DEFAULT
      CALLING druck_fertig ON END OF TASK
      EXPORTING
        iv_aufnr = is_vorg-aufnr
        iv_vornr = is_vorg-vornr
      EXCEPTIONS
        communication_failure = 1
        system_failure        = 2
        resource_failure      = 3.
  ENDMETHOD.

* Rueckmeldung des Drucks, sobald die Task fertig ist
  METHOD druck_fertig.
    DATA lv_spool TYPE rspoid.

    RECEIVE RESULTS FROM FUNCTION 'Z_PP_ARBEITSPAPIERE'
      IMPORTING
        ev_spoolid = lv_spool
      EXCEPTIONS
        communication_failure = 1
        system_failure        = 2
        OTHERS                = 3.
    IF sy-subrc <> 0 OR lv_spool IS INITIAL.
      MESSAGE i811(zpp_ls) WITH p_task.              "Druck fehlgeschlagen
    ENDIF.
*   Erfolgsmeldung mit Spoolnummer 2019 entfernt (stoerte beim Scrollen)
  ENDMETHOD.
ENDCLASS.
