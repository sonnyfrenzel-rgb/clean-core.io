*&---------------------------------------------------------------------*
*&  Include           ZFI_PERIODENABSCHLUSS_F01
*&  Pruefungen vor dem Abschluss
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  ZEITRAUM_SETZEN
*&---------------------------------------------------------------------*
*       Kalendermonat = Buchungsperiode (Geschaeftsjahr = Kalenderjahr,
*       gilt fuer alle Buchungskreise im Konzern - Variante K4)
*----------------------------------------------------------------------*
FORM zeitraum_setzen.
  CONCATENATE p_gjahr p_monat '01' INTO gv_von.
  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = gv_von
    IMPORTING
      last_day_of_month = gv_bis
    EXCEPTIONS
      day_in_no_date    = 1
      OTHERS            = 2.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  BERECHTIGUNG_PRUEFEN
*&---------------------------------------------------------------------*
*       Pflege der Periodensteuerung = S_TABU_DIS Gruppe FC31
*----------------------------------------------------------------------*
FORM berechtigung_pruefen.
  CHECK p_test IS INITIAL.

  AUTHORITY-CHECK OBJECT 'S_TABU_DIS'
    ID 'DICBERCLS' FIELD 'FC31'
    ID 'ACTVT'     FIELD '02'.
  IF sy-subrc <> 0.
    PERFORM log_meldung USING 'E' 'Keine Berechtigung fuer Periodensteuerung'.
    PERFORM log_sichern.
    MESSAGE e003.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PRUEFUNG_PARKBELEGE
*&---------------------------------------------------------------------*
FORM pruefung_parkbelege.
  DATA lv_anz TYPE i.

  SELECT COUNT(*) FROM vbkpf INTO lv_anz
    WHERE bukrs = p_bukrs
      AND gjahr = p_gjahr
      AND budat BETWEEN gv_von AND gv_bis.
  IF lv_anz = 0.
    PERFORM log_meldung USING 'S' 'Keine geparkten Belege in der Periode'.
    RETURN.
  ENDIF.

* im strengen Modus sind Parkbelege ein Fehler, sonst nur Warnung
  IF p_streng = 'X'.
    PERFORM log_meldung USING 'E' 'Geparkte Belege in der Periode vorhanden'.
  ELSE.
    PERFORM log_meldung USING 'W' 'Geparkte Belege in der Periode vorhanden'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PRUEFUNG_ABGRENZUNGEN
*&---------------------------------------------------------------------*
*       offene Vormerkungen aus ZFI_ABGRENZ (Report ZFI_ABGRENZUNG)
*----------------------------------------------------------------------*
FORM pruefung_abgrenzungen.
  DATA lv_anz TYPE i.

  SELECT COUNT(*) FROM zfi_abgrenz INTO lv_anz
    WHERE bukrs  = p_bukrs
      AND budat <= gv_bis
      AND status = space.
  CHECK lv_anz > 0.
  PERFORM log_meldung USING 'E' 'Offene Periodenabgrenzungen nicht gebucht'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PRUEFUNG_WERE_KONTO
*&---------------------------------------------------------------------*
*       Saldo WE/RE-Verrechnungskonto bis Periodenende gegen Toleranz
*----------------------------------------------------------------------*
FORM pruefung_were_konto.
  DATA: lv_hkont TYPE hkont,
        lt_saldo TYPE STANDARD TABLE OF ty_saldo,
        ls_saldo TYPE ty_saldo,
        lv_saldo TYPE dmbtr.

  SELECT SINGLE were_konto FROM zfi_abschl_cust INTO lv_hkont
    WHERE bukrs = p_bukrs.
  IF sy-subrc <> 0 OR lv_hkont IS INITIAL.
    PERFORM log_meldung USING 'I' 'WE/RE-Konto nicht gepflegt - Pruefung entfaellt'.
    RETURN.
  ENDIF.

  SELECT shkzg SUM( dmbtr )
    FROM bsis
    INTO TABLE lt_saldo
    WHERE bukrs  = p_bukrs
      AND hkont  = lv_hkont
      AND budat <= gv_bis
    GROUP BY shkzg.

  LOOP AT lt_saldo INTO ls_saldo.
    lv_saldo = lv_saldo + COND dmbtr( WHEN ls_saldo-shkzg = 'S'
                                      THEN ls_saldo-dmbtr
                                      ELSE - ls_saldo-dmbtr ).
  ENDLOOP.

  IF abs( lv_saldo ) > p_toler.
    PERFORM log_meldung USING 'W' 'Saldo WE/RE-Konto ueber Toleranz'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PRUEFUNG_VERBUCHUNG   (entfernt 2017 - Basis prueft SM13)
*&---------------------------------------------------------------------*
*FORM pruefung_verbuchung.
*  DATA lv_anz TYPE i.
*
*  SELECT COUNT(*) FROM vbhdr INTO lv_anz
*    WHERE vbrc <> 0.
*  IF lv_anz > 0.
*    PERFORM log_meldung USING 'E' 'Abgebrochene Verbuchungen (SM13)'.
*  ENDIF.
*ENDFORM.
