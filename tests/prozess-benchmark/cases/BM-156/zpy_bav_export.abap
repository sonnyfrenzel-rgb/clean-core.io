REPORT zpy_bav_export MESSAGE-ID zpy_bav.
************************************************************************
* Betriebliche Altersversorgung (bAV): Monatsmeldung an Versorgungs-
* traeger. Beitraege je Vertrag aus dem Abrechnungsergebnis (RT),
* Rueckrechnungen als Differenzsaetze, Jahreswerte aus CRT.
* Datei je Lauf, Formatierung je Versorgungstraeger dynamisch in
* ZPY_BAV_FORMAT_<Traeger> (FORM FORMAT_RECORD).
* 2009-01 HR-IT  Anlage (Traeger A)
* 2013-06 HR-IT  Rueckrechnung als Differenzsatz
* 2017-02 HR-IT  Doppellaufsperre ueber INDX
* 2021-10 HR-IT  Traeger C, Formatierung dynamisch
************************************************************************
INCLUDE zpy_bav_export_top.
INCLUDE zpy_bav_export_f01.
INCLUDE zpy_bav_export_f02.

INITIALIZATION.
  CONCATENATE '/interface/hr/bav/out/bav_' sy-datum(6) '.csv' INTO p_file.

AT SELECTION-SCREEN ON p_file.
  IF p_file NS '/interface/hr/bav/'.
*   nur das freigegebene Schnittstellenverzeichnis
    MESSAGE e001.
  ENDIF.

START-OF-SELECTION.
  CONCATENATE p_pabrj p_pabrp INTO gv_inper.
  PERFORM log_create.
  PERFORM check_control_record.
  PERFORM check_double_run.
  PERFORM load_customizing.
  PERFORM open_file.

GET peras.
  gv_count_ee = gv_count_ee + 1.
  PERFORM process_employee USING peras-pernr.

END-OF-SELECTION.
  PERFORM write_trailer.
  PERFORM close_and_register.
  PERFORM log_display.
