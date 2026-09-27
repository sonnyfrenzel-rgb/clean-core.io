*----------------------------------------------------------------------*
***INCLUDE LZWM_RF_INVO01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Module  STATUS_RF  OUTPUT  (0100, 0200, 0300)
*&---------------------------------------------------------------------*
MODULE status_rf OUTPUT.
  SET PF-STATUS 'RF'.
* Table Control der Uebersicht braucht die Zeilenzahl (auf 0100/0200 egal)
  tc_ueb-lines = go_zaehl->anzahl( ).
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  TC_UEB_GET  OUTPUT  - Zeile fuer Table Control
*&---------------------------------------------------------------------*
MODULE tc_ueb_get OUTPUT.
  READ TABLE go_zaehl->mt_zaehl INTO gs_ueb INDEX tc_ueb-current_line.
  IF sy-subrc <> 0.
    EXIT FROM STEP-LOOP.
  ENDIF.
ENDMODULE.
