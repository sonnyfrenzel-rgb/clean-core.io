REPORT zmm_stock_free.
*&---------------------------------------------------------------------*
*& Frei verwendbarer Bestand je Material / Werk / Lagerort
*& Aufruf aus Kommissionier-Leitstand (Variante LS_01)
*&---------------------------------------------------------------------*
PARAMETERS: p_matnr TYPE matnr   OBLIGATORY,
            p_werks TYPE werks_d OBLIGATORY,
            p_lgort TYPE lgort_d OBLIGATORY.

CLASS lcx_no_stock DEFINITION INHERITING FROM cx_static_check.
ENDCLASS.

CLASS lcl_stock DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS get_free
      IMPORTING iv_matnr        TYPE matnr
                iv_werks        TYPE werks_d
                iv_lgort        TYPE lgort_d
      RETURNING VALUE(rv_labst) TYPE labst
      RAISING   lcx_no_stock.
ENDCLASS.

CLASS lcl_stock IMPLEMENTATION.
  METHOD get_free.
    SELECT SINGLE labst FROM mard INTO rv_labst
      WHERE matnr = iv_matnr
        AND werks = iv_werks
        AND lgort = iv_lgort.
    IF sy-subrc <> 0 OR rv_labst <= 0.
      RAISE EXCEPTION TYPE lcx_no_stock.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

START-OF-SELECTION.
  TRY.
      DATA(lv_free) = lcl_stock=>get_free( iv_matnr = p_matnr
                                           iv_werks = p_werks
                                           iv_lgort = p_lgort ).
      WRITE: / p_matnr, p_lgort, 'frei verwendbar:', lv_free.
    CATCH lcx_no_stock.
      MESSAGE 'Kein frei verwendbarer Bestand am Lagerort' TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
