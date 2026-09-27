*&---------------------------------------------------------------------*
*& Web-Dynpro-Komponente ZWD_EHS_UNFALL - COMPONENTCONTROLLER
*& Arbeitsunfallmeldung (ersetzt Papierformular "Unfallanzeige")
*&---------------------------------------------------------------------*
*& 2014-03 K.Brandt     Erstversion
*& 2017-11 M.Oezdemir   Change Documents (Objekt ZEHS_UNF), Zeugen
*& 2019-02 M.Oezdemir   Zeugen ausgebaut (Datenschutz), Tabelle bleibt
*& 2019-06 ext. (CSC)   Mail an Sicherheitsfachkraft, Schalter TVARVC
*&---------------------------------------------------------------------*

METHOD load_unfall.
* Importing: IV_UNFALL_NR TYPE ZEHS_UNFALL_NR
  DATA lo_nd_unfall TYPE REF TO if_wd_context_node.
  DATA ls_unfall    TYPE zehs_unfall.

  lo_nd_unfall = wd_context->get_child_node( name = wd_this->wdctx_unfall ).

  IF iv_unfall_nr IS INITIAL.
*   Neuanlage: Vorbelegung Erfasser / Datum / Status "in Erfassung"
    ls_unfall-erfasser = sy-uname.
    ls_unfall-erfdat   = sy-datum.
    ls_unfall-status   = '01'.
    lo_nd_unfall->bind_structure( new_item = ls_unfall set_initial_elements = abap_true ).
    CLEAR wd_this->ms_unfall_alt.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM zehs_unfall INTO ls_unfall
    WHERE unfall_nr = iv_unfall_nr.
  IF sy-subrc <> 0.
    wd_this->wd_get_api( )->get_message_manager( )->report_error_message(
      message_text = |Unfallmeldung { iv_unfall_nr } nicht gefunden| ).
    RETURN.
  ENDIF.

* Zeugen: eigener Knoten ZEUGEN, Supply-Funktion SUPPLY_ZEUGEN (entfernt 2019, Tab ausgeblendet)
  wd_this->ms_unfall_alt = ls_unfall.
  lo_nd_unfall->bind_structure( new_item = ls_unfall ).

ENDMETHOD.


METHOD save_unfall.
* Returning: RV_OK TYPE ABAP_BOOL
  DATA lo_nd_unfall TYPE REF TO if_wd_context_node.
  DATA lo_msg       TYPE REF TO if_wd_message_manager.
  DATA ls_unfall    TYPE zehs_unfall.
  DATA ls_alt       TYPE zehs_unfall.
  DATA lv_objectid  TYPE cdhdr-objectid.
  DATA lv_chngind   TYPE cdchngind.

  lo_msg = wd_this->wd_get_api( )->get_message_manager( ).
  lo_nd_unfall = wd_context->get_child_node( name = wd_this->wdctx_unfall ).
  lo_nd_unfall->get_static_attributes( IMPORTING static_attributes = ls_unfall ).
  ls_alt = wd_this->ms_unfall_alt.

  IF ls_unfall-unfall_nr IS INITIAL.
    CALL FUNCTION 'NUMBER_GET_NEXT'
      EXPORTING
        nr_range_nr = '01'
        object      = 'ZEHS_UNF'
      IMPORTING
        number      = ls_unfall-unfall_nr
      EXCEPTIONS
        OTHERS      = 1.
    IF sy-subrc <> 0.
      lo_msg->report_error_message(
        message_text = 'Keine Unfallnummer vergeben (Nummernkreis ZEHS_UNF prüfen)' ).
      rv_ok = abap_false.
      RETURN.
    ENDIF.
    lv_chngind = 'I'.
  ELSE.
    lv_chngind = 'U'.
  ENDIF.

* Meldepflicht ggü. BG: mehr als drei Kalendertage arbeitsunfähig (§ 193 SGB VII)
  ls_unfall-meldepflichtig = COND #( WHEN ls_unfall-ausfalltage > 3 THEN abap_true
                                     ELSE abap_false ).
  ls_unfall-status = COND #( WHEN ls_unfall-status = '01' THEN '02' ELSE ls_unfall-status ).
  ls_unfall-aenam  = sy-uname.
  ls_unfall-aedat  = sy-datum.

  MODIFY zehs_unfall FROM ls_unfall.
  IF sy-subrc <> 0.
    ROLLBACK WORK.
    lo_msg->report_error_message( message_text = 'Fehler beim Sichern der Unfallmeldung' ).
    rv_ok = abap_false.
    RETURN.
  ENDIF.

* Zeugen: seit 2019 nicht mehr in der Maske - Tabelle ZEHS_UNF_ZEUGE bleibt leer
*  DELETE FROM zehs_unf_zeuge WHERE unfall_nr = ls_unfall-unfall_nr.
*  INSERT zehs_unf_zeuge FROM TABLE lt_zeugen.

  lv_objectid = ls_unfall-unfall_nr.
  CALL FUNCTION 'ZEHS_UNF_WRITE_DOCUMENT' IN UPDATE TASK
    EXPORTING
      objectid        = lv_objectid
      tcode           = 'ZEHS_UNF'
      utime           = sy-uzeit
      udate           = sy-datum
      username        = sy-uname
      upd_zehs_unfall = lv_chngind
      n_zehs_unfall   = ls_unfall
      o_zehs_unfall   = ls_alt.

  COMMIT WORK.

  wd_this->ms_unfall_alt = ls_unfall.
  lo_nd_unfall->set_attribute( name = 'UNFALL_NR' value = ls_unfall-unfall_nr ).

* Sifa nur beim ersten Erreichen der Meldepflicht informieren
  IF ls_unfall-meldepflichtig = abap_true AND ls_alt-meldepflichtig = abap_false.
    wd_this->send_sifa_mail( is_unfall = ls_unfall ).
  ENDIF.

  lo_msg->report_success( message_text = |Unfallmeldung { ls_unfall-unfall_nr } gesichert| ).
  rv_ok = abap_true.

ENDMETHOD.


METHOD send_sifa_mail.
* Importing: IS_UNFALL TYPE ZEHS_UNFALL
  DATA lo_send_request TYPE REF TO cl_bcs.
  DATA lo_document     TYPE REF TO cl_document_bcs.
  DATA lo_recipient    TYPE REF TO if_recipient_bcs.
  DATA lt_text         TYPE bcsy_text.
  DATA lv_sifa_mail    TYPE ad_smtpadr.
  DATA lv_aktiv        TYPE tvarvc-low.
  DATA lx_bcs          TYPE REF TO cx_bcs.

* Schalter Mailversand (im QAS aus, sonst Mails an echte Sifas)
  SELECT SINGLE low FROM tvarvc INTO lv_aktiv
    WHERE name = 'ZEHS_UNFALL_MAIL'
      AND type = 'P'
      AND numb = '0000'.
  IF lv_aktiv <> 'X'.
    RETURN.
  ENDIF.

* Sicherheitsfachkraft des Werks, sonst Sammelpostfach
  SELECT SINGLE smtp_addr FROM zehs_sifa INTO lv_sifa_mail
    WHERE werks = is_unfall-werks.
  IF sy-subrc <> 0.
    lv_sifa_mail = 'arbeitssicherheit@kunde.example'.
  ENDIF.

  APPEND |Meldepflichtiger Arbeitsunfall { is_unfall-unfall_nr }| TO lt_text.
  APPEND |Werk { is_unfall-werks }, Unfalldatum { is_unfall-unfdat DATE = USER }| TO lt_text.
  APPEND |Voraussichtliche Ausfalltage: { is_unfall-ausfalltage }| TO lt_text.
  APPEND 'Unfallanzeige an die BG ist innerhalb von 3 Tagen zu erstatten.' TO lt_text.

  TRY.
      lo_send_request = cl_bcs=>create_persistent( ).
      lo_document = cl_document_bcs=>create_document(
                      i_type    = 'RAW'
                      i_text    = lt_text
                      i_subject = |Meldepflichtiger Unfall { is_unfall-unfall_nr }| ).
      lo_send_request->set_document( lo_document ).
      lo_recipient = cl_cam_address_bcs=>create_internet_address( lv_sifa_mail ).
      lo_send_request->add_recipient( lo_recipient ).
*     lo_send_request->set_send_immediately( abap_true ).   "wieder raus, SOST-Job reicht
      lo_send_request->send( ).
      COMMIT WORK.
    CATCH cx_bcs INTO lx_bcs.
      wd_this->wd_get_api( )->get_message_manager( )->report_warning(
        message_text = |Mail an Sicherheitsfachkraft fehlgeschlagen: { lx_bcs->get_text( ) }| ).
    CLEANUP.
      CLEAR lo_send_request.
  ENDTRY.

ENDMETHOD.


METHOD print_unfallanzeige.
* Importing: IS_UNFALL TYPE ZEHS_UNFALL
* Adobe-Formular Unfallanzeige BG - Button wurde 2018 aus der View entfernt
  DATA ls_outparams TYPE sfpoutputparams.
  DATA lv_fm_name   TYPE funcname.

  CALL FUNCTION 'FP_JOB_OPEN'
    CHANGING
      ie_outputparams = ls_outparams
    EXCEPTIONS
      OTHERS          = 1.
  CHECK sy-subrc = 0.
  CALL FUNCTION 'FP_FUNCTION_MODULE_NAME'
    EXPORTING
      i_name     = 'ZEHS_UNFALLANZEIGE'
    IMPORTING
      e_funcname = lv_fm_name.
  CALL FUNCTION lv_fm_name
    EXPORTING
      is_unfall = is_unfall.
  CALL FUNCTION 'FP_JOB_CLOSE'.

ENDMETHOD.
