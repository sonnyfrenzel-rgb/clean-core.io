*&---------------------------------------------------------------------*
*&  Include           ZHR_UEBERSTUNDEN_CLS
*&  Regelklassen fuer die Verguetung von Mehrarbeit
*&---------------------------------------------------------------------*

*----------------------------------------------------------------------*
* Ausnahmen
*----------------------------------------------------------------------*
CLASS lcx_regel DEFINITION INHERITING FROM cx_static_check.
ENDCLASS.

CLASS lcx_keine_orgzuordnung DEFINITION INHERITING FROM lcx_regel.
ENDCLASS.

CLASS lcx_keine_regel DEFINITION INHERITING FROM lcx_regel.
ENDCLASS.

*----------------------------------------------------------------------*
* Basisklasse
*----------------------------------------------------------------------*
CLASS lcl_regel DEFINITION ABSTRACT.
  PUBLIC SECTION.
    CLASS-METHODS fabrik
      IMPORTING iv_pernr        TYPE persno
                iv_datum        TYPE datum
      RETURNING VALUE(ro_regel) TYPE REF TO lcl_regel
      RAISING   lcx_regel.
    METHODS:
      pruefen
        IMPORTING iv_stunden   TYPE catshours
        RETURNING VALUE(rv_ok) TYPE abap_bool,
      lohnart
        RETURNING VALUE(rv_lgart) TYPE lgart,
      umrechnen ABSTRACT
        IMPORTING iv_stunden      TYPE catshours
        RETURNING VALUE(rv_anzhl) TYPE ptm_quonum.
  PROTECTED SECTION.
    DATA ms_cust TYPE zhr_ot_regel.
ENDCLASS.

*----------------------------------------------------------------------*
* Tarifmitarbeiter: Stunden * Zuschlagsfaktor
*----------------------------------------------------------------------*
CLASS lcl_regel_tarif DEFINITION INHERITING FROM lcl_regel.
  PUBLIC SECTION.
    METHODS umrechnen REDEFINITION.
ENDCLASS.

*----------------------------------------------------------------------*
* AT-Mitarbeiter: Freistunden mit Gehalt abgegolten
*----------------------------------------------------------------------*
CLASS lcl_regel_at DEFINITION INHERITING FROM lcl_regel.
  PUBLIC SECTION.
    METHODS:
      pruefen   REDEFINITION,
      umrechnen REDEFINITION.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_regel IMPLEMENTATION.

  METHOD fabrik.
    DATA: lv_persk TYPE persk,
          ls_cust  TYPE zhr_ot_regel.

    SELECT SINGLE persk FROM pa0001 INTO lv_persk
      WHERE pernr = iv_pernr
        AND begda <= iv_datum
        AND endda >= iv_datum.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_keine_orgzuordnung.
    ENDIF.

    SELECT SINGLE * FROM zhr_ot_regel INTO ls_cust
      WHERE persk = lv_persk.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_keine_regel.
    ENDIF.

    CASE ls_cust-regeltyp.
      WHEN 'T'.
        CREATE OBJECT ro_regel TYPE lcl_regel_tarif.
      WHEN 'A'.
        CREATE OBJECT ro_regel TYPE lcl_regel_at.
      WHEN OTHERS.
        RAISE EXCEPTION TYPE lcx_keine_regel.
    ENDCASE.

    ro_regel->ms_cust = ls_cust.
  ENDMETHOD.

  METHOD pruefen.
*   Monatshoechstgrenze laut Betriebsvereinbarung
    rv_ok = xsdbool( iv_stunden <= ms_cust-max_stunden ).
  ENDMETHOD.

  METHOD lohnart.
    rv_lgart = ms_cust-lgart.
  ENDMETHOD.

ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_regel_tarif IMPLEMENTATION.

  METHOD umrechnen.
    rv_anzhl = iv_stunden * ms_cust-faktor.
  ENDMETHOD.

ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_regel_at IMPLEMENTATION.

  METHOD pruefen.
    IF iv_stunden <= ms_cust-freistunden.
      rv_ok = abap_false.
      RETURN.
    ENDIF.
    rv_ok = super->pruefen( iv_stunden ).
  ENDMETHOD.

  METHOD umrechnen.
*   nur Stunden oberhalb der Freistunden, ohne Zuschlag
    rv_anzhl = iv_stunden - ms_cust-freistunden.
  ENDMETHOD.

ENDCLASS.
