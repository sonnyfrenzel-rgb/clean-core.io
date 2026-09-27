REPORT ztv_release_settlement.
************************************************************************
* Reisekosten - Monatslauf: genehmigte Reisen mit Belegen zur Abrechnung
* freigeben und die Reiseabrechnung (RPRTEC00) als Hintergrundjob starten
* ANTRG '4' = genehmigt; ABREC '0' = offen, '1' = abzurechnen
* 2015-09 FI-TV  Anlage (Ersatz fuer manuelle Freigabe PR05)
************************************************************************
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: lr_pernr    TYPE RANGE OF pernr_d,
      lv_jobname  TYPE btcjob VALUE 'ZTV_REISEABRECHNUNG',
      lv_jobcount TYPE btcjobcnt.

START-OF-SELECTION.
  SELECT p~pernr, p~reinr
    FROM ptrv_perio AS p
    INNER JOIN pa0001 AS a
      ON a~pernr = p~pernr
    WHERE p~antrg = '4'
      AND p~abrec = '0'
      AND a~bukrs = @p_bukrs
      AND a~endda = '99991231'
    INTO TABLE @DATA(lt_trips).
  IF lt_trips IS INITIAL.
    MESSAGE s398(00) WITH 'Keine genehmigten offenen Reisen'.
    LEAVE LIST-PROCESSING.
  ENDIF.

  SELECT pernr, reinr
    FROM ptrv_srec
    FOR ALL ENTRIES IN @lt_trips
    WHERE pernr = @lt_trips-pernr
      AND reinr = @lt_trips-reinr
    INTO TABLE @DATA(lt_srec).
  SORT lt_srec BY pernr reinr.

  LOOP AT lt_trips INTO DATA(ls_trip).
    READ TABLE lt_srec WITH KEY pernr = ls_trip-pernr
                                reinr = ls_trip-reinr
         BINARY SEARCH TRANSPORTING NO FIELDS.
    IF sy-subrc <> 0.
      WRITE: / ls_trip-pernr, ls_trip-reinr, 'ohne Belege - nicht freigegeben'.
      CONTINUE.
    ENDIF.
    APPEND VALUE #( sign = 'I' option = 'EQ' low = ls_trip-pernr ) TO lr_pernr.
    IF p_test IS INITIAL.
      UPDATE ptrv_perio SET abrec = '1'
        WHERE pernr = ls_trip-pernr
          AND reinr = ls_trip-reinr.
    ENDIF.
  ENDLOOP.

  IF p_test = abap_true OR lr_pernr IS INITIAL.
    WRITE: / 'Testlauf oder nichts freizugeben - kein Job eingeplant'.
    RETURN.
  ENDIF.
  COMMIT WORK.

  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname  = lv_jobname
    IMPORTING
      jobcount = lv_jobcount
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Job konnte nicht angelegt werden'.
  ENDIF.

  SUBMIT rprtec00
    WITH pnppernr IN lr_pernr
    USING SELECTION-SET 'ZMONAT'
    VIA JOB lv_jobname NUMBER lv_jobcount
    AND RETURN.

  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount  = lv_jobcount
      jobname   = lv_jobname
      strtimmed = abap_true
    EXCEPTIONS
      OTHERS    = 1.
  WRITE: / 'Reiseabrechnung eingeplant, Job', lv_jobname, lv_jobcount.
