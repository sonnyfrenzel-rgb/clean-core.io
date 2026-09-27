FUNCTION z_mm_abc_werk.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (remotefaehig, Funktionsgruppe ZMM_ABC)
*"  IMPORTING
*"     VALUE(IV_WERKS) TYPE  WERKS_D
*"     VALUE(IV_VON) TYPE  D
*"     VALUE(IV_BIS) TYPE  D
*"     VALUE(IV_GRENZ_A) TYPE  ZMM_ABC_PROZENT
*"     VALUE(IV_GRENZ_B) TYPE  ZMM_ABC_PROZENT
*"     VALUE(IV_MARC) TYPE  ABAP_BOOL
*"  EXPORTING
*"     VALUE(ES_SUMME) TYPE  ZMM_S_ABC_SUMME
*"----------------------------------------------------------------------
  DATA: lt_verbrauch TYPE zcl_mm_abc_amdp=>tt_verbrauch,
        lt_abc       TYPE zcl_mm_abc_amdp=>tt_abc,
        lt_db        TYPE STANDARD TABLE OF zmm_abc_ergebnis WITH EMPTY KEY.

  es_summe-werks = iv_werks.

  zcl_mm_abc_amdp=>verbrauch(
    EXPORTING iv_mandt = sy-mandt
              iv_werks = iv_werks
              iv_von   = iv_von
              iv_bis   = iv_bis
    IMPORTING et_verbrauch = lt_verbrauch ).

  IF lt_verbrauch IS INITIAL.
    es_summe-status = 'LEER'.
    RETURN.
  ENDIF.

  zcl_mm_abc_amdp=>klassifiziere(
    EXPORTING it_verbrauch = lt_verbrauch
              iv_grenz_a   = iv_grenz_a
              iv_grenz_b   = iv_grenz_b
    IMPORTING et_abc       = lt_abc ).

  lt_db = VALUE #( FOR ls_abc IN lt_abc
                   ( werks   = iv_werks
                     matnr   = ls_abc-matnr
                     stichtag = iv_bis
                     wert    = ls_abc-wert
                     anteil  = ls_abc-kum_anteil
                     klasse  = ls_abc-klasse ) ).
  MODIFY zmm_abc_ergebnis FROM TABLE lt_db.

  IF iv_marc = abap_true.
*   ABC-Kennzeichen im Werkssegment - direkt, MM02 waere zu langsam
    LOOP AT lt_abc INTO DATA(ls_marc).
      UPDATE marc SET maabc = ls_marc-klasse
        WHERE matnr = ls_marc-matnr
          AND werks = iv_werks.
    ENDLOOP.
  ENDIF.

  COMMIT WORK.

  LOOP AT lt_abc INTO DATA(ls_sum).
    CASE ls_sum-klasse.
      WHEN 'A'.
        es_summe-anz_a  = es_summe-anz_a + 1.
        es_summe-wert_a = es_summe-wert_a + ls_sum-wert.
      WHEN 'B'.
        es_summe-anz_b = es_summe-anz_b + 1.
      WHEN OTHERS.
        es_summe-anz_c = es_summe-anz_c + 1.
    ENDCASE.
  ENDLOOP.
  es_summe-status = 'OK'.

ENDFUNCTION.
