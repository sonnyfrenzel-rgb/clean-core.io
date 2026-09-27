*&---------------------------------------------------------------------*
*& Report  ZCO_PLANUPLOAD
*&
*& Upload Kostenplanung (Primaerkosten) aus Datei auf dem Applikations-
*& server. Datei kommt aus dem Planungstool (Excel-Export, CSV ';').
*&
*& Aufbau je Zeile:  Kostenstelle;Kostenart;Periode;Betrag;Waehrung
*&
*& Pruefungen ueber ZCL_CO_PLAN_PRUEFER, fehlerhafte Zeilen gehen in
*& eine Fehlerdatei. Mit "Alles oder nichts" wird bei einem Fehler
*& gar nicht gebucht.
*&---------------------------------------------------------------------*
*& 2012-09  CSC  Erstellung (Upload vom Frontend)
*& 2015-03  CSC  Applikationsserver, Job-faehig
*& 2018-10  NFR  Pruefklasse ausgelagert, Fehlerdatei
*& 2020-06  NFR  Testlauf ueber Check-BAPI
*&---------------------------------------------------------------------*
REPORT zco_planupload MESSAGE-ID zco_pu.

INCLUDE zco_planupload_top.
INCLUDE zco_planupload_sel.
INCLUDE zco_planupload_f01.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN.
*----------------------------------------------------------------------*
* Version 0 ist der operative Plan - Echtlauf nur mit Hinweis
  IF p_versn = '000' AND p_test IS INITIAL.
    MESSAGE w001.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM datei_lesen.
  IF gt_zeilen IS INITIAL.
    MESSAGE s002 WITH p_file.
    RETURN.
  ENDIF.

  TRY.
      CREATE OBJECT go_pruefer
        EXPORTING
          iv_kokrs = p_kokrs
          iv_gjahr = p_gjahr
          iv_versn = p_versn.
    CATCH zcx_co_plan INTO gx_plan.
      MESSAGE gx_plan TYPE 'E'.
  ENDTRY.

  PERFORM zeilen_pruefen.

  IF gt_fehler IS NOT INITIAL.
    PERFORM fehlerdatei_schreiben.
    IF p_alles = 'X'.
      MESSAGE s003 WITH lines( gt_fehler ) DISPLAY LIKE 'E'.
      RETURN.
    ENDIF.
  ENDIF.

  PERFORM buchen.
