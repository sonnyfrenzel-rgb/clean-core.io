*&---------------------------------------------------------------------*
*&  Include           ZPP_TERMINAL_C02
*&---------------------------------------------------------------------*
*  Zeitereignisse Start (B10) / Ende (B40) zum Fertigungsvorgang
*----------------------------------------------------------------------*

CLASS lcl_zeitereignis DEFINITION ABSTRACT.
  PUBLIC SECTION.
    INTERFACES lif_schritt.
  PROTECTED SECTION.
    METHODS satzart ABSTRACT
      RETURNING VALUE(rv_satzart) TYPE ru_satza.
  PRIVATE SECTION.
    METHODS pruefen_vorgang
      IMPORTING is_term TYPE ty_term
      RAISING   lcx_terminal.
ENDCLASS.

CLASS lcl_zeitereignis IMPLEMENTATION.

  METHOD lif_schritt~ausfuehren.
    DATA: lt_te     TYPE STANDARD TABLE OF bapi_pp_timeevent,
          lt_detret TYPE STANDARD TABLE OF bapi_coru_return,
          ls_return TYPE bapiret1.

    IF cs_term-pernr IS INITIAL.
      RAISE EXCEPTION TYPE lcx_terminal
        MESSAGE e312(zpp_t).                        "bitte erst anmelden
    ENDIF.

    pruefen_vorgang( cs_term ).

    APPEND VALUE #( orderid    = cs_term-aufnr
                    operation  = cs_term-vornr
                    recordtype = satzart( )
                    pers_no    = cs_term-pernr
                    plant      = cs_term-werks
                    logdate    = sy-datum
                    logtime    = sy-uzeit ) TO lt_te.

    CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TE'
      IMPORTING
        return        = ls_return
      TABLES
        timeevents    = lt_te
        detail_return = lt_detret.
    IF ls_return-type CA 'EA'.
*     kein Rollback - BAPI bucht bei Fehler nichts (OSS-Hinweis im Ticket)
      RAISE EXCEPTION TYPE lcx_terminal
        MESSAGE ID ls_return-id TYPE 'E' NUMBER ls_return-number
        WITH ls_return-message_v1 ls_return-message_v2.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDMETHOD.

  METHOD pruefen_vorgang.
    SELECT SINGLE v~arbid
      FROM afko AS k
      INNER JOIN afvc AS v ON v~aufpl = k~aufpl
      WHERE k~aufnr = @is_term-aufnr
        AND v~vornr = @is_term-vornr
      INTO @DATA(lv_arbid).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_terminal
        MESSAGE e313(zpp_t) WITH is_term-aufnr is_term-vornr.
    ENDIF.
*   Vorgang muss am Arbeitsplatz des Werkers eingeplant sein
    IF lv_arbid <> is_term-arbid.
      RAISE EXCEPTION TYPE lcx_terminal
        MESSAGE e314(zpp_t) WITH is_term-vornr.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

CLASS lcl_start DEFINITION INHERITING FROM lcl_zeitereignis FINAL.
  PROTECTED SECTION.
    METHODS satzart REDEFINITION.
ENDCLASS.
CLASS lcl_start IMPLEMENTATION.
  METHOD satzart.
    rv_satzart = 'B10'.                              "Bearbeitungsbeginn
  ENDMETHOD.
ENDCLASS.

CLASS lcl_ende DEFINITION INHERITING FROM lcl_zeitereignis FINAL.
  PROTECTED SECTION.
    METHODS satzart REDEFINITION.
ENDCLASS.
CLASS lcl_ende IMPLEMENTATION.
  METHOD satzart.
    rv_satzart = 'B40'.                              "Bearbeitungsende
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_schritt_fabrik IMPLEMENTATION.
  METHOD fuer_okcode.
    CASE iv_okcode.
      WHEN 'ANME'.
        ro_schritt = NEW lcl_anmelden( ).
      WHEN 'STRT'.
        ro_schritt = NEW lcl_start( ).
      WHEN 'ENDE'.
        ro_schritt = NEW lcl_ende( ).
*     WHEN 'UNTB'.                  "Unterbrechung B20 - nie freigegeben
*       ro_schritt = NEW lcl_unterbrechung( ).
      WHEN OTHERS.
        RAISE EXCEPTION TYPE lcx_terminal
          MESSAGE e310(zpp_t) WITH iv_okcode.
    ENDCASE.
  ENDMETHOD.
ENDCLASS.
