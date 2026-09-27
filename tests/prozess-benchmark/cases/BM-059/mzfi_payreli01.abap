*&---------------------------------------------------------------------*
*& Include MZFI_PAYRELI01 - PAI-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module EXIT_COMMAND_0100 INPUT   (AT EXIT-COMMAND)
*&---------------------------------------------------------------------*
MODULE exit_command_0100 INPUT.
* Abbrechen / Beenden: Sperre faellt mit dem Programmende
* IF gv_changed = 'X'.     "Rueckfrage - Anforderung 2013, nie umgesetzt
*   PERFORM confirm_loss.
* ENDIF.
  LEAVE PROGRAM.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module TC_PAY_MODIFY INPUT - Markierung aus dem Table Control
*&---------------------------------------------------------------------*
MODULE tc_pay_modify INPUT.
  MODIFY gt_pay FROM gs_pay INDEX tc_pay-current_line TRANSPORTING mark.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0100 INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  gv_okcode = ok_code.
  CLEAR ok_code.

  CASE gv_okcode.
    WHEN 'READ'.
*     Lauf sperren und Vorschlag lesen
      PERFORM lock_run.
    WHEN 'REL'.
      PERFORM release_marked.
    WHEN 'REJ'.
*     CALL SCREEN 0200 STARTING AT 10 5.  "Grund-Popup - ersetzt 2013
      PERFORM reject_marked.
    WHEN 'SAVE'.
      PERFORM save_releases.
    WHEN 'F110'.
      PERFORM start_payment_run.
    WHEN 'BACK'.
      IF gv_changed = abap_true.
        CALL FUNCTION 'POPUP_TO_CONFIRM'
          EXPORTING
            titlebar              = 'Zahlungsfreigabe verlassen'(t03)
            text_question         = 'Ungesicherte Freigaben gehen verloren. Verlassen?'(q03)
            text_button_1         = 'Ja'(b03)
            text_button_2         = 'Nein'(b04)
            default_button        = '2'
            display_cancel_button = space
          IMPORTING
            answer                = gv_answer
          EXCEPTIONS
            text_not_found        = 1
            OTHERS                = 2.
      ELSE.
        gv_answer = '1'.
      ENDIF.
      IF gv_answer = '1'.
        PERFORM unlock_run.
        LEAVE TO SCREEN 0.
      ENDIF.
*   WHEN 'PRNT'.                  "Freigabeprotokoll - 2016 entfernt
*     PERFORM print_protocol.
    WHEN OTHERS.
*     Enter / Blaettern im Table Control
  ENDCASE.

* Bild 0100 neu prozessieren
  LEAVE TO SCREEN 0100.
ENDMODULE.
