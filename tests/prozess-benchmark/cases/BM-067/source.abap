REPORT zpm_auftrag_aus_meldung.
*&---------------------------------------------------------------------*
*& IH-Auftraege (Art PM01) zu offenen Stoermeldungen M1 ohne Auftrag
*& per Batch-Input IW31 anlegen.
*& 2003 - BDC, weil es im 4.6C keine Auftrags-BAPI gab. Nie umgestellt.
*&---------------------------------------------------------------------*
TABLES: qmel, qmih.
SELECT-OPTIONS: s_qmnum FOR qmel-qmnum,
                s_iwerk FOR qmih-iwerk OBLIGATORY.
PARAMETERS p_mode TYPE ctu_mode DEFAULT 'N'.

TYPES: BEGIN OF ty_mel,
         qmnum TYPE qmnum,
         equnr TYPE equnr,
         iwerk TYPE iwerk,
         qmtxt TYPE qmtxt,
       END OF ty_mel.

DATA: gt_mel  TYPE STANDARD TABLE OF ty_mel,
      gs_mel  TYPE ty_mel,
      gt_bdc  TYPE STANDARD TABLE OF bdcdata,
      gs_bdc  TYPE bdcdata,
      gt_msg  TYPE STANDARD TABLE OF bdcmsgcoll,
      gs_msg  TYPE bdcmsgcoll,
      gv_text TYPE string,
      gv_ok   TYPE i,
      gv_err  TYPE i.

DEFINE bdc_d.
  CLEAR gs_bdc.
  gs_bdc-program  = &1.
  gs_bdc-dynpro   = &2.
  gs_bdc-dynbegin = 'X'.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.

DEFINE bdc_f.
  CLEAR gs_bdc.
  gs_bdc-fnam = &1.
  gs_bdc-fval = &2.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.

START-OF-SELECTION.
  SELECT m~qmnum i~equnr i~iwerk m~qmtxt
    INTO TABLE gt_mel
    FROM qmel AS m INNER JOIN qmih AS i ON i~qmnum = m~qmnum
    WHERE m~qmnum IN s_qmnum
      AND i~iwerk IN s_iwerk
      AND m~qmart = 'M1'
      AND m~aufnr = space.
  IF gt_mel IS INITIAL.
    WRITE / 'Keine offenen Stoermeldungen ohne Auftrag'.
    RETURN.
  ENDIF.

  LOOP AT gt_mel INTO gs_mel.
*   Meldungen ohne Equipment klaert die Arbeitsvorbereitung manuell
    IF gs_mel-equnr IS INITIAL.
      WRITE: / gs_mel-qmnum, 'ohne Equipment - uebersprungen'.
      CONTINUE.
    ENDIF.

    PERFORM build_bdc USING gs_mel.

    CLEAR gt_msg.
    CALL TRANSACTION 'IW31' USING gt_bdc
                            MODE p_mode
                            UPDATE 'S'
                            MESSAGES INTO gt_msg.

    READ TABLE gt_msg INTO gs_msg WITH KEY msgtyp = 'E'.
    IF sy-subrc = 0.
      MESSAGE ID gs_msg-msgid TYPE 'S' NUMBER gs_msg-msgnr
              WITH gs_msg-msgv1 gs_msg-msgv2 gs_msg-msgv3 gs_msg-msgv4
              INTO gv_text.
      gv_err = gv_err + 1.
      WRITE: / gs_mel-qmnum, 'FEHLER:', gv_text.
    ELSE.
      gv_ok = gv_ok + 1.
      WRITE: / gs_mel-qmnum, 'verarbeitet'.
    ENDIF.
  ENDLOOP.

  ULINE.
  WRITE: / 'Verarbeitet:', gv_ok, 'Fehler:', gv_err.

*&---------------------------------------------------------------------*
*& Batch-Input-Tabelle IW31: Einstieg mit Meldung, Kopf, Sichern
*&---------------------------------------------------------------------*
FORM build_bdc USING is_mel TYPE ty_mel.
  CLEAR gt_bdc.
  bdc_d 'SAPLCOIH' '0100'.
  bdc_f 'CAUFVD-AUART' 'PM01'.
  bdc_f 'RIWO00-QMNUM' is_mel-qmnum.
  bdc_f 'CAUFVD-IWERK' is_mel-iwerk.
  bdc_f 'BDC_OKCODE'   '/00'.
  bdc_d 'SAPLCOIH' '3000'.
  bdc_f 'CAUFVD-KTEXT' is_mel-qmtxt.
* bdc_f 'CAUFVD-PRIOK' '2'.        "raus 2011, kommt aus Meldung
  bdc_f 'BDC_OKCODE'   '=BU'.
ENDFORM.
