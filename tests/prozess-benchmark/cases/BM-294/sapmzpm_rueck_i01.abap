*&---------------------------------------------------------------------*
*&  Include           SAPMZPM_RUECK_I01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  EXIT_0100  INPUT   (AT EXIT-COMMAND)
*&---------------------------------------------------------------------*
MODULE exit_0100 INPUT.

  IF gv_changed = abap_true.
    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar              = 'Rueckmeldung verlassen'(t01)
        text_question         = 'Erfasste Rueckmeldungen gehen verloren. Verlassen?'(q01)
        default_button        = '2'
        display_cancel_button = space
      IMPORTING
        answer                = gv_answer.
    IF gv_answer <> '1'.
      CLEAR ok_code.
      RETURN.
    ENDIF.
  ENDIF.

  PERFORM entsperren.
  LEAVE PROGRAM.

ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  TC_VORG_MODIFY  INPUT
*&---------------------------------------------------------------------*
MODULE tc_vorg_modify INPUT.

* Plausibilitaet: mehr als 150 % der Planarbeit nur mit Warnung
  IF gs_vorg-ismnw + gs_vorg-ismnw_neu > gs_vorg-arbei * '1.5'.
    MESSAGE w030 WITH gs_vorg-vornr.
  ENDIF.
  MODIFY gt_vorg FROM gs_vorg INDEX tc_vorg-current_line.
  gv_changed = abap_true.

ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  gv_ok = ok_code.
  CLEAR ok_code.

  IF go_grid IS BOUND.
    go_grid->check_changed_data( ).
  ENDIF.

  CASE gv_ok.
    WHEN 'LADEN'.
      PERFORM auftrag_laden.
    WHEN 'TAB_VORG' OR 'TAB_KOMP'.
      ts_rueck-activetab = gv_ok.
    WHEN 'SICH'.
      PERFORM sichern.
    WHEN OTHERS.
*     Blaettern Table Control / Enter
  ENDCASE.

ENDMODULE.
