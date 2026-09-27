*&---------------------------------------------------------------------*
*& Include MZPP_WERKERI01 - PAI-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Beenden aus jedem Dynpro
*&---------------------------------------------------------------------*
MODULE exit_command INPUT.
  LEAVE PROGRAM.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Dynpro 0100: Personalnummer pruefen
*&---------------------------------------------------------------------*
MODULE check_pernr INPUT.
  DATA lv_pernr TYPE pernr_d.

  SELECT SINGLE pernr FROM pa0001 INTO lv_pernr
    WHERE pernr =  gv_pernr
      AND endda >= sy-datum
      AND begda <= sy-datum.
  IF sy-subrc <> 0.
    MESSAGE e010 WITH gv_pernr.
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Dynpro 0100: Scan auswerten
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  gv_okcode = ok_code.
  CLEAR ok_code.

  CASE gv_okcode.
    WHEN 'WEITER' OR space.
      PERFORM auftrag_lesen.
      IF gv_ok = abap_false.
        MESSAGE e011 WITH gv_scan.
      ENDIF.
      PERFORM komponenten_lesen.
      LEAVE TO SCREEN 0200.
    WHEN OTHERS.
  ENDCASE.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Dynpro 0200, LOOP AT gt_komp: vom Werker erfasste Charge pruefen
*&---------------------------------------------------------------------*
MODULE tc_komp_modify INPUT.
  IF gs_komp-charg IS NOT INITIAL.
    SELECT SINGLE charg FROM mcha INTO gs_komp-charg
      WHERE matnr = gs_komp-matnr
        AND werks = gs_komp-werks
        AND charg = gs_komp-charg.
    IF sy-subrc <> 0.
      MESSAGE e024 WITH gs_komp-charg gs_komp-matnr.
    ENDIF.
  ENDIF.
  MODIFY gt_komp FROM gs_komp INDEX tc_komp-current_line.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Dynpro 0200: Mengen pruefen (CHAIN)
*&---------------------------------------------------------------------*
MODULE check_mengen_0200 INPUT.
  IF zpp_s_rm-gutmenge <= 0 AND zpp_s_rm-ausschuss <= 0.
    MESSAGE e020.
  ENDIF.

  IF zpp_s_rm-gutmenge > zpp_s_rm-offen.
*   Ueberlieferung bis 10 % erlaubt (Absprache Fertigungsleitung)
    IF zpp_s_rm-gutmenge > zpp_s_rm-offen * '1.1'.
      MESSAGE e021 WITH zpp_s_rm-offen.
    ELSE.
      MESSAGE w022 WITH zpp_s_rm-offen.
    ENDIF.
  ENDIF.

  IF zpp_s_rm-ausschuss > 0 AND zpp_s_rm-grund IS INITIAL.
    MESSAGE e023.
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Dynpro 0200: Buchen / Zurueck
*&---------------------------------------------------------------------*
MODULE user_command_0200 INPUT.
  gv_okcode = ok_code.
  CLEAR ok_code.

  CASE gv_okcode.
    WHEN 'BUCHEN'.
      PERFORM rueckmelden.
      IF gv_ok = abap_false.
*       Fehlermeldung wurde in RUECKMELDEN als Popup gezeigt
        RETURN.
      ENDIF.
      IF zpp_s_rm-endrm = abap_true AND gv_druck = abap_true.
        PERFORM etikett_drucken.
      ENDIF.
      MESSAGE s030 WITH gv_rueck.
      CLEAR: zpp_s_rm, gt_komp.
      LEAVE TO SCREEN 0100.
    WHEN 'ZURUECK'.
      CLEAR: zpp_s_rm, gt_komp.
      LEAVE TO SCREEN 0100.
    WHEN OTHERS.
  ENDCASE.
ENDMODULE.
