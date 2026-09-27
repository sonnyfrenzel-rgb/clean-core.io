REPORT zfi_bankstmt.
*----------------------------------------------------------------------*
* Kontoauszug (CSV Hausbank) einlesen, Debitoren-OPs ausgleichen
* Ersatz fuer manuelle FB05 - 2012 FGR
* 2017 FGR  Toleranz aus TVARVC statt hart codiert
* 2020 KLE  nur noch Gutschriften (Lastschriften bucht Bank per MT940)
*----------------------------------------------------------------------*
TYPE-POOLS slis.

PARAMETERS: p_file  TYPE string LOWER CASE OBLIGATORY,
            p_bukrs TYPE bukrs OBLIGATORY,
            p_hkont TYPE hkont OBLIGATORY,
            p_blart TYPE blart DEFAULT 'DZ',
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_stmt,
         valut  TYPE valut,
         wrbtr  TYPE wrbtr,
         waers  TYPE waers,
         zweck  TYPE char140,
         name   TYPE char35,
         xblnr  TYPE xblnr1,
         kunnr  TYPE kunnr,
         status TYPE char1,     " M zugeordnet, U offen, P gebucht, E Fehler
         belnr  TYPE belnr_d,
         text   TYPE char80,
       END OF ty_stmt,
       BEGIN OF ty_op,
         kunnr TYPE kunnr,
         belnr TYPE belnr_d,
         gjahr TYPE gjahr,
         buzei TYPE buzei,
         shkzg TYPE shkzg,
         wrbtr TYPE wrbtr,
       END OF ty_op.

DATA: gt_stmt TYPE STANDARD TABLE OF ty_stmt,
      gt_op   TYPE STANDARD TABLE OF ty_op,
      gv_tol  TYPE wrbtr VALUE '1.00'.

FIELD-SYMBOLS <gs_stmt> TYPE ty_stmt.

START-OF-SELECTION.
  PERFORM read_file.
  IF gt_stmt IS INITIAL.
    MESSAGE 'Datei enthaelt keine Gutschriften' TYPE 'S'.
    RETURN.
  ENDIF.

* Ausgleichstoleranz (Default 1,00)
  SELECT SINGLE low FROM tvarvc INTO gv_tol
    WHERE name = 'ZFI_BANK_TOLERANZ'
      AND type = 'P'.

  IF p_test IS INITIAL.
    CALL FUNCTION 'POSTING_INTERFACE_START'
      EXPORTING
        i_function         = 'C'
        i_mode             = 'N'
        i_update           = 'S'
        i_user             = sy-uname
      EXCEPTIONS
        client_incorrect   = 1
        function_invalid   = 2
        group_name_missing = 3
        mode_invalid       = 4
        update_invalid     = 5
        user_invalid       = 6
        OTHERS             = 7.
  ENDIF.

  LOOP AT gt_stmt ASSIGNING <gs_stmt>.
    PERFORM match_item.
    IF <gs_stmt>-status = 'M' AND p_test IS INITIAL.
      PERFORM post_clearing.
    ENDIF.
  ENDLOOP.

  IF p_test IS INITIAL.
    CALL FUNCTION 'POSTING_INTERFACE_END'
      EXCEPTIONS
        session_not_processable = 1
        OTHERS                  = 2.
  ENDIF.

  PERFORM display.

  INCLUDE zfi_bankstmt_f01.
