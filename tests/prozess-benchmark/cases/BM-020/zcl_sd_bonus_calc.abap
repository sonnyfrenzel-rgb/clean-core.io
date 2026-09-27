CLASS zcl_sd_bonus_calc DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Bonusermittlung je Kunde und Geschäftsjahr
*  - Staffel ZSD_BONUS_STAFFEL je VKORG/Jahr (Umsatzschwellen in EUR)
*  - Kunde muss im Vertriebsbereich bonusrelevant sein (KNVV-BOKRE)
*  - Mindestumsatz 10.000 EUR, Kappung je Staffelstufe
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             prozent TYPE zsd_bonus_proz,
             bonus   TYPE vbrp-netwr,
             text    TYPE bapi_msg,
           END OF ty_result.

    METHODS constructor
      IMPORTING iv_vkorg TYPE vkorg
                iv_vtweg TYPE vtweg
                iv_spart TYPE spart
                iv_gjahr TYPE gjahr
      RAISING   zcx_sd_bonus.
    METHODS calculate
      IMPORTING iv_kunnr         TYPE kunnr
                iv_umsatz        TYPE vbrp-netwr
                iv_waerk         TYPE waerk
      RETURNING VALUE(rs_result) TYPE ty_result.

  PRIVATE SECTION.
    CONSTANTS: c_eur        TYPE waerk VALUE 'EUR',
               c_min_umsatz TYPE vbrp-netwr VALUE '10000.00'.

    DATA: mv_vkorg    TYPE vkorg,
          mv_vtweg    TYPE vtweg,
          mv_spart    TYPE spart,
          mv_gjahr    TYPE gjahr,
          mv_stichtag TYPE d,
          mt_staffel  TYPE STANDARD TABLE OF zsd_bonus_staffel.
ENDCLASS.



CLASS zcl_sd_bonus_calc IMPLEMENTATION.

  METHOD constructor.
    mv_vkorg    = iv_vkorg.
    mv_vtweg    = iv_vtweg.
    mv_spart    = iv_spart.
    mv_gjahr    = iv_gjahr.
    mv_stichtag = |{ iv_gjahr }1231|.

    SELECT * FROM zsd_bonus_staffel INTO TABLE mt_staffel
      WHERE vkorg = iv_vkorg
        AND gjahr = iv_gjahr.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_bonus
        EXPORTING textid = zcx_sd_bonus=>no_scale
                  vkorg  = iv_vkorg
                  gjahr  = iv_gjahr.
    ENDIF.

*   höchste Schwelle zuerst - erster Treffer ist die gültige Stufe
    SORT mt_staffel BY ab_umsatz DESCENDING.
  ENDMETHOD.


  METHOD calculate.
    DATA: lv_bokre   TYPE knvv-bokre,
          lv_vorhand TYPE zsd_bonus_beleg-kunnr,
          lv_ums_eur TYPE vbrp-netwr,
          ls_staffel TYPE zsd_bonus_staffel.

*   1. bonusrelevant im Vertriebsbereich?
    SELECT SINGLE bokre FROM knvv INTO lv_bokre
      WHERE kunnr = iv_kunnr
        AND vkorg = mv_vkorg
        AND vtweg = mv_vtweg
        AND spart = mv_spart.
    IF lv_bokre <> abap_true.
      rs_result-text = 'Kunde nicht bonusrelevant'(n01).
      RETURN.
    ENDIF.

*   2. schon abgerechnet?
    SELECT SINGLE kunnr FROM zsd_bonus_beleg INTO lv_vorhand
      WHERE kunnr = iv_kunnr
        AND vkorg = mv_vkorg
        AND gjahr = mv_gjahr.
    IF sy-subrc = 0.
      rs_result-text = 'Bonus für das Jahr bereits abgerechnet'(n02).
      RETURN.
    ENDIF.

*   3. Umsatz für Schwellenvergleich in EUR
    IF iv_waerk <> c_eur.
      CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
        EXPORTING
          date             = mv_stichtag
          foreign_amount   = iv_umsatz
          foreign_currency = iv_waerk
          local_currency   = c_eur
        IMPORTING
          local_amount     = lv_ums_eur
        EXCEPTIONS
          OTHERS           = 1.
      IF sy-subrc <> 0.
        rs_result-text = |Kein Kurs { iv_waerk }/EUR zum { mv_stichtag DATE = USER }|.
        RETURN.
      ENDIF.
    ELSE.
      lv_ums_eur = iv_umsatz.
    ENDIF.

*   4. Mindestumsatz
    IF lv_ums_eur < c_min_umsatz.
      rs_result-text = 'Mindestumsatz nicht erreicht'(n03).
      RETURN.
    ENDIF.

*   5. Staffelstufe
    LOOP AT mt_staffel INTO ls_staffel WHERE ab_umsatz <= lv_ums_eur.
      rs_result-prozent = ls_staffel-prozent.
      EXIT.
    ENDLOOP.

*   6. Bonus auf den Umsatz in Belegwährung
    rs_result-bonus = round( val = iv_umsatz * rs_result-prozent / 100
                             dec = 2 ).

*   7. Kappung der Stufe (0 = keine Kappung)
    IF ls_staffel-max_bonus > 0 AND rs_result-bonus > ls_staffel-max_bonus.
      rs_result-bonus = ls_staffel-max_bonus.
      rs_result-text  = 'Bonus auf Höchstbetrag der Stufe gekappt'(n04).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
