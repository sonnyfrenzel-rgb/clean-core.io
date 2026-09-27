*&---------------------------------------------------------------------*
*&  Include           ZFI_PERIODENABSCHLUSS_F02
*&  Periodensteuerung (T001B) - direkt, OB52 per BDC war zu fehleranfaellig
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PERIODE_SCHLIESSEN
*&---------------------------------------------------------------------*
*       Intervall 1 jeder Kontoart: steht die Von-Periode auf der
*       abzuschliessenden Periode, wird sie um eins weitergesetzt.
*----------------------------------------------------------------------*
FORM periode_schliessen.
  DATA: lt_t001b TYPE STANDARD TABLE OF t001b,
        ls_t001b TYPE t001b,
        lv_varkey TYPE vim_enqkey,
        lv_cnt    TYPE i.

  lv_varkey = gv_opvar.
  CALL FUNCTION 'ENQUEUE_E_TABLE'
    EXPORTING
      tabname        = 'T001B'
      varkey         = lv_varkey
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    PERFORM log_meldung USING 'E' 'Periodensteuerung gesperrt'.
    RETURN.
  ENDIF.

  SELECT * FROM t001b INTO TABLE lt_t001b
    WHERE rrcty = '0'
      AND bukrs = gv_opvar.

  LOOP AT lt_t001b INTO ls_t001b.
    IF ls_t001b-frye1 <> p_gjahr OR ls_t001b-frpe1 <> p_monat.
      PERFORM log_meldung USING 'W' 'Intervall 1 steht nicht auf der Periode'.
      CONTINUE.
    ENDIF.

    IF p_monat = 12.
      ls_t001b-frpe1 = 1.
      ls_t001b-frye1 = p_gjahr + 1.
    ELSE.
      ls_t001b-frpe1 = p_monat + 1.
    ENDIF.

    MODIFY t001b FROM ls_t001b.
    ADD 1 TO lv_cnt.
  ENDLOOP.

  IF lv_cnt > 0.
    COMMIT WORK.
    PERFORM log_meldung USING 'S' 'Periode geschlossen'.
  ELSE.
    PERFORM log_meldung USING 'W' 'Keine Kontoart geaendert'.
  ENDIF.

  CALL FUNCTION 'DEQUEUE_E_TABLE'
    EXPORTING
      tabname = 'T001B'
      varkey  = lv_varkey.
ENDFORM.

*&---------------------------------------------------------------------*
*& alte Variante ueber OB52 per Batch-Input (bis 2009), nicht mehr
*& gerufen - Dynpro-Folge nach EHP4 geaendert
*&---------------------------------------------------------------------*
*FORM periode_schliessen_bdc.
*  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
*        ls_bdc TYPE bdcdata,
*        lt_msg TYPE STANDARD TABLE OF bdcmsgcoll.
*
*  CLEAR ls_bdc.
*  ls_bdc-program  = 'SAPL0F00'.
*  ls_bdc-dynpro   = '0060'.
*  ls_bdc-dynbegin = 'X'.
*  APPEND ls_bdc TO lt_bdc.
*  CLEAR ls_bdc.
*  ls_bdc-fnam = 'BDC_OKCODE'.
*  ls_bdc-fval = '=POSI'.
*  APPEND ls_bdc TO lt_bdc.
**  ... Positionieren auf Variante, Intervall 1 aendern ...
*  CALL TRANSACTION 'OB52' USING lt_bdc MODE 'N' UPDATE 'S'
*                          MESSAGES INTO lt_msg.
*  IF sy-subrc <> 0.
*    PERFORM log_meldung USING 'E' 'OB52 fehlgeschlagen'.
*  ENDIF.
*ENDFORM.
