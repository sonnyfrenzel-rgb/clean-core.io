REPORT zfi_payfile MESSAGE-ID zfi.
*----------------------------------------------------------------------*
* Zahlungsdatei fuer Bankensoftware aus F110-Lauf (Ueberweisungen)
* Format: CSV fuer MultiCash-Import (seit 2015, vorher DTAUS)
*----------------------------------------------------------------------*
* 2015-04 RWE  Erstellung
* 2018-11 RWE  IBAN/BIC Pflicht (SEPA), DTAUS-Teil entfernt
* 2021-02 EXT  Doppelerzeugungspruefung deaktiviert (CR-812)
*----------------------------------------------------------------------*
PARAMETERS: p_laufd TYPE laufd OBLIGATORY,
            p_laufi TYPE laufi OBLIGATORY,
            p_zbukr TYPE dzbukr OBLIGATORY,
            p_rzawe TYPE rzawe DEFAULT 'U',
            p_file  TYPE string LOWER CASE
                    DEFAULT '/usr/sap/interface/zahl/ueberweisung.csv',
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_err,
         vblnr TYPE vblnr,
         empfg TYPE empfg,
         text  TYPE char60,
       END OF ty_err.

DATA: gs_reguv TYPE reguv,
      gt_reguh TYPE STANDARD TABLE OF reguh,
      gt_lines TYPE STANDARD TABLE OF string,
      gt_err   TYPE STANDARD TABLE OF ty_err,
      gs_err   TYPE ty_err,
      gv_count TYPE i,
      gv_sum   TYPE rwbtr.

START-OF-SELECTION.
  PERFORM check_run.

* nur Zahlungen des Echtlaufs, eine Zahlungsmethode
  SELECT * FROM reguh INTO TABLE gt_reguh
    WHERE laufd = p_laufd
      AND laufi = p_laufi
      AND xvorl = space
      AND zbukr = p_zbukr
      AND rzawe = p_rzawe.
  IF gt_reguh IS INITIAL.
    MESSAGE s001 WITH p_laufd p_laufi.
    RETURN.
  ENDIF.

  PERFORM build_records.

  IF p_test IS INITIAL.
    PERFORM write_file.
    PERFORM log_run.
  ENDIF.

* Protokoll
  WRITE: / 'Zahlungen in Datei:', gv_count, 'Summe:', gv_sum, 'Testlauf:', p_test.
  LOOP AT gt_err INTO gs_err.
    WRITE: / gs_err-vblnr, gs_err-empfg, gs_err-text COLOR COL_NEGATIVE.
  ENDLOOP.

  INCLUDE zfi_payfile_f01.
