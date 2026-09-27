*&---------------------------------------------------------------------*
*& Include MZFI_PAYRELO01 - PBO-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module STATUS_0100 OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  DATA lt_excl TYPE STANDARD TABLE OF sy-ucomm.

  CLEAR lt_excl.
  IF gv_locked = abap_false.
*   ohne Sperre auf den Lauf keine Freigabe, Ablehnung, Sicherung
    APPEND 'REL'  TO lt_excl.
    APPEND 'REJ'  TO lt_excl.
    APPEND 'SAVE' TO lt_excl.
    APPEND 'F110' TO lt_excl.
  ELSEIF gv_changed = abap_true.
*   erst sichern, dann Zahllauf starten
    APPEND 'F110' TO lt_excl.
  ENDIF.
  SET PF-STATUS 'STATUS_0100' EXCLUDING lt_excl.
  SET TITLEBAR 'T100' WITH gv_laufd gv_laufi.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module TC_PAY_CHANGE_TC_ATTR OUTPUT
*&---------------------------------------------------------------------*
MODULE tc_pay_change_tc_attr OUTPUT.
  DESCRIBE TABLE gt_pay LINES tc_pay-lines.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module TC_PAY_GET_LINES OUTPUT - Ampel je Zahlung
*&---------------------------------------------------------------------*
MODULE tc_pay_get_lines OUTPUT.
  CASE gs_pay-status.
    WHEN gc_status_final.
      gs_pay-icon = icon_green_light.
    WHEN gc_status_first.
      gs_pay-icon = icon_yellow_light.
    WHEN gc_status_reject.
      gs_pay-icon = icon_red_light.
    WHEN OTHERS.
      gs_pay-icon = icon_light_out.
  ENDCASE.
ENDMODULE.
