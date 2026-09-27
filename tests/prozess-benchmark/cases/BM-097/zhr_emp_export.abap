*&---------------------------------------------------------------------*
*& Report ZHR_EMP_EXPORT
*&---------------------------------------------------------------------*
*& Export Personalstammdaten an externe Dienstleister
*& - CSV-Datei auf dem Applikationsserver für den Payroll-Provider
*&   (Abholung per SFTP-Job außerhalb SAP)
*& - RFC an das Zeiterfassungssystem (Terminalserver)
*& Delta seit dem letzten erfolgreichen Lauf oder Vollabzug.
*&---------------------------------------------------------------------*
*& 2013-01  CW  Erstellung
*& 2013-06  CW  RFC an Zeiterfassung
*& 2015-03  JB  Austritte als Satzart D
*& 2019-08  JB  E-Mail-Adresse aus IT0105 Subtyp 0010
*&---------------------------------------------------------------------*
REPORT zhr_emp_export.

INCLUDE zhr_emp_export_top.
INCLUDE zhr_emp_export_f01.
INCLUDE zhr_emp_export_f02.
INCLUDE zhr_emp_export_f03.

INITIALIZATION.
  CONCATENATE '/interface/out/payroll/emp_' sy-datum '.csv' INTO p_file.

START-OF-SELECTION.
* nur ein Lauf gleichzeitig
  CALL FUNCTION 'ENQUEUE_EZHR_EXPORT'
    EXPORTING
      progname       = sy-repid
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    MESSAGE e050(zhr_if).
  ENDIF.

  IF p_full IS INITIAL.
    PERFORM get_last_run CHANGING gv_last_run.
  ENDIF.

  PERFORM select_employees.
  IF gt_pernr IS INITIAL.
    MESSAGE s051(zhr_if).
    RETURN.
  ENDIF.

  LOOP AT gt_pernr INTO gv_pernr.
    PERFORM read_employee USING gv_pernr.
  ENDLOOP.

  IF p_test = 'X'.
    PERFORM display_preview.
    RETURN.
  ENDIF.

  PERFORM write_file.
  PERFORM send_time_system.
  PERFORM write_log.
  IF gt_error IS NOT INITIAL.
    PERFORM send_error_mail.
  ENDIF.
  COMMIT WORK.

  CALL FUNCTION 'DEQUEUE_EZHR_EXPORT'
    EXPORTING
      progname = sy-repid.
