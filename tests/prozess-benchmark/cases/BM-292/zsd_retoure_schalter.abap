*&---------------------------------------------------------------------*
*& Report  ZSD_RETOURE_SCHALTER
*&---------------------------------------------------------------------*
*& Retourenannahme am Schalter: Faktura pruefen, Positionen im Popup
*& waehlen, Retourenauftrag ZRE per Batch-Input VA01 anlegen.
*&---------------------------------------------------------------------*
*& 2007-02-12 FHA  Ersterstellung (Filialen Nord)
*& 2011-09-30 FHA  Frist 30 Tage nur noch Warnung (Kulanz Filialleiter)
*& 2018-04-16 TWE  Protokolltabelle ZSD_RETOURE_LOG
*&---------------------------------------------------------------------*
REPORT zsd_retoure_schalter.

INCLUDE zsd_retoure_schalter_top.
INCLUDE zsd_retoure_schalter_f01.

START-OF-SELECTION.
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  CASE ok_code.
    WHEN 'BACK' OR 'EXIT'.
      LEAVE PROGRAM.
    WHEN 'WEITER'.
      CLEAR ok_code.
      PERFORM rechnung_pruefen.
*   WHEN 'BON'.                 "Kassenbon-Retoure -> ZPOS_STORNO
*     PERFORM bon_retoure.
  ENDCASE.

ENDMODULE.
