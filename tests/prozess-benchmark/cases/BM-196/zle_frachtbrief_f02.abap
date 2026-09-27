*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTBRIEF_F02
*&---------------------------------------------------------------------*
*& Nachrichtenart ZFB5 - Frachtbrief als PDF per Mail an den Spediteur
*& (Uebertragungsmedium 5 "Externe Sendung"), EXT 11/2019
*&---------------------------------------------------------------------*

*---------------------------------------------------------------------*
*       FORM ENTRY_MAIL
*---------------------------------------------------------------------*
FORM entry_mail USING return_code TYPE i
                      us_screen   TYPE c.

  CLEAR: gv_retcode, gt_lieferung, gt_lips, gt_gg, gs_lfa1, gv_smtp.
  gv_xscreen = us_screen.

  PERFORM daten_lesen.

  IF gv_retcode = 0.
    PERFORM empfaenger_ermitteln.
  ENDIF.

  IF gv_retcode = 0.
    PERFORM formular_ausgeben USING abap_true.
  ENDIF.

  IF gv_retcode = 0.
    PERFORM mail_senden.
  ENDIF.

  return_code = COND #( WHEN gv_retcode = 0 THEN 0 ELSE 1 ).

ENDFORM.                    "entry_mail

*---------------------------------------------------------------------*
*       FORM EMPFAENGER_ERMITTELN
*---------------------------------------------------------------------*
*       Mailadresse aus der Adresse des Spediteurs (LFA1-ADRNR)
*---------------------------------------------------------------------*
FORM empfaenger_ermitteln.

  IF gs_lfa1-lifnr IS INITIAL.
*   Transport ohne Spediteur (Selbstabholer / Werkverkehr)
    prot '040' 'E' gs_vttk-tknum.
    gv_retcode = 1.
    RETURN.
  ENDIF.

* Standard-Mailadresse der Firmenadresse des Spediteurs
  SELECT SINGLE smtp_addr FROM adr6 INTO gv_smtp
    WHERE addrnumber = gs_lfa1-adrnr
      AND persnumber = space
      AND flgdefault = abap_true.
  IF sy-subrc <> 0 OR gv_smtp IS INITIAL.
    prot '041' 'E' gs_lfa1-lifnr.
    gv_retcode = 1.
    RETURN.
  ENDIF.

* Fallback ueber Dispo-Kontakte - nie produktiv gegangen (EXT 2019)
*  SELECT SINGLE mail_dispo FROM zle_sped_kontakt INTO gv_smtp
*    WHERE lifnr = gs_lfa1-lifnr
*      AND vsart = gs_vttk-vsart.

* Test MK 03/2020 - nicht an echte Spediteure senden
  IF sy-uname = 'KRAUSE_M'.
    gv_smtp = 'frachtbrief-test@kunde.example'.
  ENDIF.

ENDFORM.                    "empfaenger_ermitteln

*---------------------------------------------------------------------*
*       FORM MAIL_SENDEN
*---------------------------------------------------------------------*
*       Business Communication Services: Text + PDF-Anhang
*---------------------------------------------------------------------*
FORM mail_senden.

  DATA: lo_send    TYPE REF TO cl_bcs,
        lo_doc     TYPE REF TO cl_document_bcs,
        lx_bcs     TYPE REF TO cx_bcs,
        lt_text    TYPE bcsy_text,
        lt_solix   TYPE solix_tab,
        lv_betreff TYPE so_obj_des,
        lv_anhang  TYPE so_obj_des,
        lv_ok      TYPE os_boolean.

  lv_betreff = |Frachtbrief Transport { gs_vttk-tknum ALPHA = OUT }|.
  lv_anhang  = |Frachtbrief_{ gs_vttk-tknum ALPHA = OUT }|.

  APPEND 'Sehr geehrte Damen und Herren,' TO lt_text.
  APPEND 'anbei erhalten Sie den Frachtbrief zum o. g. Transport.' TO lt_text.
  APPEND 'Diese Nachricht wurde maschinell erstellt.' TO lt_text.
*  IF gv_freigest = abap_false.            "Wunsch Dispo 2020, nicht umgesetzt
*    APPEND 'ACHTUNG: Gefahrgut - kennzeichnungspflichtig (ADR)' TO lt_text.
*  ENDIF.

  TRY.
      lo_send = cl_bcs=>create_persistent( ).

      lo_doc = cl_document_bcs=>create_document(
                 i_type    = 'RAW'
                 i_text    = lt_text
                 i_subject = lv_betreff ).

      lt_solix = cl_bcs_convert=>xstring_to_solix( iv_xstring = gv_pdf ).
      lo_doc->add_attachment(
        i_attachment_type    = 'PDF'
        i_attachment_subject = lv_anhang
        i_attachment_size    = CONV #( xstrlen( gv_pdf ) )
        i_att_content_hex    = lt_solix ).

      lo_send->set_document( lo_doc ).
      lo_send->add_recipient(
        i_recipient = cl_cam_address_bcs=>create_internet_address( gv_smtp )
        i_express   = abap_true ).
      lo_send->set_send_immediately( abap_true ).

      lv_ok = lo_send->send( i_with_error_screen = space ).

    CATCH cx_bcs INTO lx_bcs.
      prot '043' 'E' gs_vttk-tknum.
      gv_retcode = 1.
      RETURN.
  ENDTRY.

  IF lv_ok = abap_true.
*   COMMIT noetig, sonst bleibt die Sendung in SOST haengen (EXT 2019)
    COMMIT WORK.
  ELSE.
    prot '045' 'E' gs_vttk-tknum.
    gv_retcode = 1.
  ENDIF.

ENDFORM.                    "mail_senden
