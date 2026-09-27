REPORT zewm_errq_mon.
*----------------------------------------------------------------------*
* Nachverarbeitungsmonitor EWM-Schnittstellenfehler (ZEWM_ERRQ)
* Funktionen: Nachverarbeiten (REPROC), Verwerfen (DISCARD), Doppelklick = Fehlertext
*----------------------------------------------------------------------*
TABLES zewm_errq.

SELECT-OPTIONS: s_lgnum FOR zewm_errq-lgnum OBLIGATORY,
                s_ifc   FOR zewm_errq-ifcode,
                s_date  FOR zewm_errq-erdat DEFAULT sy-datum.
PARAMETERS:     p_all   AS CHECKBOX.          "auch verarbeitete anzeigen

INCLUDE zewm_errq_mon_cls.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'Z_EWM_MON'
    ID 'ACTVT' FIELD '03'
    ID 'LGNUM' FIELD s_lgnum-low.
  IF sy-subrc <> 0.
    MESSAGE e060(zewm) WITH s_lgnum-low.
  ENDIF.

  DATA(go_monitor) = NEW lcl_monitor( ).
  go_monitor->run( ).
