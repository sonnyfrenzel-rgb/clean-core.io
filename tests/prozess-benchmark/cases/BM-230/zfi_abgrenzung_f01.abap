*&---------------------------------------------------------------------*
*&  Include           ZFI_ABGRENZUNG_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  ABGRENZUNGEN_LESEN
*&---------------------------------------------------------------------*
FORM abgrenzungen_lesen.
  SELECT * FROM zfi_abgrenz INTO TABLE gt_abg
    WHERE bukrs  = p_bukrs
      AND budat <= p_budat
      AND status = space.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  BDC_AUFBAUEN
*&---------------------------------------------------------------------*
FORM bdc_aufbauen USING ps_abg TYPE zfi_abgrenz.
  DATA: lv_datum(10) TYPE c,
        lv_betrag(16) TYPE c.

  CLEAR gt_bdc.
  WRITE p_budat TO lv_datum.
  WRITE ps_abg-betrag TO lv_betrag CURRENCY ps_abg-waers.
  CONDENSE lv_betrag NO-GAPS.

* Kopfbild
  bdc_d 'SAPMF05A' '0100'.
  bdc_f 'BKPF-BLDAT' lv_datum.
  bdc_f 'BKPF-BUDAT' lv_datum.
  bdc_f 'BKPF-BLART' 'SA'.
  bdc_f 'BKPF-BUKRS' ps_abg-bukrs.
  bdc_f 'BKPF-WAERS' ps_abg-waers.
  bdc_f 'BKPF-BKTXT' ps_abg-text.
  WRITE p_stodt TO lv_datum.
  bdc_f 'BKPF-STODT' lv_datum.
  bdc_f 'BKPF-STGRD' p_stgrd.
  bdc_f 'RF05A-NEWBS' '40'.
  bdc_f 'RF05A-NEWKO' ps_abg-hkont_aufw.
  bdc_f 'BDC_OKCODE' '/00'.
* Position 1 Aufwand
  bdc_d 'SAPMF05A' '0300'.
  bdc_f 'BSEG-WRBTR' lv_betrag.
  bdc_f 'RF05A-NEWBS' '50'.
  bdc_f 'RF05A-NEWKO' ps_abg-hkont_abgr.
  bdc_f 'BDC_OKCODE' '/00'.
  bdc_d 'SAPLKACB' '0002'.
  bdc_f 'COBL-KOSTL' ps_abg-kostl.
  bdc_f 'BDC_OKCODE' '=ENTE'.
* Position 2 Abgrenzungskonto
  bdc_d 'SAPMF05A' '0300'.
  bdc_f 'BSEG-WRBTR' lv_betrag.
  bdc_f 'BDC_OKCODE' '=BU'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  BUCHEN
*&---------------------------------------------------------------------*
FORM buchen USING ps_abg TYPE zfi_abgrenz.
  DATA: ls_msg   TYPE bdcmsgcoll,
        lv_subrc TYPE sysubrc.

  CLEAR gt_msg.
  CALL TRANSACTION 'FBS1' USING gt_bdc
                          MODE p_mode
                          UPDATE 'S'
                          MESSAGES INTO gt_msg.
  lv_subrc = sy-subrc.

* F5 312: Beleg & wurde im Buchungskreis & gebucht
  READ TABLE gt_msg INTO ls_msg WITH KEY msgtyp = 'S'
                                         msgid  = 'F5'
                                         msgnr  = '312'.
  IF lv_subrc = 0 AND sy-subrc = 0.
    UPDATE zfi_abgrenz SET status = 'B'
                           belnr  = ls_msg-msgv1(10)
      WHERE bukrs = ps_abg-bukrs
        AND lfdnr = ps_abg-lfdnr.
    ADD 1 TO gv_ok.
    RETURN.
  ENDIF.

  ADD 1 TO gv_err.
  PERFORM fehler_protokoll USING ps_abg.

  CHECK p_sess = 'X'.
  IF gv_mappe_offen IS INITIAL.
    CALL FUNCTION 'BDC_OPEN_GROUP'
      EXPORTING
        client = sy-mandt
        group  = p_group
        user   = sy-uname
        keep   = 'X'
      EXCEPTIONS
        OTHERS = 1.
    IF sy-subrc <> 0.
      MESSAGE a012 WITH p_group.
    ENDIF.
    gv_mappe_offen = 'X'.
  ENDIF.

  CALL FUNCTION 'BDC_INSERT'
    EXPORTING
      tcode     = 'FBS1'
    TABLES
      dynprotab = gt_bdc.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  FEHLER_PROTOKOLL
*&---------------------------------------------------------------------*
FORM fehler_protokoll USING ps_abg TYPE zfi_abgrenz.
  DATA: ls_msg  TYPE bdcmsgcoll,
        lv_text TYPE string.

  LOOP AT gt_msg INTO ls_msg WHERE msgtyp CA 'EA'.
    CALL FUNCTION 'FORMAT_MESSAGE'
      EXPORTING
        id   = ls_msg-msgid
        no   = ls_msg-msgnr
        v1   = ls_msg-msgv1
        v2   = ls_msg-msgv2
        v3   = ls_msg-msgv3
        v4   = ls_msg-msgv4
      IMPORTING
        msg  = lv_text.
    WRITE: / ps_abg-lfdnr, ls_msg-msgtyp, lv_text.
  ENDLOOP.
ENDFORM.
