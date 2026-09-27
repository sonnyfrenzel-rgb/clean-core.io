*&---------------------------------------------------------------------*
*&  Include           ZHR_JUBILAEUM_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  MITARBEITER_LESEN
*&---------------------------------------------------------------------*
FORM mitarbeiter_lesen.
* aktive Mitarbeiter (STAT2 = 3) mit aktueller Org-Zuordnung
  SELECT a~pernr b~ename b~werks
    FROM pa0000 AS a
    INNER JOIN pa0001 AS b
      ON b~pernr = a~pernr
    INTO TABLE gt_ma
    WHERE a~pernr IN s_pernr
      AND a~stat2 = '3'
      AND a~begda <= sy-datum
      AND a~endda >= sy-datum
      AND b~werks IN s_werks
      AND b~begda <= sy-datum
      AND b~endda >= sy-datum.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  JUBILAEUM_PRUEFEN
*&---------------------------------------------------------------------*
FORM jubilaeum_pruefen USING ps_ma TYPE ty_ma.
  DATA: lv_eintritt TYPE datum,
        lv_jahre    TYPE i,
        lv_stufe    TYPE char2,
        ls_out      TYPE ty_out.

  TRY.
      lv_eintritt = lcl_jubilaeum=>eintritt( ps_ma-pernr ).
    CATCH lcx_kein_datum.
      WRITE: / ps_ma-pernr, ps_ma-ename, 'kein Eintrittsdatum gepflegt'.
      RETURN.
  ENDTRY.

* Jubilaeum nur, wenn der Eintrittsmonat dem Auswertungsmonat entspricht
  CHECK lv_eintritt+4(2) = p_monat+4(2).

  lv_jahre = p_monat(4) - lv_eintritt(4).
  lv_stufe = lcl_jubilaeum=>stufe_ermitteln( lv_jahre ).
  CHECK lv_stufe IS NOT INITIAL.

  ls_out-pernr    = ps_ma-pernr.
  ls_out-ename    = ps_ma-ename.
  ls_out-werks    = ps_ma-werks.
  ls_out-eintritt = lv_eintritt.
  ls_out-jahre    = lv_jahre.
  ls_out-stufe    = lv_stufe.
  ls_out-betrag   = lcl_jubilaeum=>praemie( iv_stufe = lv_stufe
                                            iv_werks = ps_ma-werks ).
  APPEND ls_out TO gt_out.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LISTE_ANZEIGEN
*&---------------------------------------------------------------------*
FORM liste_anzeigen.
  DATA: lt_fcat TYPE slis_t_fieldcat_alv,
        ls_fcat TYPE slis_fieldcat_alv.

  DEFINE add_fcat.
    CLEAR ls_fcat.
    ls_fcat-fieldname = &1.
    ls_fcat-seltext_m = &2.
    APPEND ls_fcat TO lt_fcat.
  END-OF-DEFINITION.

  add_fcat 'PERNR'    'Personalnr.'.
  add_fcat 'ENAME'    'Name'.
  add_fcat 'WERKS'    'Pers.Bereich'.
  add_fcat 'EINTRITT' 'Eintritt'.
  add_fcat 'JAHRE'    'Jahre'.
  add_fcat 'BETRAG'   'Praemie'.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      it_fieldcat        = lt_fcat
    TABLES
      t_outtab           = gt_out
    EXCEPTIONS
      program_error      = 1
      OTHERS             = 2.
  IF sy-subrc <> 0.
    MESSAGE s052 DISPLAY LIKE 'E'.
  ENDIF.
ENDFORM.
