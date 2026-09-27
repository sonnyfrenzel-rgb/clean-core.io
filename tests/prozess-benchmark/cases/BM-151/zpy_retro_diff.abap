REPORT zpy_retro_diff MESSAGE-ID zpy.
************************************************************************
* Rueckrechnungsdifferenzen je Lohnart
* Vergleicht fuer jede in der gewaehlten In-Periode rueckgerechnete
* Fuer-Periode das neue Ergebnis (A) mit dem Vorgaengerergebnis (P)
* und listet Lohnartendifferenzen ueber einer Mindestgrenze.
* Logische Datenbank PNPCE, Deutschland (Cluster RD)
* 2010-02 HR-IT  Anlage fuer Tarifnachzahlung
* 2018-07 HR-IT  ALV statt WRITE, Summen je Mitarbeiter
************************************************************************
INCLUDE zpy_retro_diff_top.
INCLUDE zpy_retro_diff_f01.

INITIALIZATION.
  PERFORM init_lgart_defaults.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'P_PCLX'
    ID 'RELID' FIELD 'RD'
    ID 'AUTHC' FIELD 'R'.
  IF sy-subrc <> 0.
    MESSAGE e010.
  ENDIF.
  CONCATENATE p_inpyr p_inpp INTO gv_inper.

GET peras.
  PERFORM read_rgdir USING peras-pernr CHANGING gv_ok.
  CHECK gv_ok = abap_true.
  PERFORM compare_results USING peras-pernr.

END-OF-SELECTION.
  IF gt_diff IS INITIAL.
    MESSAGE s011 WITH gv_inper.
    RETURN.
  ENDIF.
  PERFORM summarize.
  PERFORM display_alv.
