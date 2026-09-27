*----------------------------------------------------------------------*
***INCLUDE ZMM_LIEF_BEWERTUNG_F01 - Unterprogramme
*----------------------------------------------------------------------*

FORM lesen_wareneingaenge.
  SELECT k~lifnr b~ebeln b~ebelp b~budat b~menge b~shkzg
    INTO TABLE gt_we
    FROM ekbe AS b INNER JOIN ekko AS k ON k~ebeln = b~ebeln
    WHERE k~ekorg = p_ekorg
      AND k~lifnr IN s_lifnr
      AND b~vgabe = '1'
      AND b~budat IN s_budat.
* Stornos (Soll/Haben H) nicht bewerten - nur echte Anlieferungen
  DELETE gt_we WHERE shkzg = 'H'.
ENDFORM.

*----------------------------------------------------------------------*
FORM termintreue.
  DATA: ls_acc   TYPE ty_acc,
        lv_eindt TYPE eket-eindt,
        lv_tage  TYPE i.
  FIELD-SYMBOLS <ls_we> TYPE ty_we.

  LOOP AT gt_we ASSIGNING <ls_we>.
    SELECT MIN( eindt ) FROM eket INTO lv_eindt
      WHERE ebeln = <ls_we>-ebeln
        AND ebelp = <ls_we>-ebelp.
    IF lv_eindt IS INITIAL.
      CONTINUE.
    ENDIF.
    lv_tage = <ls_we>-budat - lv_eindt.
    CLEAR ls_acc.
    ls_acc-lifnr = <ls_we>-lifnr.
    ls_acc-n_we  = 1.
    IF lv_tage <= 0.
      ls_acc-pkt_zeit = 100.
    ELSEIF lv_tage <= 3.
      ls_acc-pkt_zeit = 80.
    ELSEIF lv_tage <= 7.
      ls_acc-pkt_zeit = 50.
    ELSE.
      ls_acc-pkt_zeit = 0.
    ENDIF.
    COLLECT ls_acc INTO gt_acc.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM mengentreue.
  TYPES: BEGIN OF ty_pos,
           lifnr TYPE lifnr,
           ebeln TYPE ebeln,
           ebelp TYPE ebelp,
           menge TYPE ekbe-menge,
         END OF ty_pos.
  DATA: lt_pos  TYPE STANDARD TABLE OF ty_pos,
        ls_pos  TYPE ty_pos,
        ls_ekpo TYPE ekpo,
        ls_acc  TYPE ty_acc,
        lv_abw  TYPE p LENGTH 7 DECIMALS 2.
  FIELD-SYMBOLS <ls_we> TYPE ty_we.

  LOOP AT gt_we ASSIGNING <ls_we>.
    MOVE-CORRESPONDING <ls_we> TO ls_pos.
    COLLECT ls_pos INTO lt_pos.
  ENDLOOP.

  LOOP AT lt_pos INTO ls_pos.
    SELECT SINGLE * FROM ekpo INTO ls_ekpo
      WHERE ebeln = ls_pos-ebeln
        AND ebelp = ls_pos-ebelp.
*   nur endgelieferte Positionen sind aussagekraeftig
    IF sy-subrc <> 0 OR ls_ekpo-elikz <> 'X' OR ls_ekpo-menge = 0.
      CONTINUE.
    ENDIF.
    lv_abw = abs( ls_pos-menge - ls_ekpo-menge ) * 100 / ls_ekpo-menge.
    CLEAR ls_acc.
    ls_acc-lifnr     = ls_pos-lifnr.
    ls_acc-n_pos     = 1.
    ls_acc-pkt_menge = nmax( val1 = 0 val2 = 100 - lv_abw * 2 ).
    COLLECT ls_acc INTO gt_acc.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM qualitaet.
  DATA: lt_qals TYPE STANDARD TABLE OF qals,
        ls_qals TYPE qals,
        ls_qave TYPE qave,
        ls_acc  TYPE ty_acc.

  IF gt_acc IS INITIAL.
    RETURN.
  ENDIF.
  SELECT * FROM qals INTO TABLE lt_qals
    FOR ALL ENTRIES IN gt_acc
    WHERE lifnr = gt_acc-lifnr
      AND art   = '01'
      AND enstehdat IN s_budat.

  LOOP AT lt_qals INTO ls_qals.
    SELECT SINGLE * FROM qave INTO ls_qave
      WHERE prueflos = ls_qals-prueflos.
    IF sy-subrc <> 0.
      CONTINUE.                       "noch kein Verwendungsentscheid
    ENDIF.
    CLEAR ls_acc.
    ls_acc-lifnr = ls_qals-lifnr.
    ls_acc-n_los = 1.
    IF ls_qave-vbewertung = 'A'.
      ls_acc-n_ok = 1.
    ENDIF.
    COLLECT ls_acc INTO gt_acc.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM gesamtnote.
  DATA: ls_score TYPE zmm_lief_score,
        lv_zeit  TYPE p LENGTH 5 DECIMALS 1,
        lv_menge TYPE p LENGTH 5 DECIMALS 1,
        lv_qual  TYPE p LENGTH 5 DECIMALS 1.
  FIELD-SYMBOLS <ls_acc> TYPE ty_acc.

  LOOP AT gt_acc ASSIGNING <ls_acc>.
    CLEAR: ls_score, lv_zeit, lv_menge.
    lv_qual = 100.                    "ohne Pruefloese keine Abwertung
    IF <ls_acc>-n_we > 0.
      lv_zeit = <ls_acc>-pkt_zeit / <ls_acc>-n_we.
    ENDIF.
    IF <ls_acc>-n_pos > 0.
      lv_menge = <ls_acc>-pkt_menge / <ls_acc>-n_pos.
    ENDIF.
    IF <ls_acc>-n_los > 0.
      lv_qual = <ls_acc>-n_ok * 100 / <ls_acc>-n_los.
    ENDIF.
    ls_score-ekorg  = p_ekorg.
    ls_score-perio  = p_perio.
    ls_score-lifnr  = <ls_acc>-lifnr.
    ls_score-zeit   = lv_zeit.
    ls_score-menge  = lv_menge.
    ls_score-qual   = lv_qual.
    ls_score-gesamt = lv_zeit * '0.4' + lv_menge * '0.3' + lv_qual * '0.3'.
    IF ls_score-gesamt >= 90.
      ls_score-note = 'A'.
    ELSEIF ls_score-gesamt >= 70.
      ls_score-note = 'B'.
    ELSE.
      ls_score-note = 'C'.
    ENDIF.
    APPEND ls_score TO gt_score.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM speichern.
  DELETE FROM zmm_lief_score
    WHERE ekorg = p_ekorg
      AND perio = p_perio.
  INSERT zmm_lief_score FROM TABLE gt_score.
  IF sy-subrc = 0.
    COMMIT WORK.
    MESSAGE s003(zmm) WITH lines( gt_score ).
  ELSE.
    ROLLBACK WORK.
    MESSAGE e004(zmm).
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM anzeigen.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = go_alv
                              CHANGING  t_table      = gt_score ).
      go_alv->get_functions( )->set_all( abap_true ).
      go_alv->display( ).
    CATCH cx_salv_msg.
      MESSAGE 'Anzeige nicht moeglich' TYPE 'I'.
  ENDTRY.
ENDFORM.
