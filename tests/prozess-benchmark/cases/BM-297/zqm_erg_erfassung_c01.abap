*&---------------------------------------------------------------------*
*&  Include           ZQM_ERG_ERFASSUNG_C01
*&---------------------------------------------------------------------*
*  Bewertung eines Merkmalsergebnisses: quantitativ (Toleranz) oder
*  qualitativ (Code aus Auswahlmenge). Welche Art, entscheidet die Fabrik.
*----------------------------------------------------------------------*

INTERFACE lif_bewerter.
  METHODS bewerten
    IMPORTING is_merk         TYPE ty_merkmal
              iv_wert         TYPE csequence
    RETURNING VALUE(rv_bewertung) TYPE qbewertg
    RAISING   lcx_erf.
ENDINTERFACE.

*----------------------------------------------------------------------*
CLASS lcl_quant_bewerter DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_bewerter.
ENDCLASS.

CLASS lcl_quant_bewerter IMPLEMENTATION.
  METHOD lif_bewerter~bewerten.
    DATA lv_wert TYPE qsollwert.

    TRY.
        lv_wert = iv_wert.
      CATCH cx_sy_conversion_no_number.
        RAISE EXCEPTION TYPE lcx_erf
          MESSAGE e401(zqm) WITH iv_wert is_merk-merknr.   "kein Zahlenwert
    ENDTRY.

*   Toleranzgrenzen in QAMV sind absolute Grenzen (nicht +/- Soll)
    IF lv_wert > is_merk-toleranzob OR lv_wert < is_merk-toleranzun.
      rv_bewertung = 'R'.
    ELSE.
      rv_bewertung = 'A'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_qual_bewerter DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_bewerter.
ENDCLASS.

CLASS lcl_qual_bewerter IMPLEMENTATION.
  METHOD lif_bewerter~bewerten.
*   Bewertung kommt aus der Auswahlmenge (Katalog 1 = Merkmalsauspraegung)
    SELECT SINGLE bewertung FROM qpac
      INTO rv_bewertung
      WHERE werks      = is_merk-auswmgwrk1
        AND katalogart = '1'
        AND auswahlmge = is_merk-auswmenge1
        AND code       = iv_wert.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_erf
        MESSAGE e402(zqm) WITH iv_wert is_merk-auswmenge1.  "Code unzulaessig
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
CLASS lcl_bewerter_fabrik DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS fuer
      IMPORTING is_merk       TYPE ty_merkmal
      RETURNING VALUE(ro_bew) TYPE REF TO lif_bewerter.
ENDCLASS.

CLASS lcl_bewerter_fabrik IMPLEMENTATION.
  METHOD fuer.
*   Merkmal mit Masseinheit gilt als quantitativ (Stammdaten Labor 2 so
*   gepflegt - QPMK-Steuerkennzeichen wurde 2012 nicht gelesen, Performance)
    IF is_merk-masseinhsw IS NOT INITIAL.
      ro_bew = NEW lcl_quant_bewerter( ).
    ELSE.
      ro_bew = NEW lcl_qual_bewerter( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.
