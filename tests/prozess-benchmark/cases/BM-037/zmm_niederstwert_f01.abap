*----------------------------------------------------------------------*
* Include ZMM_NIEDERSTWERT_F01 - Selektion und Bewertung
*----------------------------------------------------------------------*

FORM berechtigung_pruefen.
  AUTHORITY-CHECK OBJECT 'K_ML_VA'
    ID 'BUKRS' FIELD p_bukrs
    ID 'ACTVT' FIELD '02'.
  IF sy-subrc <> 0.
    MESSAGE e042 WITH p_bukrs.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM werke_ermitteln.
* Bewertungskreis = Werk (Bewertungsebene Werk)
  SELECT w~werks FROM t001w AS w
    INNER JOIN t001k AS k ON k~bwkey = w~bwkey
    INTO TABLE gt_werks
    WHERE k~bukrs = p_bukrs.
ENDFORM.

*----------------------------------------------------------------------*
FORM bestand_lesen.
  FIELD-SYMBOLS <ls_bew> TYPE ty_bew.

  SELECT b~matnr b~bwkey a~mtart b~vprsv b~lbkum b~salk3 b~peinh
         b~stprs AS preis
    FROM mbew AS b INNER JOIN mara AS a ON a~matnr = b~matnr
    INTO CORRESPONDING FIELDS OF TABLE gt_bew
    FOR ALL ENTRIES IN gt_werks
    WHERE b~bwkey = gt_werks-table_line
      AND b~bwtar = space
      AND b~matnr IN s_matnr
      AND a~mtart IN s_mtart
      AND b~lbkum > 0.

* Buchpreis: bei V-Preis den gleitenden Durchschnitt nehmen
  LOOP AT gt_bew ASSIGNING <ls_bew> WHERE vprsv = 'V'.
    SELECT SINGLE verpr FROM mbew INTO <ls_bew>-preis
      WHERE matnr = <ls_bew>-matnr
        AND bwkey = <ls_bew>-bwkey
        AND bwtar = space.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM marktpreis_ermitteln.
  DATA: lv_netpr TYPE ekpo-netpr,
        lv_peinh TYPE ekpo-peinh.
  FIELD-SYMBOLS <ls_bew> TYPE ty_bew.

  gv_von6 = p_stich - 183.
  LOOP AT gt_bew ASSIGNING <ls_bew>.
    CLEAR: lv_netpr, lv_peinh.
    SELECT p~netpr p~peinh
      FROM ekpo AS p INNER JOIN ekko AS k ON k~ebeln = p~ebeln
      INTO (lv_netpr, lv_peinh)
      UP TO 1 ROWS
      WHERE p~matnr = <ls_bew>-matnr
        AND p~werks = <ls_bew>-bwkey
        AND p~loekz = space
        AND k~bedat BETWEEN gv_von6 AND p_stich
      ORDER BY k~bedat DESCENDING.
    ENDSELECT.
    IF sy-subrc = 0 AND lv_peinh > 0 AND <ls_bew>-peinh > 0.
*     auf Preiseinheit des Materialstamms umrechnen
      <ls_bew>-markt = lv_netpr / lv_peinh * <ls_bew>-peinh.
    ELSE.
      <ls_bew>-markt = <ls_bew>-preis.     "kein Marktpreis: Buchpreis
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM gaengigkeit_ermitteln.
  DATA lv_verbr TYPE mseg-menge.
  FIELD-SYMBOLS <ls_bew> TYPE ty_bew.

  r_bwart_verbr-sign = 'I'.
  r_bwart_verbr-option = 'EQ'.
  r_bwart_verbr-low = '261'. APPEND r_bwart_verbr.
  r_bwart_verbr-low = '201'. APPEND r_bwart_verbr.
  r_bwart_verbr-low = '601'. APPEND r_bwart_verbr.

  gv_von = p_stich - 365.
  LOOP AT gt_bew ASSIGNING <ls_bew>.
    CLEAR lv_verbr.
    SELECT SUM( s~menge ) FROM mseg AS s
      INNER JOIN mkpf AS k ON k~mblnr = s~mblnr AND k~mjahr = s~mjahr
      INTO lv_verbr
      WHERE s~matnr = <ls_bew>-matnr
        AND s~werks = <ls_bew>-bwkey
        AND s~bwart IN r_bwart_verbr
        AND k~budat BETWEEN gv_von AND p_stich.
    <ls_bew>-verbr = lv_verbr.

    IF lv_verbr <= 0.
      <ls_bew>-abschl = gc_abschl_0.
      CONTINUE.
    ENDIF.
    <ls_bew>-reichw = <ls_bew>-lbkum / ( lv_verbr / 12 ).
    IF <ls_bew>-reichw > 24.
      <ls_bew>-abschl = gc_abschl_24.
    ELSEIF <ls_bew>-reichw > 12.
      <ls_bew>-abschl = gc_abschl_12.
    ELSE.
      <ls_bew>-abschl = 0.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM abwertung_berechnen.
  FIELD-SYMBOLS <ls_bew> TYPE ty_bew.

  LOOP AT gt_bew ASSIGNING <ls_bew>.
    <ls_bew>-neupr = nmin( val1 = <ls_bew>-preis val2 = <ls_bew>-markt ).
    <ls_bew>-neupr = <ls_bew>-neupr * ( 100 - <ls_bew>-abschl ) / 100.
    IF <ls_bew>-preis > 0.
      <ls_bew>-abw_pct = ( <ls_bew>-preis - <ls_bew>-neupr ) * 100 / <ls_bew>-preis.
    ENDIF.
    <ls_bew>-abw_wert = ( <ls_bew>-preis - <ls_bew>-neupr ) * <ls_bew>-lbkum / <ls_bew>-peinh.
    IF <ls_bew>-abw_pct >= p_schw AND <ls_bew>-abw_wert >= p_minw.
      <ls_bew>-kandidat = abap_true.
      <ls_bew>-status   = icon_yellow_light.
    ELSE.
      <ls_bew>-status   = icon_green_light.
    ENDIF.
  ENDLOOP.
ENDFORM.
