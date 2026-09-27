CLASS zcl_fi_ustva_xml DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: tt_zeilen TYPE STANDARD TABLE OF string WITH DEFAULT KEY.
    TYPES: BEGIN OF ty_kz,
             kennz       TYPE c LENGTH 2,
             art         TYPE c LENGTH 1,
             betrag      TYPE p LENGTH 15 DECIMALS 2,
             betrag_rund TYPE p LENGTH 15 DECIMALS 2,
           END OF ty_kz,
           tt_kz TYPE STANDARD TABLE OF ty_kz WITH DEFAULT KEY.

    "! Zeilen der UStVA-XML aufbauen; leer, wenn keine Steuernummer
    METHODS erzeugen
      IMPORTING
        iv_bukrs         TYPE bukrs
        iv_gjahr         TYPE gjahr
        iv_monat         TYPE monat
        it_kz            TYPE tt_kz
      RETURNING
        VALUE(rt_zeilen) TYPE tt_zeilen.
    "! Zeilen als Datei auf den Applikationsserver schreiben
    METHODS schreiben
      IMPORTING
        iv_datei     TYPE csequence
        it_zeilen    TYPE tt_zeilen
      RETURNING
        VALUE(rv_ok) TYPE abap_bool.
  PROTECTED SECTION.
  PRIVATE SECTION.
    CONSTANTS gc_version TYPE string VALUE '2026'.
ENDCLASS.



CLASS zcl_fi_ustva_xml IMPLEMENTATION.

  METHOD erzeugen.
    DATA: lv_stnr TYPE zfi_ustva_stnr-stnr,
          lv_wert TYPE string,
          ls_kz   TYPE ty_kz.

*   Steuernummer des Buchungskreises (Pflege durch Steuerabteilung)
    SELECT SINGLE stnr FROM zfi_ustva_stnr INTO lv_stnr
      WHERE bukrs = iv_bukrs.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    APPEND '<?xml version="1.0" encoding="UTF-8"?>' TO rt_zeilen.
    APPEND |<Anmeldungssteuern art="UStVA" version="{ gc_version }">| TO rt_zeilen.
    APPEND |<Steuerfall><Umsatzsteuervoranmeldung>| TO rt_zeilen.
    APPEND |<Jahr>{ iv_gjahr }</Jahr><Zeitraum>{ iv_monat }</Zeitraum>| TO rt_zeilen.
    APPEND |<Steuernummer>{ lv_stnr }</Steuernummer>| TO rt_zeilen.

    LOOP AT it_kz INTO ls_kz.
*     Kennzahlen mit Betrag null werden nicht uebermittelt
      IF ls_kz-betrag_rund = 0.
        CONTINUE.
      ENDIF.
      lv_wert = |{ ls_kz-betrag_rund NUMBER = RAW }|.
      APPEND |<Kz{ ls_kz-kennz }>{ lv_wert }</Kz{ ls_kz-kennz }>| TO rt_zeilen.
    ENDLOOP.

    APPEND |</Umsatzsteuervoranmeldung></Steuerfall></Anmeldungssteuern>| TO rt_zeilen.
  ENDMETHOD.


  METHOD schreiben.
    DATA lv_zeile TYPE string.

    rv_ok = abap_false.
    OPEN DATASET iv_datei FOR OUTPUT IN TEXT MODE ENCODING UTF-8.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    LOOP AT it_zeilen INTO lv_zeile.
      TRANSFER lv_zeile TO iv_datei.
    ENDLOOP.
    CLOSE DATASET iv_datei.
    rv_ok = abap_true.
  ENDMETHOD.

ENDCLASS.
