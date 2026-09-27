*----------------------------------------------------------------------*
***INCLUDE LZWM_QUITF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  QUITTIEREN
*&---------------------------------------------------------------------*
*       Markierte Positionen mit Ist- und Differenzmenge quittieren
*----------------------------------------------------------------------*
FORM quittieren.

  DATA: lt_conf TYPE STANDARD TABLE OF ltap_conf,
        ls_conf TYPE ltap_conf,
        lv_anz  TYPE i.

  LOOP AT gt_pos INTO gs_pos WHERE mark = abap_true.
*   Ist + Differenz muss Soll ergeben, sonst stimmt die Kiste nicht
    IF gs_pos-nista + gs_pos-ndifa <> gs_pos-vsola.
      MESSAGE e021 WITH gs_pos-tapos.
    ENDIF.
    CLEAR ls_conf.
    ls_conf-tapos = gs_pos-tapos.
    ls_conf-nista = gs_pos-nista.
    ls_conf-ndifa = gs_pos-ndifa.
    ls_conf-altme = gs_pos-altme.
    APPEND ls_conf TO lt_conf.
  ENDLOOP.

  IF lt_conf IS INITIAL.
    MESSAGE i022.                       "Bitte Positionen markieren
    RETURN.
  ENDIF.

  CALL FUNCTION 'L_TO_CONFIRM'
    EXPORTING
      i_lgnum                        = gv_lgnum
      i_tanum                        = gv_tanum
      i_quknz                        = '1'
      i_commit_work                  = space
    TABLES
      t_ltap_conf                    = lt_conf
    EXCEPTIONS
      to_confirmed                   = 1
      to_doesnt_exist                = 2
      nothing_to_do                  = 3
      OTHERS                         = 99.
  IF sy-subrc <> 0.
    ROLLBACK WORK.
    MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
            WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
  ENDIF.

  COMMIT WORK AND WAIT.
  lv_anz = lines( lt_conf ).
  MESSAGE s023 WITH gv_tanum lv_anz.
  gv_done = abap_true.
  LEAVE TO SCREEN 0.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  DIFFERENZ_SETZEN
*&---------------------------------------------------------------------*
*       Fehlmenge der Cursorzeile als Differenz buchen (Revision 2018)
*----------------------------------------------------------------------*
FORM differenz_setzen.

  DATA lv_line TYPE i.

  GET CURSOR LINE lv_line.
  lv_line = lv_line + tc_pos-top_line - 1.
  READ TABLE gt_pos INTO gs_pos INDEX lv_line.
  CHECK sy-subrc = 0.                   "Cursor nicht auf Position

  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      text_question         = 'Fehlmenge als Differenz buchen?'(q02)
      display_cancel_button = space
    IMPORTING
      answer                = gv_answer.
  IF gv_answer = '1'.
    gs_pos-ndifa = gs_pos-vsola - gs_pos-nista.
    gs_pos-mark  = abap_true.
    MODIFY gt_pos FROM gs_pos INDEX lv_line.
    gv_changed = abap_true.
  ENDIF.

ENDFORM.
