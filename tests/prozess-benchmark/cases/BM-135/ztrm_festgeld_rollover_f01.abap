*----------------------------------------------------------------------*
***INCLUDE ZTRM_FESTGELD_ROLLOVER_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form ZINSQUELLE_BESTIMMEN - Tabelle mit den Zinssätzen
*&---------------------------------------------------------------------*
FORM zinsquelle_bestimmen.
  SELECT SINGLE low FROM tvarvc INTO gv_tab
    WHERE name = 'ZTRM_ZINSQUELLE'
      AND type = 'P'.
  IF sy-subrc <> 0 OR gv_tab IS INITIAL.
    gv_tab = 'ZTRM_ZINS_TAG'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FAELLIGE_LESEN - fällige Festgelder mit aktiver Rollover-Regel
*&---------------------------------------------------------------------*
FORM faellige_lesen.
  SELECT f~bukrs f~rfha f~kontrh f~wgschft1 r~lz_tage
    FROM vtbfha AS f
    INNER JOIN ztrm_roll AS r ON r~bukrs = f~bukrs
                             AND r~rfha  = f~rfha
    INTO TABLE gt_fha
    WHERE f~bukrs     = p_bukrs
      AND f~sgsart    = '51A'
      AND f~delfz     = p_datum
      AND r~auto_roll = 'X'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PROLONGIEREN - neues Festgeld über den fälligen Nominalbetrag
*&---------------------------------------------------------------------*
FORM prolongieren USING is_fha TYPE ty_fha.
  DATA: lv_zins   TYPE ztrm_zinssatz,
        lv_nomin  TYPE vtbfhapo-bzbetr,
        lv_rfha   TYPE vtbfha-rfha,
        lt_return TYPE STANDARD TABLE OF bapiret2.

* Zinssatz für Währung und Laufzeit am Stichtag - Quelle je nach TVARVC
  SELECT SINGLE zins FROM (gv_tab) INTO lv_zins
    WHERE waers    = is_fha-wgschft1
      AND laufzeit = is_fha-lz_tage
      AND datum    = p_datum.
  IF sy-subrc <> 0.
    APPEND VALUE #( rfha_alt = is_fha-rfha text = 'Kein Zinssatz - manuell' ) TO gt_prot.
    RETURN.
  ENDIF.

* fälliger Nominalbetrag = Kapitalzugang des alten Geschäfts
  SELECT SINGLE bzbetr FROM vtbfhapo INTO lv_nomin
    WHERE bukrs   = is_fha-bukrs
      AND rfha    = is_fha-rfha
      AND sfhazba = '1100'.

  IF p_test = 'X'.
    APPEND VALUE #( rfha_alt = is_fha-rfha zins = lv_zins text = 'Testlauf' ) TO gt_prot.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_FTR_TIMEDEPOSIT_CREATE'
    EXPORTING
      companycode          = is_fha-bukrs
      producttype          = '51A'
      transactiontype      = '100'
      partner              = is_fha-kontrh
      startterm            = p_datum
      endterm              = p_datum + is_fha-lz_tage
      nominalamount        = lv_nomin
      currency             = is_fha-wgschft1
      interestrate         = lv_zins
    IMPORTING
      financialtransaction = lv_rfha
    TABLES
      return               = lt_return.

  IF line_exists( lt_return[ type = 'E' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    APPEND VALUE #( rfha_alt = is_fha-rfha zins = lv_zins
                    text = lt_return[ type = 'E' ]-message ) TO gt_prot.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    gv_neu = gv_neu + 1.
    APPEND VALUE #( rfha_alt = is_fha-rfha rfha_neu = lv_rfha zins = lv_zins
                    text = 'Prolongiert' ) TO gt_prot.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUCHUNGSLAUF_EINPLANEN - TBB1 (RFTBBB00) als Hintergrundjob
*&---------------------------------------------------------------------*
FORM buchungslauf_einplanen.
  DATA: lv_job   TYPE tbtcjob-jobname VALUE 'ZTRM_ROLLOVER_TBB1',
        lv_count TYPE tbtcjob-jobcount,
        lt_sel   TYPE STANDARD TABLE OF rsparams.

  lt_sel = VALUE #( ( selname = 'S_BUKRS' kind = 'S' sign = 'I' option = 'EQ' low = p_bukrs )
                    ( selname = 'P_BIS'   kind = 'P' low = p_datum ) ).

  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname  = lv_job
    IMPORTING
      jobcount = lv_count
    EXCEPTIONS
      OTHERS   = 1.
  IF sy-subrc <> 0.
    MESSAGE 'Buchungsjob konnte nicht angelegt werden' TYPE 'I'.
    RETURN.
  ENDIF.

  SUBMIT rftbbb00 WITH SELECTION-TABLE lt_sel
         VIA JOB lv_job NUMBER lv_count
         AND RETURN.

  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount  = lv_count
      jobname   = lv_job
      strtimmed = 'X'
    EXCEPTIONS
      OTHERS    = 1.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PROTOKOLL
*&---------------------------------------------------------------------*
FORM protokoll.
  DATA ls_prot TYPE ty_prot.
  LOOP AT gt_prot INTO ls_prot.
    WRITE: / ls_prot-rfha_alt, ls_prot-rfha_neu, ls_prot-zins, ls_prot-text.
  ENDLOOP.
ENDFORM.
