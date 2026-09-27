*&---------------------------------------------------------------------*
*&  Include           MZPM_STOER_I01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  gv_ok = ok_code.
  CLEAR ok_code.

  CASE gv_ok.
    WHEN 'BACK' OR 'EXIT'.
      LEAVE PROGRAM.

    WHEN 'M1' OR 'M2'.
      gs_meld-qmart = gv_ok.

      SELECT SINGLE e~equnr z~iwerk t~eqktx
        FROM equi AS e
        INNER JOIN equz AS z ON z~equnr = e~equnr
                            AND z~datbi = '99991231'
        LEFT OUTER JOIN eqkt AS t ON t~equnr = e~equnr
                                 AND t~spras = sy-langu
        INTO (gs_meld-equnr, gs_meld-iwerk, gs_meld-eqktx)
        WHERE e~equnr = gv_equnr_in.
      IF sy-subrc <> 0.
        MESSAGE e001 WITH gv_equnr_in.         "Equipment & nicht vorhanden
      ENDIF.

      AUTHORITY-CHECK OBJECT 'I_SWERK'
        ID 'TCD'   FIELD 'IW21'
        ID 'SWERK' FIELD gs_meld-iwerk.
      IF sy-subrc <> 0.
*       harte Sperre - Terminal wird im Werk frei betrieben
        MESSAGE a002 WITH gs_meld-iwerk.
      ENDIF.

*     schon eine offene Meldung zum Equipment?
      SELECT SINGLE qmnum FROM viqmel INTO gv_qmnum
        WHERE equnr = gs_meld-equnr
          AND qmdab = '00000000'
          AND qmart = gs_meld-qmart.
      IF sy-subrc = 0.
        CALL FUNCTION 'POPUP_TO_CONFIRM'
          EXPORTING
            text_question         = 'Offene Meldung vorhanden. Trotzdem neue anlegen?'(q01)
            default_button        = '2'
            display_cancel_button = space
          IMPORTING
            answer                = gv_answer.
        IF gv_answer <> '1'.
          LEAVE TO SCREEN 0100.
        ENDIF.
      ENDIF.

*     PERFORM log_msg USING 'I' '010' gs_meld-equnr.   "zu viel Log
      LEAVE TO SCREEN 0200.

    WHEN OTHERS.
  ENDCASE.

ENDMODULE.                 " USER_COMMAND_0100  INPUT

*&---------------------------------------------------------------------*
*&      Module  EXIT_0200  INPUT   (AT EXIT-COMMAND)
*&---------------------------------------------------------------------*
MODULE exit_0200 INPUT.
  CLEAR: gs_meld, ok_code.
  LEAVE TO SCREEN 0100.
ENDMODULE.                 " EXIT_0200  INPUT

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0200  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.

  gv_ok = ok_code.
  CLEAR ok_code.

  CASE gv_ok.
    WHEN 'SAVE'.
*     Kurztext ist Mussfeld auf 0200 (vorher MESSAGE e004)
      IF gs_meld-ausfall = abap_true AND gs_meld-priok > '2'.
*       Anlagenstillstand -> mind. Prio 2 (Absprache Leitstand 2012)
        MESSAGE w005.
        gs_meld-priok = '2'.
      ENDIF.
      PERFORM meldung_anlegen.
    WHEN OTHERS.
  ENDCASE.

ENDMODULE.                 " USER_COMMAND_0200  INPUT
