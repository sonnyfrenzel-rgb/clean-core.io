REPORT zehs_sdb_inbound.
*----------------------------------------------------------------------*
* Eingang Lieferanten-Sicherheitsdatenblätter (XML) -> Gefahrstoffkataster
*
* Liest alle XML-Dateien eines Eingangsverzeichnisses, ordnet das SDB
* über die CAS-Nummer dem Stoff zu und aktualisiert Lagerklasse (LGK),
* Wassergefährdungsklasse (WGK), SDB-Datum und Lieferant im
* Gefahrstoffkataster des Werks (Verbuchung ZEHS_KATASTER_UPDATE).
* Danach Zusammenlagerungsprüfung nach TRGS 510 je Lagerort.
*----------------------------------------------------------------------*
* 2018-10 NKL  Erstellung (Gefahrstoffkataster Werk 1100)
* 2019-04 NKL  Zusammenlagerungsprüfung, Aufgabe an Gefahrstoffbeauftragten
* 2022-06 EXT  XML-Format SDScom, Transformation ZEHS_SDB_TO_ABAP
*----------------------------------------------------------------------*
INCLUDE zehs_sdb_inbound_top.
INCLUDE zehs_sdb_inbound_f01.

*----------------------------------------------------------------------*
AT SELECTION-SCREEN ON p_werks.
  SELECT SINGLE werks FROM t001w INTO @DATA(lv_werks)
    WHERE werks = @p_werks.
  IF sy-subrc <> 0.
    MESSAGE e800(zehs) WITH p_werks.
  ENDIF.

*----------------------------------------------------------------------*
START-OF-SELECTION.
  gv_dir = p_dir.
  CALL FUNCTION 'EPS2_GET_DIRECTORY_LISTING'
    EXPORTING
      iv_dir_name            = gv_dir
    TABLES
      dir_list               = gt_files
    EXCEPTIONS
      invalid_eps_subdir     = 1
      sapgparam_failed       = 2
      build_directory_failed = 3
      no_authorization       = 4
      read_directory_failed  = 5
      too_many_read_errors   = 6
      empty_directory_list   = 7
      OTHERS                 = 8.
  IF sy-subrc <> 0 OR gt_files IS INITIAL.
    MESSAGE s801(zehs) WITH p_dir.
    RETURN.
  ENDIF.

  LOOP AT gt_files INTO gs_file.
    CHECK gs_file-name CP '*.xml' OR gs_file-name CP '*.XML'.
    PERFORM datei_verarbeiten USING gs_file-name CHANGING gv_ok gv_xml.
    IF gv_ok = abap_true AND p_test IS INITIAL.
      PERFORM datei_archivieren USING gs_file-name gv_xml.
    ENDIF.
  ENDLOOP.

  PERFORM lagerpruefung.

  IF p_test IS INITIAL.
    COMMIT WORK.
  ENDIF.

*----------------------------------------------------------------------*
END-OF-SELECTION.
  PERFORM protokoll_anzeigen.
