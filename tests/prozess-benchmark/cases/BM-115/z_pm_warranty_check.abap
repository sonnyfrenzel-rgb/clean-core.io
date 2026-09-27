FUNCTION z_pm_warranty_check.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_EQUNR) TYPE  EQUNR
*"     VALUE(IV_DATUM) TYPE  DATUM
*"  EXPORTING
*"     VALUE(ES_WARRANTY) TYPE  ZPM_S_WARRANTY
*"  EXCEPTIONS
*"      NO_WARRANTY
*"----------------------------------------------------------------------
* Gültige Garantie zum Equipment am Stichtag.
* Hat das Equipment selbst keine, wird die Garantie des übergeordneten
* Equipments geerbt (höchstens 5 Stufen, vgl. Garantievererbung IE02).
*----------------------------------------------------------------------
* 2014-05 FKR  Erstellung
* 2015-08 FKR  Vererbung über HEQNR
*----------------------------------------------------------------------
  DATA: lv_equnr TYPE equi-equnr,
        lv_objnr TYPE j_objnr,
        lv_level TYPE i.

  CLEAR es_warranty.
  lv_equnr = iv_equnr.

  WHILE lv_level < 5.
    lv_level = lv_level + 1.
    CONCATENATE 'IE' lv_equnr INTO lv_objnr.

    SELECT SINGLE gaart mganr gwldt gwlen FROM bgmkobj
      INTO CORRESPONDING FIELDS OF es_warranty
      WHERE j_objnr = lv_objnr
        AND gwldt  <= iv_datum
        AND gwlen  >= iv_datum.
    IF sy-subrc = 0.
      es_warranty-equnr = lv_equnr.
      EXIT.
    ENDIF.

*   Garantievererbung: übergeordnetes Equipment
    SELECT SINGLE heqnr FROM equz INTO lv_equnr
      WHERE equnr = lv_equnr
        AND datbi = '99991231'.
    IF sy-subrc <> 0 OR lv_equnr IS INITIAL.
      EXIT.
    ENDIF.
  ENDWHILE.

  IF es_warranty-gaart IS INITIAL.
    RAISE no_warranty.
  ENDIF.

* Lieferant aus dem Equipmentstamm (Einkaufsdaten)
  SELECT SINGLE elief FROM equi INTO es_warranty-lifnr
    WHERE equnr = iv_equnr.
ENDFUNCTION.
