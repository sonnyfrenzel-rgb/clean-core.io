*&---------------------------------------------------------------------*
*& Report  ZQM_PM_PFLEGE   (Transaktion ZQM_PM)
*&---------------------------------------------------------------------*
*& Pflege Pruefmittelstamm mit Kalibrierung, Sperren und
*& Aenderungsbelegen. Ersetzt SM30-View ZQM_V_PM (Audit ISO 17025).
*&---------------------------------------------------------------------*
*& 2016-04-11 LPE  Ersterstellung
*& 2017-01-23 LPE  Kalibrierergebnis n.i.O. -> Auftrag im PM-System (RFC)
*& 2022-09-12 EXT  Aenderungen gesammelt als Aktionsobjekte, Beleg je Satz
*&---------------------------------------------------------------------*
REPORT zqm_pm_pflege.

INCLUDE zqm_pm_pflege_top.
INCLUDE zqm_pm_pflege_c01.
INCLUDE zqm_pm_pflege_c02.
INCLUDE zqm_pm_pflege_i01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  AUTHORITY-CHECK OBJECT 'ZQM_PMPFL'
    ID 'ACTVT' FIELD '02'
    ID 'WERKS' FIELD p_werk.
  IF sy-subrc <> 0.
    MESSAGE e700(zqm) WITH p_werk.                 "keine Pflegeberechtigung
  ENDIF.

  SELECT * FROM zqm_pruefmittel INTO TABLE gt_pm
    WHERE werk = p_werk
    ORDER BY id.

  go_kalib = NEW #( ).
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'PFLEGE'.
  SET TITLEBAR 'PFLEGE' WITH p_werk.
  tc_pm-lines = lines( gt_pm ).
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Form  ZEILE_HOLEN
*&---------------------------------------------------------------------*
*       Cursorzeile im Table Control -> GS_PM / GV_IDX
*----------------------------------------------------------------------*
FORM zeile_holen.
  DATA lv_line TYPE i.

  GET CURSOR LINE lv_line.
  gv_idx = tc_pm-top_line + lv_line - 1.
  READ TABLE gt_pm INTO gs_pm INDEX gv_idx.
  IF sy-subrc <> 0 OR lv_line = 0.
    MESSAGE e710(zqm).                             "Cursor auf Zeile setzen
  ENDIF.
ENDFORM.
