*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTKOSTEN_F03 - Liste
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL_AUSGEBEN
*&---------------------------------------------------------------------*
*       je Spediteur: Transporte mit Gewicht, Fracht, Beleg bzw. Fehler,
*       Summe Fracht je Spediteur
*       Die Liste geht als Spool an die Frachtpruefung (Verteiler
*       LOG-FRACHT). Spalten:
*         Transport / Transportart / Abfertigungsdatum / Gewicht kg /
*         Fracht EUR / Frachtkostenbeleg / Fehlertext
*       Doppelklick auf eine Zeile -> VI03 (siehe AT LINE-SELECTION).
*       ACHTUNG: Summe je Spediteur enthaelt auch Transporte mit
*       Fehler, sofern schon eine Fracht berechnet wurde (Rundung).
*----------------------------------------------------------------------*
FORM protokoll_ausgeben.
  DATA ls_tr TYPE ty_tr.

  LOOP AT gt_tr INTO ls_tr.
    AT NEW tdlnr.
      SKIP.
      WRITE: / 'Spediteur', ls_tr-tdlnr COLOR COL_GROUP.
    ENDAT.

    WRITE: /3 ls_tr-tknum, ls_tr-shtyp, ls_tr-dtabf,
              ls_tr-gewicht_kg, ls_tr-fracht, ls_tr-fknum, ls_tr-fehler.
    gv_fknum = ls_tr-fknum.
    HIDE gv_fknum.

    AT END OF tdlnr.
      SUM.
      WRITE: /3 'Summe Spediteur', 60 ls_tr-fracht COLOR COL_TOTAL.
    ENDAT.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  KOPF
*&---------------------------------------------------------------------*
FORM kopf.
  WRITE: / 'Frachtkostenbelege', s_datum-low, '-', s_datum-high,
           'Testlauf:', p_test, 50 sy-datum, sy-uzeit, 'Seite', sy-pagno.
  ULINE.
ENDFORM.
