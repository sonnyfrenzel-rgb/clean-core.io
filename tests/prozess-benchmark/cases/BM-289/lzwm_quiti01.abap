*----------------------------------------------------------------------*
***INCLUDE LZWM_QUITI01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  TC_POS_MODIFY  INPUT
*&---------------------------------------------------------------------*
MODULE tc_pos_modify INPUT.
  MODIFY gt_pos FROM gs_pos INDEX tc_pos-current_line.
  gv_changed = abap_true.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  DATA lv_ok TYPE sy-ucomm.
  lv_ok = ok_code.
  CLEAR ok_code.

  CASE lv_ok.
    WHEN 'QUIT'.
      PERFORM quittieren.

    WHEN 'DIFF'.
      PERFORM differenz_setzen.

    WHEN 'CANC'.
      IF gv_changed = abap_true.
        CALL FUNCTION 'POPUP_TO_CONFIRM'
          EXPORTING
            text_question         = 'Eingaben verwerfen?'(q01)
            display_cancel_button = space
          IMPORTING
            answer                = gv_answer.
        CHECK gv_answer = '1'.
      ENDIF.
      LEAVE TO SCREEN 0.

*   WHEN 'P+' OR 'P-' OR 'P++' OR 'P--'.   "Blaettern -> Wizard-Modul
  ENDCASE.

ENDMODULE.
