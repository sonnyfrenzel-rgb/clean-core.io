REPORT zpm_mplan_perf.
*----------------------------------------------------------------------*
* Leistungsabhängige Wartung - Massenlauf
*
* Für leistungsabhängige Wartungspläne (Zyklus mit Messpunkt) wird aus
* der Zählerentwicklung des letzten Jahres das Fälligkeitsdatum
* hochgerechnet. Fällige Pläne ohne offenen Auftrag erhalten einen
* Instandhaltungsauftrag. Verarbeitung in Paketen je Planungswerk,
* parallel per aRFC über eine Servergruppe oder sequentiell.
*----------------------------------------------------------------------*
* 2017-09 MBR  Erstellung (Ersatz IP30 für die Fahrzeugflotte,
*              Hochrechnung der Tagesleistung kundeneigen)
* 2018-04 MBR  Parallelisierung je Planungswerk
* 2020-02 EXT  Anwendungslog ZPM/MPLAN_PERF, SALV-Ausgabe
*----------------------------------------------------------------------*
INCLUDE zpm_mplan_perf_top.
INCLUDE zpm_mplan_perf_f01.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN ON p_group.
  CALL FUNCTION 'SPBT_INITIALIZE'
    EXPORTING
      group_name                     = p_group
    IMPORTING
      max_pbt_wps                    = gv_max
      free_pbt_wps                   = gv_free
    EXCEPTIONS
      invalid_group_name             = 1
      internal_error                 = 2
      pbt_env_already_initialized    = 3
      currently_no_resources_avail   = 4
      no_pbt_resources_found         = 5
      cant_init_different_pbt_groups = 6
      OTHERS                         = 7.
  IF sy-subrc <> 0 AND sy-subrc <> 3.
    MESSAGE e310(zpm) WITH p_group.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  gs_log-object     = 'ZPM'.
  gs_log-subobject  = 'MPLAN_PERF'.
  gs_log-aldate_del = sy-datum + 90.
  CALL FUNCTION 'BAL_LOG_CREATE'
    EXPORTING
      i_s_log      = gs_log
    IMPORTING
      e_log_handle = gv_log
    EXCEPTIONS
      OTHERS       = 1.

  PERFORM select_plans.
  IF gt_plan IS INITIAL.
    MESSAGE s311(zpm).
    STOP.
  ENDIF.

  PERFORM dispatch.

* auf die noch laufenden Pakete warten (höchstens eine Stunde)
  WAIT UNTIL gv_done >= gv_sent UP TO 3600 SECONDS.

*----------------------------------------------------------------------*
END-OF-SELECTION.
  CALL FUNCTION 'BAL_DB_SAVE'
    EXPORTING
      i_save_all = 'X'
    EXCEPTIONS
      OTHERS     = 1.
  PERFORM display.
