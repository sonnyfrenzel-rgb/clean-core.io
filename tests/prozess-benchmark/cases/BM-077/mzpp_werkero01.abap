*&---------------------------------------------------------------------*
*& Include MZPP_WERKERO01 - PBO-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Dynpro 0100: Scan
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'S0100'.
  SET TITLEBAR 'T0100'.
  CLEAR gv_scan.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Dynpro 0200: Mengenerfassung
*&---------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS 'S0200'.
  SET TITLEBAR 'T0200' WITH zpp_s_rm-aufnr zpp_s_rm-vornr.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Endrueckmeldung nur im letzten Vorgang anbieten
*&---------------------------------------------------------------------*
MODULE modify_screen_0200 OUTPUT.
  LOOP AT SCREEN.
    IF screen-name = 'ZPP_S_RM-ENDRM'.
      IF gv_letzter = abap_true.
        screen-input = 1.
      ELSE.
        screen-input = 0.
      ENDIF.
      MODIFY SCREEN.
    ENDIF.
  ENDLOOP.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Table Control Komponenten fuellen
*&---------------------------------------------------------------------*
MODULE tc_komp_init OUTPUT.
  tc_komp-lines = lines( gt_komp ).
ENDMODULE.

MODULE tc_komp_move OUTPUT.
  READ TABLE gt_komp INTO gs_komp INDEX tc_komp-current_line.
ENDMODULE.
