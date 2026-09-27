*&---------------------------------------------------------------------*
*&  Include           ZFI_IC_ABSTIMMUNG_F02
*&  Partnersalden per paralleler RFC
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PARTNER_SALDEN_PARALLEL
*&---------------------------------------------------------------------*
FORM partner_salden_parallel.
  DATA: ls_partner TYPE ty_partner,
        lv_task    TYPE char32,
        lv_ford    TYPE dmbtr,
        lv_verb    TYPE dmbtr,
        lv_msg     TYPE char80.

  CLEAR: gv_gestartet, gv_fertig.

  LOOP AT gt_partner INTO ls_partner.
*   Taskname = Partner-Buchungskreis, damit der Rueckruf zuordnen kann
    lv_task = ls_partner-partner_bukrs.

    CALL FUNCTION 'Z_FI_IC_SALDEN_LESEN'
      STARTING NEW TASK lv_task
      DESTINATION ls_partner-rfcdest
      PERFORMING salden_empfangen ON END OF TASK
      EXPORTING
        iv_bukrs              = ls_partner-partner_bukrs
        iv_vbund              = ls_partner-eigene_vbund
        iv_stichtag           = p_datum
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        resource_failure      = 3.

    CASE sy-subrc.
      WHEN 0.
        ADD 1 TO gv_gestartet.
      WHEN 3.
*       keine freien Dialogprozesse - dieser Partner synchron
        CALL FUNCTION 'Z_FI_IC_SALDEN_LESEN'
          DESTINATION ls_partner-rfcdest
          EXPORTING
            iv_bukrs              = ls_partner-partner_bukrs
            iv_vbund              = ls_partner-eigene_vbund
            iv_stichtag           = p_datum
          IMPORTING
            ev_forderung          = lv_ford
            ev_verbindlichkeit    = lv_verb
          EXCEPTIONS
            communication_failure = 1 MESSAGE lv_msg
            system_failure        = 2 MESSAGE lv_msg
            keine_daten           = 3
            OTHERS                = 4.
        IF sy-subrc = 0.
          PERFORM saldo_setzen USING ls_partner-partner_bukrs lv_ford lv_verb.
        ELSE.
          PERFORM fehler_setzen USING ls_partner-partner_bukrs lv_msg.
        ENDIF.
      WHEN OTHERS.
        PERFORM fehler_setzen USING ls_partner-partner_bukrs lv_msg.
    ENDCASE.
  ENDLOOP.

* auf alle Rueckmeldungen warten, hoechstens 5 Minuten
  WAIT UNTIL gv_fertig >= gv_gestartet UP TO 300 SECONDS.
  IF gv_fertig < gv_gestartet.
    MESSAGE i010 WITH gv_gestartet gv_fertig.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SALDEN_EMPFANGEN
*&---------------------------------------------------------------------*
*       Rueckruf ON END OF TASK
*----------------------------------------------------------------------*
FORM salden_empfangen USING pv_task TYPE clike.
  DATA: lv_ford  TYPE dmbtr,
        lv_verb  TYPE dmbtr,
        lv_msg   TYPE char80,
        lv_bukrs TYPE bukrs.

  RECEIVE RESULTS FROM FUNCTION 'Z_FI_IC_SALDEN_LESEN'
    IMPORTING
      ev_forderung          = lv_ford
      ev_verbindlichkeit    = lv_verb
    EXCEPTIONS
      communication_failure = 1 MESSAGE lv_msg
      system_failure        = 2 MESSAGE lv_msg
      keine_daten           = 3
      OTHERS                = 4.

  lv_bukrs = pv_task.
  IF sy-subrc = 0.
    PERFORM saldo_setzen USING lv_bukrs lv_ford lv_verb.
  ELSEIF sy-subrc = 3.
*   Partner hat keine offenen Posten mit uns - Saldo 0 ist korrekt
    PERFORM saldo_setzen USING lv_bukrs 0 0.
  ELSE.
    PERFORM fehler_setzen USING lv_bukrs lv_msg.
  ENDIF.

  ADD 1 TO gv_fertig.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SALDO_SETZEN
*&---------------------------------------------------------------------*
FORM saldo_setzen USING pv_bukrs TYPE bukrs
                        pv_ford  TYPE dmbtr
                        pv_verb  TYPE dmbtr.
  FIELD-SYMBOLS <ls_saldo> TYPE ty_saldo.

  READ TABLE gt_saldo ASSIGNING <ls_saldo>
    WITH TABLE KEY partner_bukrs = pv_bukrs.
  CHECK sy-subrc = 0.
  <ls_saldo>-par_ford = pv_ford.
  <ls_saldo>-par_verb = pv_verb.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  FEHLER_SETZEN
*&---------------------------------------------------------------------*
FORM fehler_setzen USING pv_bukrs TYPE bukrs
                         pv_text  TYPE c.
  FIELD-SYMBOLS <ls_saldo> TYPE ty_saldo.

  READ TABLE gt_saldo ASSIGNING <ls_saldo>
    WITH TABLE KEY partner_bukrs = pv_bukrs.
  CHECK sy-subrc = 0.
  <ls_saldo>-status = 'F'.
  <ls_saldo>-text   = pv_text.
ENDFORM.

*&---------------------------------------------------------------------*
*& sequentielle Version bis 2015 - nicht mehr gerufen
*&---------------------------------------------------------------------*
*FORM partner_salden_sequentiell.
*  DATA: ls_partner TYPE ty_partner,
*        lv_ford    TYPE dmbtr,
*        lv_verb    TYPE dmbtr,
*        lv_msg     TYPE char80.
*
*  LOOP AT gt_partner INTO ls_partner.
*    CALL FUNCTION 'Z_FI_IC_SALDEN_LESEN'
*      DESTINATION ls_partner-rfcdest
*      EXPORTING
*        iv_bukrs              = ls_partner-partner_bukrs
*        iv_vbund              = ls_partner-eigene_vbund
*        iv_stichtag           = p_datum
*      IMPORTING
*        ev_forderung          = lv_ford
*        ev_verbindlichkeit    = lv_verb
*      EXCEPTIONS
*        communication_failure = 1 MESSAGE lv_msg
*        system_failure        = 2 MESSAGE lv_msg
*        OTHERS                = 3.
*    IF sy-subrc = 0.
*      PERFORM saldo_setzen USING ls_partner-partner_bukrs lv_ford lv_verb.
*    ELSE.
*      PERFORM fehler_setzen USING ls_partner-partner_bukrs lv_msg.
*    ENDIF.
*  ENDLOOP.
*ENDFORM.
