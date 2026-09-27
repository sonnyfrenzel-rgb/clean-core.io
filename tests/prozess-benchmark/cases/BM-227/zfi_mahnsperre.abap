*&---------------------------------------------------------------------*
*& Report  ZFI_MAHNSPERRE
*&
*& Mahnsperre auf faellige Posten mit offenem Streitfall setzen.
*& Laeuft als Job vor dem Mahnlauf F150 (Variante MAHN_VORLAUF).
*&---------------------------------------------------------------------*
*& 2008-05  AKL  Erstellung
*& 2012-10  TSC  Testlauf, Protokoll am Ende
*& 2016-02  TSC  Berechtigungspruefung (Revision)
*&---------------------------------------------------------------------*
REPORT zfi_mahnsperre MESSAGE-ID zfi_mahn.

INCLUDE zfi_mahnsperre_top.
INCLUDE zfi_mahnsperre_f01.

INITIALIZATION.
  p_stich = sy-datum.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
    ID 'BUKRS' FIELD p_bukrs
    ID 'ACTVT' FIELD '02'.
  IF sy-subrc <> 0.
    MESSAGE e001 WITH p_bukrs.
  ENDIF.

  PERFORM debitoren_lesen.
  IF gt_knb5 IS INITIAL.
    MESSAGE s010 DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  LOOP AT gt_knb5 INTO gs_knb5.
    PERFORM posten_pruefen USING gs_knb5.
  ENDLOOP.

  IF p_test IS INITIAL AND gv_geaendert > 0.
    COMMIT WORK.
  ENDIF.

END-OF-SELECTION.
  PERFORM protokoll_ausgeben.
