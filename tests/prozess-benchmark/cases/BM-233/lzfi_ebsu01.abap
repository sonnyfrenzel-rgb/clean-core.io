FUNCTION z_fi_ebs_nachbearbeiten.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_KUKEY) TYPE  KUKEY_EB
*"     VALUE(IV_TESTLAUF) TYPE  XFELD DEFAULT 'X'
*"  EXPORTING
*"     VALUE(EV_AUSGEGLICHEN) TYPE  I
*"  TABLES
*"      ET_LOG STRUCTURE  BAPIRET2
*"  EXCEPTIONS
*"      AUSZUG_NICHT_GEFUNDEN
*"      KEINE_BERECHTIGUNG
*"----------------------------------------------------------------------
  DATA: lt_op    TYPE gty_op_tab,
        ls_op    TYPE gty_op,
        lv_anz   TYPE i,
        lv_belnr TYPE belnr_d.

  CLEAR: gt_log, ev_ausgeglichen.

  SELECT SINGLE * FROM febko INTO gs_febko
    WHERE kukey = iv_kukey.
  IF sy-subrc <> 0.
    RAISE auszug_nicht_gefunden.
  ENDIF.

  AUTHORITY-CHECK OBJECT 'F_FEBB_BUK'
    ID 'BUKRS' FIELD gs_febko-bukrs
    ID 'ACTVT' FIELD '02'.
  IF sy-subrc <> 0.
    MESSAGE e100 WITH gs_febko-bukrs RAISING keine_berechtigung.
  ENDIF.

* Habenposten (Zahlungseingang), Nebenbuch noch nicht gebucht
  SELECT * FROM febep INTO TABLE gt_febep
    WHERE kukey = iv_kukey
      AND epvoz = 'H'
      AND vb2ok = space.
  IF sy-subrc <> 0.
    PERFORM log USING 'I' '101' space.
    et_log[] = gt_log[].
    RETURN.
  ENDIF.

  IF iv_testlauf IS INITIAL.
    CALL FUNCTION 'POSTING_INTERFACE_START'
      EXPORTING
        i_function = 'C'
        i_mode     = 'N'
        i_update   = 'S'
        i_user     = sy-uname.
  ENDIF.

  LOOP AT gt_febep INTO gs_febep.
    PERFORM offene_posten_suchen USING gs_febep CHANGING lt_op.
    DESCRIBE TABLE lt_op LINES lv_anz.

    CASE lv_anz.
      WHEN 0.
        PERFORM log USING 'W' '102' gs_febep-esnum.
      WHEN 1.
        READ TABLE lt_op INTO ls_op INDEX 1.
*       nur betragsgleich ausgleichen, Differenzen macht die Buchhaltung
        IF ls_op-wrbtr <> gs_febep-kwbtr.
          PERFORM log USING 'W' '103' gs_febep-esnum.
          CONTINUE.
        ENDIF.
        IF iv_testlauf = 'X'.
          PERFORM log USING 'I' '104' gs_febep-esnum.
          CONTINUE.
        ENDIF.
        PERFORM ausgleichen USING gs_febep ls_op CHANGING lv_belnr.
        IF lv_belnr IS NOT INITIAL.
          UPDATE febep SET vb2ok = 'X'
                           nbbln = lv_belnr
            WHERE kukey = gs_febep-kukey
              AND esnum = gs_febep-esnum.
          ADD 1 TO ev_ausgeglichen.
        ENDIF.
      WHEN OTHERS.
        PERFORM log USING 'W' '105' gs_febep-esnum.
    ENDCASE.
  ENDLOOP.

  IF iv_testlauf IS INITIAL.
    CALL FUNCTION 'POSTING_INTERFACE_END'.
  ENDIF.

  et_log[] = gt_log[].
ENDFUNCTION.
