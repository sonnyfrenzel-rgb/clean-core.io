REPORT zsd_auftragsbest_mail.
*----------------------------------------------------------------------*
* Verarbeitungsprogramm Nachrichtenart ZBAM (Tabelle TNAPR)
* Auftragsbestätigung als E-Mail an die Standard-Mailadresse des
* Auftraggebers. 2012-09 HWI, 2019-03 SKO: Probeausgabe aus VA03
*----------------------------------------------------------------------*
TABLES: nast.

DATA: gs_vbak    TYPE vbak,
      gv_email   TYPE ad_smtpadr,
      gt_text    TYPE STANDARD TABLE OF solisti1,
      gt_recv    TYPE STANDARD TABLE OF somlreci1,
      gs_docdata TYPE sodocchgi1.

*---------------------------------------------------------------------*
*       FORM ENTRY  - Aufruf aus RSNAST00 / Nachrichtensteuerung
*---------------------------------------------------------------------*
FORM entry USING return_code TYPE i
                 us_screen   TYPE c.
  CLEAR: gt_text, gt_recv, gv_email.
  return_code = 0.

  SELECT SINGLE * FROM vbak INTO gs_vbak WHERE vbeln = nast-objky(10).
  IF sy-subrc <> 0.
    PERFORM protokoll USING '010' nast-objky.
    return_code = 1.
    RETURN.
  ENDIF.

  SELECT SINGLE a~smtp_addr FROM adr6 AS a
    INNER JOIN kna1 AS k ON k~adrnr = a~addrnumber
    INTO gv_email
    WHERE k~kunnr      = nast-parnr
      AND a~flgdefault = abap_true.
  IF gv_email IS INITIAL.
    PERFORM protokoll USING '011' nast-parnr.
    return_code = 1.
    RETURN.
  ENDIF.

  gs_docdata-obj_descr = |Auftragsbestätigung { gs_vbak-vbeln ALPHA = OUT }|.
  APPEND VALUE #( line = |Sehr geehrte Damen und Herren,| ) TO gt_text.
  APPEND VALUE #( line = |wir bestätigen Ihre Bestellung { gs_vbak-bstnk }| ) TO gt_text.
  APPEND VALUE #( line = |über { gs_vbak-netwr } { gs_vbak-waerk }.| ) TO gt_text.
  APPEND VALUE #( receiver = gv_email rec_type = 'U' ) TO gt_recv.

  IF us_screen = abap_true.            "Probeausgabe: nur anzeigen
    MESSAGE i012(zsd) WITH gv_email.
    RETURN.
  ENDIF.

  CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
    EXPORTING
      document_data  = gs_docdata
      commit_work    = space
    TABLES
      object_content = gt_text
      receivers      = gt_recv
    EXCEPTIONS
      OTHERS         = 8.
  IF sy-subrc <> 0.
    PERFORM protokoll USING '013' gv_email.
    return_code = sy-subrc.
  ENDIF.
ENDFORM.

*---------------------------------------------------------------------*
*       FORM PROTOKOLL - Meldung ins Nachrichtenprotokoll
*---------------------------------------------------------------------*
FORM protokoll USING iv_msgno TYPE symsgno
                     iv_v1    TYPE any.
  CALL FUNCTION 'NAST_PROTOCOL_UPDATE'
    EXPORTING
      msg_arbgb = 'ZSD'
      msg_nr    = iv_msgno
      msg_ty    = 'E'
      msg_v1    = iv_v1
    EXCEPTIONS
      OTHERS    = 1.
ENDFORM.
