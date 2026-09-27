*&---------------------------------------------------------------------*
*&  Include           ZHR_JUBILAEUM_CLS
*&---------------------------------------------------------------------*
CLASS lcx_kein_datum DEFINITION INHERITING FROM cx_static_check.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_jubilaeum DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS:
      eintritt
        IMPORTING iv_pernr        TYPE persno
        RETURNING VALUE(rv_datum) TYPE datum
        RAISING   lcx_kein_datum,
      stufe_ermitteln
        IMPORTING iv_jahre        TYPE i
        RETURNING VALUE(rv_stufe) TYPE char2,
      praemie
        IMPORTING iv_stufe         TYPE char2
                  iv_werks         TYPE persa
        RETURNING VALUE(rv_betrag) TYPE betrg.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_jubilaeum IMPLEMENTATION.

  METHOD eintritt.
    DATA: ls_p0041 TYPE pa0041,
          lv_dar   TYPE datar,
          lv_dat   TYPE dardt.

*   Datumsangaben (IT0041), Datumsart 01 = Eintritt Konzern
    SELECT SINGLE * FROM pa0041 INTO ls_p0041
      WHERE pernr = iv_pernr
        AND begda <= sy-datum
        AND endda >= sy-datum.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_kein_datum.
    ENDIF.

    DO 12 TIMES VARYING lv_dar FROM ls_p0041-dar01 NEXT ls_p0041-dar02
                VARYING lv_dat FROM ls_p0041-dat01 NEXT ls_p0041-dat02.
      IF lv_dar = '01'.
        rv_datum = lv_dat.
        RETURN.
      ENDIF.
    ENDDO.

    RAISE EXCEPTION TYPE lcx_kein_datum.
  ENDMETHOD.

  METHOD stufe_ermitteln.
    CASE iv_jahre.
      WHEN 10.
        rv_stufe = '10'.
      WHEN 25.
        rv_stufe = '25'.
      WHEN 40.
        rv_stufe = '40'.
      WHEN OTHERS.
        CLEAR rv_stufe.
    ENDCASE.
  ENDMETHOD.

  METHOD praemie.
*   Betrag je Stufe und Personalbereich lt. BV (gepflegt ueber SM30)
    SELECT SINGLE betrag FROM zhr_jub_praemie INTO rv_betrag
      WHERE stufe = iv_stufe
        AND werks = iv_werks.
  ENDMETHOD.

ENDCLASS.
