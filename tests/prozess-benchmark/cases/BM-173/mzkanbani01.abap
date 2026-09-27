*----------------------------------------------------------------------*
***INCLUDE MZKANBANI01 - PBO/PAI-Module
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'SCAN'.
  SET TITLEBAR '100'.
* Versorgungsbereich aus Benutzerparameter PVB vorbelegen
  IF gv_prvbe IS INITIAL.
    GET PARAMETER ID 'PVB' FIELD gv_prvbe.
  ENDIF.
  CLEAR gv_pkkey.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  gv_save = ok_code.
  CLEAR ok_code.
  CASE gv_save.
    WHEN 'BACK' OR 'EXIT'.
      LEAVE PROGRAM.
    WHEN 'ENTER' OR space.
      PERFORM behaelter_lesen.
      PERFORM leermelden.
      LEAVE TO SCREEN 200.
*   WHEN 'ANZ'.                        "Regelkreis anzeigen - 2012 raus
*     SET PARAMETER ID 'PKN' FIELD gs_pkps-pknum.
*     CALL TRANSACTION 'PK13N' AND SKIP FIRST SCREEN.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0200  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS 'OK'.
  SET TITLEBAR '200'.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0200  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
  gv_save = ok_code.
  CLEAR ok_code.
  CASE gv_save.
    WHEN 'NEXT' OR 'ENTER' OR space.
      CLEAR: gs_pkps, gs_pkhd, gv_msg.
      LEAVE TO SCREEN 100.
    WHEN 'EXIT'.
      LEAVE PROGRAM.
  ENDCASE.
ENDMODULE.
