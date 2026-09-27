*&---------------------------------------------------------------------*
*&  Include           ZPP_LEITSTAND_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  DATEN_LESEN
*&---------------------------------------------------------------------*
*       Arbeitsplaetze des Meisters, offene Vorgaenge im Horizont,
*       Belastung je Arbeitsplatz
*----------------------------------------------------------------------*
FORM daten_lesen.

  DATA: lt_jest    TYPE STANDARD TABLE OF jest,
        lv_bis     TYPE datum.

  lv_bis = sy-datum + p_tage.

  SELECT objid arbpl FROM crhd
    INTO CORRESPONDING FIELDS OF TABLE gt_arbpl
    WHERE werks = p_werks
      AND veran = p_veran
      AND objty = 'A'.
* FOR ALL ENTRIES mit leerer Treibertabelle liest ALLES - daher raus
  IF gt_arbpl IS INITIAL.
    RETURN.
  ENDIF.

  SELECT k~aufnr v~vornr v~ltxa1 v~arbid v~objnr w~fsavd w~fsedd w~vgw02
         v~werks
    FROM afko AS k
    INNER JOIN afvc AS v ON v~aufpl = k~aufpl
    INNER JOIN afvv AS w ON w~aufpl = v~aufpl
                        AND w~aplzl = v~aplzl
    INTO CORRESPONDING FIELDS OF TABLE gt_vorg
    FOR ALL ENTRIES IN gt_arbpl
    WHERE v~arbid = gt_arbpl-objid
      AND w~fsavd <= lv_bis.

  IF gt_vorg IS NOT INITIAL.
*   rueckgemeldete Vorgaenge (Status RUCK aktiv) ausblenden
    SELECT objnr stat inact FROM jest
      INTO CORRESPONDING FIELDS OF TABLE lt_jest
      FOR ALL ENTRIES IN gt_vorg
      WHERE objnr = gt_vorg-objnr
        AND stat  = gc_stat_rueck
        AND inact = space.
    LOOP AT lt_jest INTO DATA(ls_jest).
      DELETE gt_vorg WHERE objnr = ls_jest-objnr.
    ENDLOOP.
  ENDIF.

* Belastung: Vorgabewert 2 (Maschinenzeit, Std) gegen Tageskapazitaet
  LOOP AT gt_arbpl ASSIGNING FIELD-SYMBOL(<ls_ap>).
    <ls_ap>-kapazitaet = gc_std_tag * p_tage.     "ohne Kalender/Schichten
    <ls_ap>-last = REDUCE #( INIT s = CONV vgwrt( 0 )
                             FOR ls_v IN gt_vorg WHERE ( arbid = <ls_ap>-objid )
                             NEXT s = s + ls_v-vgw02 ).
    <ls_ap>-ampel = COND #( WHEN <ls_ap>-last > <ls_ap>-kapazitaet THEN icon_red_light
                            WHEN <ls_ap>-last > <ls_ap>-kapazitaet * '0.8' THEN icon_yellow_light
                            ELSE icon_green_light ).
  ENDLOOP.

ENDFORM.
