*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTKOSTEN_F01 - Selektion und Berechnung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  TRANSPORTE_LESEN
*&---------------------------------------------------------------------*
*       abgefertigte Transporte ohne Frachtkostenbeleg
*----------------------------------------------------------------------*
FORM transporte_lesen.
  SELECT tdlnr, tknum, shtyp, route, dtabf
    FROM vttk
    WHERE tdlnr IN @s_tdlnr
      AND shtyp IN @s_shtyp
      AND dtabf IN @s_datum
      AND stabf = 'X'
    INTO CORRESPONDING FIELDS OF TABLE @gt_tr.
  CHECK gt_tr IS NOT INITIAL.

* bereits abgerechnete Transporte entfernen
  SELECT rebel FROM vfkp
    FOR ALL ENTRIES IN @gt_tr
    WHERE rebel = @gt_tr-tknum
    INTO TABLE @DATA(lt_vfkp).
  LOOP AT lt_vfkp INTO DATA(ls_vfkp).
    DELETE gt_tr WHERE tknum = ls_vfkp-rebel.
  ENDLOOP.

  SORT gt_tr BY tdlnr tknum.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  GEWICHTE_ERMITTELN
*&---------------------------------------------------------------------*
*       Frachtgewicht je Transport = Summe Bruttogewicht der HUs aller
*       Lieferungen des Transports (in kg)
*----------------------------------------------------------------------*
FORM gewichte_ermitteln.
  DATA lv_kg TYPE p LENGTH 13 DECIMALS 3.

  SELECT tknum, vbeln FROM vttp
    FOR ALL ENTRIES IN @gt_tr
    WHERE tknum = @gt_tr-tknum
    INTO TABLE @DATA(lt_vttp).
  IF lt_vttp IS INITIAL.
    RETURN.
  ENDIF.

  SELECT vpobjkey, exidv, brgew, gewei FROM vekp
    FOR ALL ENTRIES IN @lt_vttp
    WHERE vpobj    = '01'
      AND vpobjkey = @lt_vttp-vbeln
    INTO TABLE @DATA(lt_hu).

  LOOP AT gt_tr ASSIGNING FIELD-SYMBOL(<ls_tr>).
    LOOP AT lt_vttp INTO DATA(ls_vttp) WHERE tknum = <ls_tr>-tknum.
      LOOP AT lt_hu INTO DATA(ls_hu) WHERE vpobjkey = ls_vttp-vbeln.
        lv_kg = SWITCH #( ls_hu-gewei
                          WHEN 'KG' THEN ls_hu-brgew
                          WHEN 'G'  THEN ls_hu-brgew / 1000
                          WHEN 'TO' THEN ls_hu-brgew * 1000
                          ELSE -1 ).
        IF lv_kg < 0.
          <ls_tr>-fehler = |HU { ls_hu-exidv }: Gewichtseinheit { ls_hu-gewei }|.
          EXIT.
        ENDIF.
        <ls_tr>-gewicht_kg = <ls_tr>-gewicht_kg + lv_kg.
      ENDLOOP.
    ENDLOOP.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  FRACHT_BERECHNEN
*&---------------------------------------------------------------------*
*       Tarif ZLE_TARIF: Spediteur / Zone / Gewichtsstaffel (bis kg)
*----------------------------------------------------------------------*
FORM fracht_berechnen CHANGING cs_tr TYPE ty_tr.
  DATA lv_zone TYPE zle_route_zone-zone.

  IF cs_tr-gewicht_kg <= 0.
    cs_tr-fehler = 'Kein HU-Gewicht ermittelbar'.
    RETURN.
  ENDIF.

  SELECT SINGLE zone FROM zle_route_zone INTO lv_zone
    WHERE route = cs_tr-route.
  IF sy-subrc <> 0.
    cs_tr-fehler = |Route { cs_tr-route } ohne Tarifzone|.
    RETURN.
  ENDIF.

* Staffel: kleinste Gewichtsgrenze >= Gewicht, juengster gueltiger Tarif
  SELECT preis_100kg, mindestfracht
    FROM zle_tarif
    WHERE tdlnr       =  @cs_tr-tdlnr
      AND zone        =  @lv_zone
      AND gewicht_bis >= @cs_tr-gewicht_kg
      AND gueltig_ab  <= @cs_tr-dtabf
    ORDER BY gewicht_bis ASCENDING, gueltig_ab DESCENDING
    INTO TABLE @DATA(lt_tarif)
    UP TO 1 ROWS.
  READ TABLE lt_tarif INTO DATA(ls_tarif) INDEX 1.
  IF sy-subrc <> 0.
    cs_tr-fehler = |Kein Tarif fuer Spediteur { cs_tr-tdlnr } Zone { lv_zone }|.
    RETURN.
  ENDIF.

  CATCH SYSTEM-EXCEPTIONS arithmetic_errors = 4.
    cs_tr-fracht = cs_tr-gewicht_kg / 100 * ls_tarif-preis_100kg.
  ENDCATCH.
  IF sy-subrc = 4.
    cs_tr-fehler = 'Rechenfehler Fracht'.
    RETURN.
  ENDIF.

  cs_tr-fracht = nmax( val1 = cs_tr-fracht val2 = ls_tarif-mindestfracht ).

* Dieselzuschlag in Prozent (Pflege Einkauf Logistik)
  SELECT SINGLE low FROM tvarvc INTO @DATA(lv_diesel)
    WHERE name = 'ZLE_DIESELZUSCHLAG'
      AND type = 'P'
      AND numb = '0000'.
  IF sy-subrc = 0.
    cs_tr-fracht = cs_tr-fracht * ( 1 + CONV decfloat16( lv_diesel ) / 100 ).
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  GEWICHTE_AUS_LIEFERUNG
*&---------------------------------------------------------------------*
*       Version 2008: Frachtgewicht aus dem Bruttogewicht der Lieferung.
*       Seit 2016 durch GEWICHTE_ERMITTELN (HU-Gewicht) ersetzt, bleibt
*       fuer Vergleichsrechnungen der Spedition "vorerst" im Programm.
*----------------------------------------------------------------------*
FORM gewichte_aus_lieferung.
  DATA lv_kg TYPE p LENGTH 13 DECIMALS 3.

  SELECT tknum, vbeln FROM vttp
    FOR ALL ENTRIES IN @gt_tr
    WHERE tknum = @gt_tr-tknum
    INTO TABLE @DATA(lt_vttp).

  LOOP AT gt_tr ASSIGNING FIELD-SYMBOL(<ls_tr>).
    CLEAR <ls_tr>-gewicht_kg.
    LOOP AT lt_vttp INTO DATA(ls_vttp) WHERE tknum = <ls_tr>-tknum.
      SELECT SINGLE btgew, gewei FROM likp
        WHERE vbeln = @ls_vttp-vbeln
        INTO (@DATA(lv_btgew), @DATA(lv_gewei)).
      CHECK sy-subrc = 0.
      lv_kg = COND #( WHEN lv_gewei = 'G'  THEN lv_btgew / 1000
                      WHEN lv_gewei = 'TO' THEN lv_btgew * 1000
                      ELSE lv_btgew ).
      <ls_tr>-gewicht_kg = <ls_tr>-gewicht_kg + lv_kg.
    ENDLOOP.
  ENDLOOP.
ENDFORM.
