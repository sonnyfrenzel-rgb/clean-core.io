REPORT zmm_sto_nachschub MESSAGE-ID zmm.
*----------------------------------------------------------------------*
* Filialnachschub per Umlagerungsbestellung (UB) aus dem Zentrallager
* Job ZMM_STO_NACHSCHUB, taeglich 04:30 je Belieferungstag
*  1. Belieferungsplan (ZMM_STO_ROUTE) fuer den Wochentag lesen
*  2. Bedarf je Filiale/Material: Bestand (S032) + offene UB
*     - heutige Kassenabverkaeufe (POS-System per RFC) < Meldebestand
*  3. UB anlegen, Auslieferung erzeugen, optional Warenausgang buchen
*  4. Ergebnis ins Anwendungslog, Liste, Uebergabe an Folgejob (INDX)
*----------------------------------------------------------------------*
* 2012-04 AK  Erstellung (Projekt Filiallogistik)
* 2016-09 AK  POS-Abverkauf per RFC
* 2021-02 MB  Sofort-WA fuer Filialen ohne eigene Warenannahme
*----------------------------------------------------------------------*

INCLUDE zmm_sto_nachschub_top.
INCLUDE zmm_sto_nachschub_f01.
INCLUDE zmm_sto_nachschub_f02.

INITIALIZATION.
  p_date = sy-datum + 1.

START-OF-SELECTION.
  PERFORM log_anlegen.
  PERFORM route_lesen.
  IF gt_route IS INITIAL.
    PERFORM log_meldung USING 'W' 'Kein Belieferungsplan fuer den Tag' gs_route-werks.
    PERFORM log_sichern.
    RETURN.
  ENDIF.

  go_creator = NEW zcl_mm_sto_creator( iv_test = p_test ).

  LOOP AT gt_route INTO gs_route.
    PERFORM bedarf_ermitteln USING gs_route CHANGING gt_need.
    IF gt_need IS INITIAL.
      CONTINUE.
    ENDIF.
    PERFORM nachschub_anlegen USING gs_route gt_need.
  ENDLOOP.

  PERFORM log_sichern.
  PERFORM uebergabe_folgejob.

END-OF-SELECTION.
  PERFORM liste_ausgeben.
