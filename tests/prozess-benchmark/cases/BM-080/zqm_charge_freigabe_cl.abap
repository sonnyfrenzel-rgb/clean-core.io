*&---------------------------------------------------------------------*
*& Include ZQM_CHARGE_FREIGABE_CL - Bewertungsregeln
*&---------------------------------------------------------------------*
CLASS lcl_bewertung DEFINITION FINAL.
  PUBLIC SECTION.
    "! Entscheidung A (annehmen), R (zurueckweisen), O (offen)
    METHODS bewerten
      IMPORTING iv_prueflos      TYPE qplos
      EXPORTING ev_text          TYPE csequence
      RETURNING VALUE(rv_entsch) TYPE char1.

  PRIVATE SECTION.
    TYPES: BEGIN OF ty_vorgabe,
             vorglfnr  TYPE qlfnkn,
             merknr    TYPE qmerknrp,
             kurztext  TYPE qmerktext,
             toleranzob TYPE qtolob,
             toleranzun TYPE qtolun,
             steuerkz  TYPE qmkst,
           END OF ty_vorgabe,
           BEGIN OF ty_ergebnis,
             vorglfnr  TYPE qlfnkn,
             merknr    TYPE qmerknrp,
             mittelwert TYPE qmittelwt,
             mbewertg  TYPE qmbewertg,
           END OF ty_ergebnis.

    METHODS toleranz_verletzt
      IMPORTING is_vorgabe       TYPE ty_vorgabe
                is_ergebnis      TYPE ty_ergebnis
      RETURNING VALUE(rv_verl)   TYPE abap_bool.
ENDCLASS.


CLASS lcl_bewertung IMPLEMENTATION.

  METHOD bewerten.
    DATA: lt_vorgabe  TYPE STANDARD TABLE OF ty_vorgabe,
          ls_vorgabe  TYPE ty_vorgabe,
          lt_ergebnis TYPE SORTED TABLE OF ty_ergebnis
                        WITH UNIQUE KEY vorglfnr merknr,
          ls_ergebnis TYPE ty_ergebnis.

    CLEAR ev_text.
    rv_entsch = gc_annahme.

    SELECT vorglfnr merknr kurztext toleranzob toleranzun steuerkz
      FROM qamv
      INTO TABLE lt_vorgabe
      WHERE prueflos = iv_prueflos.
    IF sy-subrc <> 0.
      rv_entsch = gc_offen.
      ev_text   = 'Keine Pruefmerkmale'.
      RETURN.
    ENDIF.

    SELECT vorglfnr merknr mittelwert mbewertg
      FROM qamr
      INTO TABLE lt_ergebnis
      WHERE prueflos = iv_prueflos.

    LOOP AT lt_vorgabe INTO ls_vorgabe.
      READ TABLE lt_ergebnis INTO ls_ergebnis
        WITH TABLE KEY vorglfnr = ls_vorgabe-vorglfnr
                       merknr   = ls_vorgabe-merknr.
      IF sy-subrc <> 0 OR ls_ergebnis-mbewertg IS INITIAL.
*       Kannmerkmale (Steuerkz. Position 4 = ' ') duerfen fehlen
        IF ls_vorgabe-steuerkz+3(1) = space.
          CONTINUE.
        ENDIF.
        rv_entsch = gc_offen.
        ev_text   = |Merkmal { ls_vorgabe-merknr } ({ ls_vorgabe-kurztext }) fehlt|.
        RETURN.
      ENDIF.

      IF ls_ergebnis-mbewertg = 'R'.
        rv_entsch = gc_rueckw.
        ev_text   = |Merkmal { ls_vorgabe-merknr } zurueckgewiesen|.
        RETURN.
      ENDIF.

*     2017-02: Pruefer bewerten manchmal A trotz Toleranzverletzung
      DATA(lv_verletzt) = toleranz_verletzt( is_vorgabe  = ls_vorgabe
                                             is_ergebnis = ls_ergebnis ).
      IF lv_verletzt = abap_true.
        rv_entsch = gc_rueckw.
        ev_text   = |Merkmal { ls_vorgabe-merknr } ausserhalb Toleranz|.
        RETURN.
      ENDIF.
    ENDLOOP.

    ev_text = 'Alle Merkmale in Ordnung'.
  ENDMETHOD.


  METHOD toleranz_verletzt.
    rv_verl = abap_false.
    IF is_vorgabe-toleranzob IS NOT INITIAL
       AND is_ergebnis-mittelwert > is_vorgabe-toleranzob.
      rv_verl = abap_true.
    ELSEIF is_vorgabe-toleranzun IS NOT INITIAL
       AND is_ergebnis-mittelwert < is_vorgabe-toleranzun.
      rv_verl = abap_true.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
