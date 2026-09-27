*----------------------------------------------------------------------*
***INCLUDE MZVCERTI01 - PAI-Module
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module EXIT_COMMAND INPUT  (AT EXIT-COMMAND, Dynpro 0100 und 0200)
*&---------------------------------------------------------------------*
MODULE exit_command INPUT.
  IF gv_locked = 'X'.
    PERFORM unlock_cert.
  ENDIF.
  LEAVE PROGRAM.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0100 INPUT
*&---------------------------------------------------------------------*
*& Modus bestimmen, Kreditor und Berechtigung prüfen, vorhandenes
*& Zertifikat lesen, im Pflegemodus sperren, Detailbild rufen.
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  gv_ucomm = ok_code.
  CLEAR ok_code.

  CASE gv_ucomm.
    WHEN 'SHOW'.
      gv_mode = gc_display.
    WHEN 'CREA'.
      gv_mode = gc_create.
    WHEN 'CHNG'.
      gv_mode = gc_change.
    WHEN OTHERS.
      RETURN.
  ENDCASE.

  PERFORM check_vendor.
  PERFORM check_authority USING gv_mode.

  SELECT SINGLE * FROM zvcert INTO gs_old
    WHERE lifnr = zvcert-lifnr
      AND ctype = zvcert-ctype.
  IF sy-subrc = 0 AND gv_mode = gc_create.
    MESSAGE e003 WITH zvcert-lifnr zvcert-ctype.
  ELSEIF sy-subrc <> 0 AND gv_mode <> gc_create.
    MESSAGE e004 WITH zvcert-lifnr zvcert-ctype.
  ENDIF.

  IF gv_mode <> gc_display.
    PERFORM lock_cert.
  ENDIF.
  IF gv_mode <> gc_create.
    zvcert = gs_old.
  ENDIF.
  CALL SCREEN 200.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module USER_COMMAND_0200 INPUT
*&---------------------------------------------------------------------*
*& SAVE  - prüfen, sichern, entsperren, zurück zum Einstieg
*& DELE  - löschen (mit Abfrage), entsperren, zurück zum Einstieg
*& BACK/CANC - entsperren, zurück zum Einstieg
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
  gv_ucomm = ok_code.
  CLEAR ok_code.

  CASE gv_ucomm.
    WHEN 'SAVE'.
      IF gv_mode = gc_display.
        MESSAGE s010.
        RETURN.
      ENDIF.
      PERFORM validate_cert.
      PERFORM save_cert.
      PERFORM unlock_cert.
      LEAVE TO SCREEN 100.
    WHEN 'DELE'.
      PERFORM delete_cert.
      PERFORM unlock_cert.
      LEAVE TO SCREEN 100.
    WHEN 'BACK' OR 'CANC'.
      PERFORM unlock_cert.
      LEAVE TO SCREEN 100.
  ENDCASE.
ENDMODULE.
