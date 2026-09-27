REPORT zfi_bankstmt_in MESSAGE-ID zfi.
*----------------------------------------------------------------------*
* Kontoauszugsumsaetze Hausbank (CSV) -> Sachkontenbuchung
*   - alle Dateien im Eingangsverzeichnis, je Datei gesperrt
*   - Wiederaufsetzen ab erster nicht gebuchter Zeile (ZFI_STMT_CHKPT)
*   - Wiederholung bei Sperrfehlern (Meldungen aus ZFI_RETRY_MSG)
*   - fertige Dateien ins Archiv, unlesbare ins Fehlerverzeichnis
*----------------------------------------------------------------------*
* 2015-01 HM  Anlage
* 2016-06 HM  Wiederaufsetzpunkt
* 2019-10 KL  Retry bei Sperren (Monatsabschluss parallel F.13)
*----------------------------------------------------------------------*
INCLUDE zfi_bankstmt_in_top.
INCLUDE zfi_bankstmt_in_sel.
INCLUDE zfi_bankstmt_in_f01.
INCLUDE zfi_bankstmt_in_f02.

AT SELECTION-SCREEN ON p_dir.
  IF p_dir IS INITIAL OR p_dir NP '/interface/fi/*'.
    MESSAGE e100.                       "nur Schnittstellenverzeichnis erlaubt
  ENDIF.

START-OF-SELECTION.
  PERFORM get_files.
  IF gt_files IS INITIAL.
    MESSAGE s101.
    RETURN.
  ENDIF.

  LOOP AT gt_files INTO gs_file.
    PERFORM lock_file USING gs_file-name CHANGING gv_locked.
    IF gv_locked = abap_false.
      WRITE: / gs_file-name, 'wird bereits verarbeitet'(010).
      CONTINUE.
    ENDIF.

    PERFORM read_checkpoint USING gs_file-name CHANGING gv_start.
    PERFORM read_file USING gs_file-name CHANGING gv_ok.
    IF gv_ok = abap_false.
      PERFORM move_file USING gs_file-name p_errdir.
    ELSE.
      PERFORM post_lines USING gs_file-name gv_start CHANGING gv_errors.
      IF gv_errors = 0.
        PERFORM move_file USING gs_file-name p_arcdir.
        DELETE FROM zfi_stmt_chkpt WHERE filename = gs_file-name.
        COMMIT WORK.
        WRITE: / gs_file-name, 'vollstaendig gebucht'(011).
        gv_files_ok = gv_files_ok + 1.
      ELSE.
        WRITE: / gs_file-name, 'Abbruch - Wiederaufsetzen ab Zeile'(012), gv_restart_line.
      ENDIF.
    ENDIF.

    PERFORM unlock_file USING gs_file-name.
  ENDLOOP.

  gv_nfiles = lines( gt_files ).
  ULINE.
  WRITE: / 'Dateien gesamt:'(020), gv_nfiles,
         / 'davon vollstaendig gebucht:'(021), gv_files_ok.
