*&---------------------------------------------------------------------*
*&  Include           MZQM_ERGEBNISI02
*&---------------------------------------------------------------------*
*  QM Pruefergebnis-Schnellerfassung am Wareneingang
*  Dynpro 0200: Abbrechen/Zurueck (Funktionstyp E) mit Rueckfrage
*----------------------------------------------------------------------*
MODULE exit_0200 INPUT.

* nichts erfasst -> ohne Rueckfrage raus
  IF gv_data_changed IS INITIAL.
    LEAVE TO SCREEN 0.
  ENDIF.

  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      titlebar              = 'Ergebniserfassung abbrechen'(t01)
      text_question         = 'Erfasste Ergebnisse gehen verloren. Abbrechen?'(q01)
      text_button_1         = 'Ja'(b01)
      text_button_2         = 'Nein'(b02)
      default_button        = '2'
      display_cancel_button = space
    IMPORTING
      answer                = gv_answer
    EXCEPTIONS
      text_not_found        = 1
      OTHERS                = 2.

  IF gv_answer = '1'.
    MESSAGE s031(zqm) WITH gv_prueflos.   "Erfassung zu Los & verworfen
    LEAVE TO SCREEN 0.
  ENDIF.

  CLEAR ok_code.

ENDMODULE.                 " EXIT_0200  INPUT
