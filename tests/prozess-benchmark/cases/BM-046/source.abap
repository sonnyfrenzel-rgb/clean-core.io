REPORT zfi_mahnsperre.
*----------------------------------------------------------------------*
* Mahnsperre fuer Posten mit offenem Klaerungsfall
* 2012-10 THO  Erstversion
* 2016-02 THO  Testlauf ergaenzt, Zaehler
*----------------------------------------------------------------------*
TABLES: bsid.

SELECT-OPTIONS: s_bukrs FOR bsid-bukrs OBLIGATORY,
                s_kunnr FOR bsid-kunnr.
PARAMETERS: p_mansp TYPE mansp DEFAULT 'R',
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_op,
         bukrs TYPE bukrs,
         kunnr TYPE kunnr,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         buzei TYPE buzei,
         mansp TYPE mansp,
       END OF ty_op.

DATA: lt_op      TYPE STANDARD TABLE OF ty_op,
      ls_op      TYPE ty_op,
      lt_klaer   TYPE STANDARD TABLE OF zfi_klaerfall,
      lt_buztab  TYPE tpit_t_buztab,
      ls_buztab  TYPE tpit_buztab,
      lt_fldtab  TYPE tpit_t_fname,
      ls_fldtab  TYPE tpit_fname,
      lt_errtab  TYPE tpit_t_errdoc,
      ls_bseg    TYPE bseg,
      lv_cnt_ok  TYPE i,
      lv_cnt_err TYPE i.

START-OF-SELECTION.
* nur Posten, die noch keine Mahnsperre haben
  SELECT bukrs kunnr belnr gjahr buzei mansp
    FROM bsid INTO TABLE lt_op
    WHERE bukrs IN s_bukrs
      AND kunnr IN s_kunnr
      AND mansp = space.
  IF lt_op IS INITIAL.
    MESSAGE 'Keine ungesperrten offenen Posten gefunden' TYPE 'S'.
    RETURN.
  ENDIF.

  SELECT * FROM zfi_klaerfall INTO TABLE lt_klaer
    FOR ALL ENTRIES IN lt_op
    WHERE bukrs  = lt_op-bukrs
      AND belnr  = lt_op-belnr
      AND gjahr  = lt_op-gjahr
      AND status = 'O'.
  SORT lt_klaer BY bukrs belnr gjahr.

  ls_fldtab-fname = 'MANSP'.
  APPEND ls_fldtab TO lt_fldtab.

  LOOP AT lt_op INTO ls_op.
    READ TABLE lt_klaer TRANSPORTING NO FIELDS
      WITH KEY bukrs = ls_op-bukrs
               belnr = ls_op-belnr
               gjahr = ls_op-gjahr
      BINARY SEARCH.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.

    IF p_test = 'X'.
      WRITE: / ls_op-belnr, ls_op-buzei, 'wuerde gesperrt (Testlauf)'.
      CONTINUE.
    ENDIF.

    CLEAR: ls_bseg, lt_buztab, lt_errtab.
    ls_buztab-bukrs = ls_op-bukrs.
    ls_buztab-belnr = ls_op-belnr.
    ls_buztab-gjahr = ls_op-gjahr.
    ls_buztab-buzei = ls_op-buzei.
    APPEND ls_buztab TO lt_buztab.
    ls_bseg-mansp = p_mansp.

    CALL FUNCTION 'FI_ITEMS_MASS_CHANGE'
      EXPORTING
        s_bseg     = ls_bseg
      IMPORTING
        errtab     = lt_errtab
      TABLES
        it_buztab  = lt_buztab
        it_fldtab  = lt_fldtab
      EXCEPTIONS
        bdc_errors = 1
        OTHERS     = 2.
    IF sy-subrc = 0.
      ADD 1 TO lv_cnt_ok.
      UPDATE zfi_klaerfall SET status = 'S'
        WHERE bukrs = ls_op-bukrs
          AND belnr = ls_op-belnr
          AND gjahr = ls_op-gjahr.
      WRITE: / ls_op-belnr, ls_op-buzei, 'Mahnsperre gesetzt'.
    ELSE.
      ADD 1 TO lv_cnt_err.
      WRITE: / ls_op-belnr, ls_op-buzei, 'Fehler beim Setzen der Sperre'.
    ENDIF.
  ENDLOOP.

  IF p_test IS INITIAL.
    COMMIT WORK.
  ENDIF.
  ULINE.
  WRITE: / 'Gesperrt:', lv_cnt_ok, 'Fehler:', lv_cnt_err.
