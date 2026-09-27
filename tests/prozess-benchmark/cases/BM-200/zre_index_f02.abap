*&---------------------------------------------------------------------*
*&  Include           ZRE_INDEX_F02
*&---------------------------------------------------------------------*
*&  Mieteranschreiben (Adobe Form) und Versand per Mail
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  CREATE_LETTERS
*&---------------------------------------------------------------------*
*       Anschreiben je erfolgreich angepasstem Vertrag als PDF erzeugen
*       und an den Hauptmieter mailen. Ohne Mail-Kennzeichen wird das
*       PDF nur erzeugt, Druck erfolgt ueber DMS (ZRE_ARCHIVE).
*----------------------------------------------------------------------*
FORM create_letters.

  DATA: ls_outpar TYPE sfpoutputparams,
        ls_docpar TYPE sfpdocparams,
        ls_output TYPE fpformoutput,
        lv_fm     TYPE funcname.

  ls_outpar-nodialog = abap_true.
  ls_outpar-getpdf   = abap_true.
  CALL FUNCTION 'FP_JOB_OPEN'
    CHANGING
      ie_outputparams = ls_outpar
    EXCEPTIONS
      cancel          = 1
      usage_error     = 2
      system_error    = 3
      internal_error  = 4
      OTHERS          = 5.
  IF sy-subrc <> 0.
    APPEND VALUE #( msgty = 'E' msgno = '008' ) TO gt_msg.
    RETURN.
  ENDIF.

* TRY/CATCH cx_fp_api entfernt 2023 - "Formular ist immer aktiv"
  CALL FUNCTION 'FP_FUNCTION_MODULE_NAME'
    EXPORTING
      i_name     = gc_form
    IMPORTING
      e_funcname = lv_fm.

  ls_docpar-langu   = 'D'.
  ls_docpar-country = 'DE'.

  LOOP AT gt_result INTO DATA(ls_res) WHERE status = 'OK'.

*   Hauptmieter zum Stichtag
    SELECT SINGLE partner FROM vibpobjrel
      WHERE intreno   = @ls_res-intreno
        AND role      = @gc_role_tenant
        AND validfrom <= @p_stich
        AND ( validto >= @p_stich OR validto = '00000000' )
      INTO @DATA(lv_partner).
    IF sy-subrc <> 0.
      APPEND VALUE #( msgty = 'E' msgno = '020' msgv1 = ls_res-recnnr ) TO gt_msg.
      CONTINUE.
    ENDIF.

    CALL FUNCTION lv_fm
      EXPORTING
        /1bcdwb/docparams  = ls_docpar
        is_result          = ls_res
        iv_partner         = lv_partner
        iv_keydate         = p_stich
      IMPORTING
        /1bcdwb/formoutput = ls_output
      EXCEPTIONS
        usage_error        = 1
        system_error       = 2
        internal_error     = 3
        OTHERS             = 4.
    IF sy-subrc <> 0.
      APPEND VALUE #( msgty = 'E' msgno = '022' msgv1 = ls_res-recnnr
                      msgv2 = |{ sy-subrc }| ) TO gt_msg.
      CONTINUE.
    ENDIF.
    gv_letters = gv_letters + 1.

    IF p_mail = abap_true.
      PERFORM send_mail USING ls_res lv_partner ls_output-pdf.
    ENDIF.

  ENDLOOP.

  CALL FUNCTION 'FP_JOB_CLOSE'
    EXCEPTIONS
      OTHERS = 1.

  APPEND VALUE #( msgty = 'S' msgno = '040' msgv1 = |{ gv_letters }|
                  msgv2 = |{ gv_mails }| ) TO gt_msg.

ENDFORM.                    " CREATE_LETTERS

*&---------------------------------------------------------------------*
*&      Form  SEND_MAIL
*&---------------------------------------------------------------------*
FORM send_mail USING us_res     TYPE ty_result
                     uv_partner TYPE bu_partner
                     uv_pdf     TYPE xstring.

  DATA lt_text TYPE bcsy_text.

  SELECT SINGLE a~smtp_addr
    FROM but020 AS b
    INNER JOIN adr6 AS a ON a~addrnumber = b~addrnumber
    WHERE b~partner    = @uv_partner
      AND a~flgdefault = @abap_true
    INTO @DATA(lv_mail).
  IF sy-subrc <> 0 OR lv_mail IS INITIAL.
*   kein Mailkontakt - Sachbearbeiter muss per Post versenden
    APPEND VALUE #( msgty = 'W' msgno = '021' msgv1 = us_res-recnnr
                    msgv2 = uv_partner ) TO gt_msg.
    RETURN.
  ENDIF.

  TRY.
      DATA(lo_send) = cl_bcs=>create_persistent( ).

      lt_text = VALUE #(
        ( line = 'Sehr geehrte Damen und Herren,' )
        ( line = 'anbei erhalten Sie die Mitteilung ueber die Anpassung' )
        ( line = 'Ihrer Miete gemaess der vereinbarten Indexklausel.' ) ).

      DATA(lo_doc) = cl_document_bcs=>create_document(
        i_type    = 'RAW'
        i_text    = lt_text
        i_subject = CONV so_obj_des( |Mietanpassung Vertrag { us_res-recnnr }| ) ).

      lo_doc->add_attachment(
        i_attachment_type    = 'PDF'
        i_attachment_subject = CONV so_obj_des( |Indexanpassung_{ us_res-recnnr }| )
        i_att_content_hex    = cl_bcs_convert=>xstring_to_solix( uv_pdf ) ).

      lo_send->set_document( lo_doc ).
      lo_send->add_recipient( cl_cam_address_bcs=>create_internet_address( lv_mail ) ).
      lo_send->set_send_immediately( abap_true ).
      lo_send->send( ).
      COMMIT WORK.
      gv_mails = gv_mails + 1.

    CATCH cx_bcs INTO DATA(lx_bcs).
      APPEND VALUE #( msgty = 'E' msgno = '023' msgv1 = us_res-recnnr
                      msgv2 = lx_bcs->get_text( ) ) TO gt_msg.
  ENDTRY.

ENDFORM.                    " SEND_MAIL
