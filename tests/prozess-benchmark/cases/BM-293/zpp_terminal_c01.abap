*&---------------------------------------------------------------------*
*&  Include           ZPP_TERMINAL_C01
*&---------------------------------------------------------------------*
*  Ausnahme, Schritt-Interface, Fabrik, Anmeldung
*----------------------------------------------------------------------*

CLASS lcx_terminal DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.
CLASS lcx_terminal IMPLEMENTATION.
ENDCLASS.

INTERFACE lif_schritt.
  METHODS ausfuehren
    CHANGING cs_term TYPE ty_term
    RAISING  lcx_terminal.
ENDINTERFACE.

*----------------------------------------------------------------------*
* Anmeldung per Werksausweis
*----------------------------------------------------------------------*
CLASS lcl_anmelden DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_schritt.
ENDCLASS.

CLASS lcl_anmelden IMPLEMENTATION.
  METHOD lif_schritt~ausfuehren.
    SELECT SINGLE pernr, werks, arbid
      FROM zpp_werker
      WHERE ausweis = @cs_term-ausweis
        AND aktiv   = @abap_true
      INTO @DATA(ls_werker).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_terminal
        MESSAGE e311(zpp_t) WITH cs_term-ausweis.   "Ausweis unbekannt
    ENDIF.

    cs_term-pernr = ls_werker-pernr.
    cs_term-werks = ls_werker-werks.
    cs_term-arbid = ls_werker-arbid.

*   Sitzung fuer Anwesenheitsauswertung (ZPP_ANWESENHEIT)
    MODIFY zpp_term_sess FROM @( VALUE zpp_term_sess( terminal = cs_term-terminal
                                                      pernr    = cs_term-pernr
                                                      datum    = sy-datum
                                                      uzeit    = sy-uzeit ) ).
  ENDMETHOD.
ENDCLASS.

CLASS lcl_start DEFINITION DEFERRED.
CLASS lcl_ende DEFINITION DEFERRED.

*----------------------------------------------------------------------*
* Fabrik: Funktionscode -> Schritt
*----------------------------------------------------------------------*
CLASS lcl_schritt_fabrik DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS fuer_okcode
      IMPORTING iv_okcode         TYPE sy-ucomm
      RETURNING VALUE(ro_schritt) TYPE REF TO lif_schritt
      RAISING   lcx_terminal.
ENDCLASS.
