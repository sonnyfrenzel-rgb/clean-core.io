REPORT zpt_ot_approval.
************************************************************************
* Zeitwirtschaft: Monatliche Ueberstundenfreigabe
* Liest die Zeitauswertungsergebnisse (Cluster B2, Tabelle ZES) des
* Vormonats, zeigt Ueberstunden oberhalb der Kappungsgrenze je
* Mitarbeiterkreis und laesst den Zeitbeauftragten freigeben:
*   Freigabe  -> Zeitumbuchungsvorgabe IT2012 (Auszahlung ZUEB)
*   Ablehnung -> Vermerk in ZPT_OT_DECISION, Stunden verfallen
*   Nachlauf  -> Zeitauswertung RPTIME00 fuer die Auswahl im Hintergrund
* 2012-04 HR-IT  Anlage
* 2016-09 HR-IT  Workflow-Ereignis an Mitarbeiter bei Freigabe
* 2023-02 HR-IT  Absprung in die Personalstammdaten per Doppelklick
************************************************************************
INCLUDE zpt_ot_approval_top.
INCLUDE zpt_ot_approval_f01.
INCLUDE zpt_ot_approval_f02.

INITIALIZATION.
* Vorschlag: Vormonat
  gv_date = sy-datum.
  gv_date+6(2) = '01'.
  gv_date = gv_date - 1.
  p_pabrj = gv_date(4).
  p_pabrp = gv_date+4(2).

AT SELECTION-SCREEN.
  IF s_pernr[] IS INITIAL AND s_orgeh[] IS INITIAL.
    MESSAGE e398(00) WITH 'Personalnummer oder Org.-Einheit angeben'.
  ENDIF.

START-OF-SELECTION.
  PERFORM select_employees.
  PERFORM read_time_results.

END-OF-SELECTION.
  IF gt_out IS INITIAL.
    MESSAGE s398(00) WITH 'Keine Ueberstunden ueber der Grenze'.
    LEAVE LIST-PROCESSING.
  ENDIF.
  PERFORM display_alv.
