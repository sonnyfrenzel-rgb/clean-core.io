*&---------------------------------------------------------------------*
*& Include ZRT_KATALOG_IMPORT_C01 - Feldzuordnung Katalog -> BAPI
*&---------------------------------------------------------------------*
CLASS lcl_mapper DEFINITION.
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING it_map TYPE tt_map.
    METHODS abbilden
      IMPORTING is_kat     TYPE ty_kat
      EXPORTING es_client  TYPE bapie1marart
                es_clientx TYPE bapie1marartx.
  PRIVATE SECTION.
    DATA mt_map TYPE tt_map.
    METHODS konvertieren
      IMPORTING is_map        TYPE ty_map
                iv_wert       TYPE any
      RETURNING VALUE(rv_wert) TYPE string.
ENDCLASS.

CLASS lcl_mapper IMPLEMENTATION.

  METHOD constructor.
    mt_map = it_map.
  ENDMETHOD.

  METHOD abbilden.
    FIELD-SYMBOLS: <lv_quelle> TYPE any,
                   <lv_ziel>   TYPE any,
                   <lv_zielx>  TYPE any.

    CLEAR: es_client, es_clientx.
    LOOP AT mt_map INTO DATA(ls_map).
      ASSIGN COMPONENT ls_map-quelle OF STRUCTURE is_kat TO <lv_quelle>.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      ASSIGN COMPONENT ls_map-ziel OF STRUCTURE es_client TO <lv_ziel>.
      CHECK sy-subrc = 0.

      IF ls_map-konv_klasse IS NOT INITIAL.
        <lv_ziel> = konvertieren( is_map = ls_map iv_wert = <lv_quelle> ).
      ELSE.
        <lv_ziel> = <lv_quelle>.
      ENDIF.

      ASSIGN COMPONENT ls_map-ziel OF STRUCTURE es_clientx TO <lv_zielx>.
      IF sy-subrc = 0.
        <lv_zielx> = abap_true.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD konvertieren.
    DATA lr_wert TYPE REF TO data.

    CREATE DATA lr_wert TYPE string.
    ASSIGN lr_wert->* TO FIELD-SYMBOL(<lv_wert>).
    <lv_wert> = iv_wert.
    TRY.
        CALL METHOD (is_map-konv_klasse)=>(is_map-konv_methode)
          EXPORTING
            iv_in  = <lv_wert>
          RECEIVING
            rv_out = rv_wert.
      CATCH cx_sy_dyn_call_error.
*       Konvertierung nicht vorhanden -> Wert unveraendert uebernehmen
        rv_wert = <lv_wert>.
    ENDTRY.
  ENDMETHOD.

ENDCLASS.
