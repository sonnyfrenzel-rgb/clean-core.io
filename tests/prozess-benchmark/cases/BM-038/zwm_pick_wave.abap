REPORT zwm_pick_wave MESSAGE-ID zwm.
*----------------------------------------------------------------------*
* Kommissionierwelle: Transportauftraege zu Auslieferungen erzeugen
*  - Lieferungen je Versandstelle/Route bis Warenausgangsdatum
*  - nur nicht kommissionierte, WM-relevante Lieferungen (VBUK)
*  - Welle begrenzt auf n Lieferungen, Prioritaet vor Route
*  - Fixplatz-Kommissionierung (Lagertyp 005) sofort quittieren
*  - TA-Druck parallel (aRFC), Protokoll im Anwendungslog ZWM/WAVE
*----------------------------------------------------------------------*
* 2006-03 UB  Erstellung (Ersatz LT42 fuer DC Mitte)
* 2011-09 UB  Parallel-Druck
* 2019-05 NK  Anwendungslog statt WRITE-Liste
*----------------------------------------------------------------------*

INCLUDE zwm_pick_wave_top.
INCLUDE zwm_pick_wave_f01.

START-OF-SELECTION.
  go_log = NEW zcl_wm_pick_log( iv_extnumber = |{ p_lgnum }/{ p_vstel }/{ sy-datum }| ).

  PERFORM lieferungen_lesen.
  IF gt_lief IS INITIAL.
    go_log->add( iv_type = 'W' iv_text = 'Keine offenen Lieferungen' ).
    go_log->save( ).
    MESSAGE s001.
    RETURN.
  ENDIF.

  PERFORM welle_bilden.

  LOOP AT gt_lief ASSIGNING <gs_lief>.
    PERFORM ta_erzeugen CHANGING <gs_lief>.
  ENDLOOP.

  IF p_print = abap_true.
    PERFORM ta_drucken.
  ENDIF.

  go_log->save( ).

END-OF-SELECTION.
  IF sy-batch = abap_false.
    go_log->display( ).
  ELSE.
    PERFORM zusammenfassung.
  ENDIF.
