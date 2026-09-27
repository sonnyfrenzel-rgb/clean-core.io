*&---------------------------------------------------------------------*
*& Include MZFM_MVB_O01 - PBO-Module
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Module STATUS_0100 OUTPUT - Erfassung
*&---------------------------------------------------------------------*
*& Modifikationsgruppe EIN (Dynpro 0100): Finanzkreis, Jahr,
*& Finanzstelle, Finanzposition, Betrag, Währung. Nach erfolgreicher
*& Prüfung nur noch der Verwendungszweck änderbar.
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'S0100'.
  SET TITLEBAR 'T0100'.

* Finanzkreis wird über SPA/GPA 'FIK' im Dynpro vorgeschlagen
* (Dynprofeld mit Parameter-Id und GET PARAMETER-Kennzeichen)

* nach erfolgreicher Prüfung Kontierung und Betrag nicht mehr ändern
  IF gv_geprueft = abap_true.
    LOOP AT SCREEN.
      IF screen-group1 = 'EIN'.
        screen-input = 0.
        MODIFY SCREEN.
      ENDIF.
    ENDLOOP.
  ENDIF.
ENDMODULE.

*&---------------------------------------------------------------------*
*& Module STATUS_0200 OUTPUT - Genehmigung
*&---------------------------------------------------------------------*
*& Antrag nur beim ersten PBO lesen; danach bleibt GS_KOPF stehen.
*&---------------------------------------------------------------------*
MODULE status_0200 OUTPUT.
  SET PF-STATUS 'S0200'.
  SET TITLEBAR 'T0200'.

  IF gs_kopf IS INITIAL.
    GET PARAMETER ID 'ZMVB' FIELD gv_antrag.
    SELECT SINGLE * FROM zfm_mvb_kopf INTO gs_kopf
      WHERE antrag = gv_antrag.
    IF sy-subrc <> 0.
      MESSAGE a020 WITH gv_antrag.
    ENDIF.
  ENDIF.
ENDMODULE.
