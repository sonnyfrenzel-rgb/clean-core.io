REPORT zca_if_monitor.
*----------------------------------------------------------------------*
* Zentraler Schnittstellenmonitor (SD/MM/FI) auf ZCA_IF_LOG
*   - Nachverarbeitung je Schnittstelle ueber Klasse aus ZCA_IF_CUST
*   - Anzeige Anwendungsprotokoll zum Eintrag
* Berechtigung Z_IF_MON (ACTVT 03 Anzeige, 16 Nachverarbeitung) je Modul
*----------------------------------------------------------------------*
* 2019-11 TK  Anlage (Zusammenlegung von 7 Einzelmonitoren)
* 2021-03 TK  Nachverarbeitung ueber Interface ZIF_CA_REPROCESSOR
*----------------------------------------------------------------------*
TABLES zca_if_log.

SELECT-OPTIONS: s_ifc  FOR zca_if_log-ifcode,
                s_mod  FOR zca_if_log-module,
                s_date FOR zca_if_log-created_on DEFAULT sy-datum.
PARAMETERS:     p_err  AS CHECKBOX DEFAULT 'X'.

INCLUDE zca_if_monitor_cls.

INITIALIZATION.
  s_date-low    = sy-datum - 7.
  s_date-high   = sy-datum.
  s_date-option = 'BT'.
  s_date-sign   = 'I'.
  APPEND s_date.

START-OF-SELECTION.
  DATA(go_monitor) = NEW lcl_monitor( ).
  go_monitor->run( ).
