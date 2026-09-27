*&---------------------------------------------------------------------*
*& Include MZPM_FREISCHALT_I01 - PAI-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module EXIT_COMMAND INPUT  (AT EXIT-COMMAND, Dynpro 0100 und 0200)
*&---------------------------------------------------------------------*
* Abbrechen/Beenden ohne Rückfrage: ungesicherte Änderungen verfallen,
* die Sperre auf den Auftrag wird aufgehoben.
*----------------------------------------------------------------------*
MODULE exit_command INPUT.
  CASE ok_code.
    WHEN 'CANC' OR 'EXIT'.
      CALL FUNCTION 'DEQUEUE_EZPM_FREISCH'
        EXPORTING
          aufnr = gv_aufnr.
      LEAVE PROGRAM.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0100 INPUT
*&---------------------------------------------------------------------*
* WEIT: Auftrag prüfen und sperren, Schritte lesen, weiter zu 0200
* BACK: Transaktion verlassen
*----------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  CASE ok_code.
    WHEN 'WEIT'.
      CLEAR ok_code.
      PERFORM auftrag_lesen.
      PERFORM schritte_lesen.
      SET PARAMETER ID 'ANR' FIELD gv_aufnr.
      LEAVE TO SCREEN 0200.
    WHEN 'BACK'.
      LEAVE PROGRAM.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module TC_STEPS_MODIFY INPUT  (je Zeile des Table Controls)
*&---------------------------------------------------------------------*
MODULE tc_steps_modify INPUT.
  MODIFY gt_steps FROM gs_step INDEX tc_steps-current_line
         TRANSPORTING mark.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0200 INPUT
*&---------------------------------------------------------------------*
* SETZ  Schritt gesetzt (Monteur)      PRUEF  Schritt geprüft (2. Person)
* ZURUE Schritt zurückgenommen         SAVE   Sichern
* BACK  zurück zum Einstieg, bei ungesicherten Änderungen Rückfrage
*----------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
  DATA lv_answer TYPE c LENGTH 1.

  CASE ok_code.
    WHEN 'SETZ'.
      PERFORM schritt_setzen.

    WHEN 'PRUEF'.
      PERFORM schritt_pruefen.

    WHEN 'ZURUE'.
      PERFORM schritt_zuruecknehmen.

    WHEN 'SAVE'.
      PERFORM sichern.

    WHEN 'BACK'.
      IF gv_changed = abap_true.
        CALL FUNCTION 'POPUP_TO_CONFIRM'
          EXPORTING
            titlebar      = 'Freischaltung'
            text_question = 'Änderungen an der Freischaltung sichern?'
          IMPORTING
            answer        = lv_answer
          EXCEPTIONS
            OTHERS        = 1.
        IF lv_answer = '1'.
          PERFORM sichern.
        ELSEIF lv_answer = 'A'.
          RETURN.
        ENDIF.
      ENDIF.
      CALL FUNCTION 'DEQUEUE_EZPM_FREISCH'
        EXPORTING
          aufnr = gv_aufnr.
      CLEAR: gt_steps, gv_changed.
      LEAVE TO SCREEN 0100.
  ENDCASE.
  CLEAR ok_code.
ENDMODULE.
