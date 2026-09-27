REPORT zle_frachtkosten MESSAGE-ID zle LINE-SIZE 132 NO STANDARD PAGE HEADING.
*----------------------------------------------------------------------*
* Frachtkostenbelege fuer abgefertigte Transporte (naechtlicher Job)
*----------------------------------------------------------------------*
* - Transporte mit Status Abfertigung im Zeitraum, noch ohne
*   Frachtkostenbeleg
* - Frachtgewicht = Summe Bruttogewicht der Handling Units der
*   Lieferungen im Transport
* - Fracht aus eigenem Tarif (Spediteur/Zone/Gewichtsstaffel),
*   Mindestfracht, Dieselzuschlag (TVARVC)
* - Frachtkostenbeleg per Batch-Input VI01; Betrag geht per Memory an
*   den Kalkulationsexit der Frachtkostenberechnung
*----------------------------------------------------------------------*
* 2008 Ersterstellung / 2012 Dieselzuschlag / 2016 HU-Gewicht statt
* Liefergewicht / 2021 Mindestfracht
*----------------------------------------------------------------------*
* Einplanung: Job ZLE_FRACHT_NACHT, taeglich 02:00, Variante NACHT
*   (Zeitraum dynamisch: letzte 7 Tage bis gestern, Modus N)
* Fehlerfaelle werden am Folgetag von der Frachtpruefung manuell in
* VI01 angelegt (Liste im Spool, Verteiler LOG-FRACHT).
*----------------------------------------------------------------------*

INCLUDE zle_frachtkosten_top.
INCLUDE zle_frachtkosten_f01.
INCLUDE zle_frachtkosten_f02.
INCLUDE zle_frachtkosten_f03.

INITIALIZATION.
  s_datum-sign   = 'I'.
  s_datum-option = 'BT'.
  s_datum-low    = sy-datum - 7.
  s_datum-high   = sy-datum - 1.
  APPEND s_datum.

AT SELECTION-SCREEN ON s_tdlnr.
  LOOP AT s_tdlnr INTO DATA(ls_tdlnr) WHERE option = 'EQ'.
    SELECT SINGLE lifnr FROM lfa1 INTO @DATA(lv_lifnr)
      WHERE lifnr = @ls_tdlnr-low.
    IF sy-subrc <> 0.
      MESSAGE e001 WITH ls_tdlnr-low.        "Spediteur & unbekannt
    ENDIF.
  ENDLOOP.

START-OF-SELECTION.
  PERFORM transporte_lesen.
  IF gt_tr IS INITIAL.
    MESSAGE s002.                            "nichts abzurechnen
    STOP.
  ENDIF.

  PERFORM gewichte_ermitteln.

  LOOP AT gt_tr ASSIGNING FIELD-SYMBOL(<gs_tr>).
    PERFORM fracht_berechnen CHANGING <gs_tr>.
    CHECK <gs_tr>-fehler IS INITIAL.
    IF p_test = abap_false.
      PERFORM kostenbeleg_anlegen CHANGING <gs_tr>.
    ENDIF.
  ENDLOOP.

END-OF-SELECTION.
  PERFORM protokoll_ausgeben.

TOP-OF-PAGE.
  PERFORM kopf.

AT LINE-SELECTION.
* Absprung in den Frachtkostenbeleg (Zeile mit HIDE-Feld GV_FKNUM)
  CHECK gv_fknum IS NOT INITIAL.
  SET PARAMETER ID 'FKK' FIELD gv_fknum.
  CALL TRANSACTION 'VI03' AND SKIP FIRST SCREEN.
  CLEAR gv_fknum.
