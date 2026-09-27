CLASS zcl_sd_angebot_preis DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Preisvorschlag fuer Angebotspositionen
*   1. Listenpreis PR00 aus Konditionssatz (Tabelle A304: VKORG/VTWEG/MATNR)
*   2. sonst letzter Preis des Kunden fuer das Material aus einem
*      Kundenauftrag (PRCD_ELEMENTS, Nachfolger von KONV)
*   3. sonst 0 -> Warnung in der App
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS listenpreis
      IMPORTING iv_material     TYPE matnr
                iv_kunde        TYPE kunnr
                iv_vb           TYPE zsd_vertriebsbereich
                iv_waehrung     TYPE waers
      RETURNING VALUE(rv_preis) TYPE netpr.
ENDCLASS.



CLASS zcl_sd_angebot_preis IMPLEMENTATION.

  METHOD listenpreis.
    DATA(lv_heute) = cl_abap_context_info=>get_system_date( ).

    SELECT SINGLE p~kbetr, p~kpein, p~konwa
      FROM a304 AS a
      INNER JOIN konp AS p ON p~knumh = a~knumh
      WHERE a~kappl = 'V'
        AND a~kschl = 'PR00'
        AND a~vkorg = @iv_vb-vkorg
        AND a~vtweg = @iv_vb-vtweg
        AND a~matnr = @iv_material
        AND a~datab <= @lv_heute
        AND a~datbi >= @lv_heute
        AND p~loevm_ko = @space
      INTO @DATA(ls_pr00).
    IF sy-subrc = 0 AND ls_pr00-konwa = iv_waehrung.
      rv_preis = ls_pr00-kbetr / nmax( val1 = ls_pr00-kpein val2 = 1 ).
      RETURN.
    ENDIF.

*   Fallback: zuletzt fakturierter/bestaetigter Preis beim Kunden
    SELECT e~kbetr, e~kpein, e~waerk
      FROM vbak AS k
      INNER JOIN vbap AS p ON p~vbeln = k~vbeln
      INNER JOIN prcd_elements AS e ON e~knumv = k~knumv
                                   AND e~kposn = p~posnr
      WHERE k~kunnr = @iv_kunde
        AND p~matnr = @iv_material
        AND e~kschl = 'PR00'
        AND e~kinak = @space
      ORDER BY k~erdat DESCENDING
      INTO @DATA(ls_letzter)
      UP TO 1 ROWS.
    ENDSELECT.
    IF sy-subrc = 0 AND ls_letzter-waerk = iv_waehrung.
      rv_preis = ls_letzter-kbetr / nmax( val1 = ls_letzter-kpein val2 = 1 ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
