FUNCTION z_le_gefahrgut_daten.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IT_LIPS) TYPE  ZLE_TT_LIPS_GG
*"  EXPORTING
*"     VALUE(ET_GG) TYPE  ZLE_TT_GG_ZEILE
*"     VALUE(EV_PUNKTE) TYPE  ZLE_GG_PUNKTE
*"     VALUE(EV_FREIGESTELLT) TYPE  ABAP_BOOL
*"  EXCEPTIONS
*"      KEINE_POSITIONEN
*"      KEINE_GEFAHRGUTDATEN
*"----------------------------------------------------------------------
* Gefahrgutangaben fuer das Befoerderungspapier (ADR 5.4.1) und Pruefung
* der Freistellung nach ADR 1.1.3.6 ("1000-Punkte-Regel").
* Stammdaten aus Kundentabelle ZLE_GG_STAMM (Pflege durch den
* Gefahrgutbeauftragten, Transaktion ZLE_GG01) - EHS/DG nicht im Einsatz.
*
* Befoerderungskategorie -> Multiplikator je kg
*   0 = keine Freistellung moeglich
*   1 = 50, 2 = 3, 3 = 1, 4 = 0 (unbegrenzt)
*----------------------------------------------------------------------
  DATA: lt_lips   TYPE zle_tt_lips_gg,
        ls_lips   TYPE zle_s_lips_gg,
        lt_stamm  TYPE STANDARD TABLE OF zle_gg_stamm,
        ls_stamm  TYPE zle_gg_stamm,
        ls_gg     TYPE zle_s_gg_zeile,      "BEFKAT, UN_NR vorn (Gruppenstufe!)
        lv_punkte TYPE zle_gg_punkte,
        lv_kat0   TYPE abap_bool.

  CLEAR: et_gg, ev_punkte.
  ev_freigestellt = abap_true.

  IF it_lips IS INITIAL.
    MESSAGE e050(zle) RAISING keine_positionen.
  ENDIF.

  lt_lips = it_lips.
* ohne Liefermenge (Kommissionierdifferenz auf 0) nicht relevant
  DELETE lt_lips WHERE lfimg IS INITIAL.
* Leergut / Paletten nie Gefahrgut
  DELETE lt_lips WHERE pstyv = 'ZLEG'.

  SELECT * FROM zle_gg_stamm INTO TABLE lt_stamm
    FOR ALL ENTRIES IN lt_lips
    WHERE matnr       =  lt_lips-matnr
      AND gueltig_ab  <= sy-datum
      AND gueltig_bis >= sy-datum.
  IF sy-subrc <> 0.
    MESSAGE e051(zle) RAISING keine_gefahrgutdaten.
  ENDIF.
  SORT lt_stamm BY matnr.

  LOOP AT lt_lips INTO ls_lips.
    READ TABLE lt_stamm INTO ls_stamm
         WITH KEY matnr = ls_lips-matnr BINARY SEARCH.
    CHECK sy-subrc = 0.

*   Menge = Nettogewicht in kg. Andere Gewichtseinheiten kommen laut
*   Fachbereich nicht vor (KRA 2017) - Umrechnung daher nicht aktiv
    IF ls_lips-gewei <> 'KG'.
      CONTINUE.
    ENDIF.
*    CALL FUNCTION 'UNIT_CONVERSION_SIMPLE'
*      EXPORTING
*        input    = ls_lips-ntgew
*        unit_in  = ls_lips-gewei
*        unit_out = 'KG'
*      IMPORTING
*        output   = ls_gg-menge.

    CLEAR ls_gg.
    ls_gg-befkat      = ls_stamm-befkat.
    ls_gg-un_nr       = ls_stamm-un_nr.
    ls_gg-vbeln       = ls_lips-vbeln.
    ls_gg-posnr       = ls_lips-posnr.
    ls_gg-matnr       = ls_lips-matnr.
    ls_gg-bezeichnung = ls_stamm-bezeichnung.
    ls_gg-klasse      = ls_stamm-klasse.
    ls_gg-vpgr        = ls_stamm-vpgr.
    ls_gg-tunnel      = ls_stamm-tunnel.
    ls_gg-menge       = ls_lips-ntgew.
    APPEND ls_gg TO et_gg.
  ENDLOOP.

  SORT et_gg BY befkat un_nr.

* Punkte je UN-Nummer und Befoerderungskategorie aufsummieren
  LOOP AT et_gg INTO ls_gg.
    AT END OF un_nr.
      SUM.
      lv_kat0 = xsdbool( lv_kat0 = abap_true OR ls_gg-befkat = '0' ).
      lv_punkte = lv_punkte + ls_gg-menge * SWITCH i( ls_gg-befkat
                                                      WHEN '1' THEN 50
                                                      WHEN '2' THEN 3
                                                      WHEN '3' THEN 1
                                                      ELSE 0 ).
    ENDAT.
  ENDLOOP.

  ev_punkte       = lv_punkte.
  ev_freigestellt = xsdbool( lv_kat0 = abap_false AND lv_punkte <= 1000 ).

ENDFUNCTION.
