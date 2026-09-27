CLASS zcl_cs_vertrag_hinweis IMPLEMENTATION.
* Hinweis-Mail an den Vertriebsinnendienst: Serviceverträge, die in
* den nächsten Tagen auslaufen (Aufruf aus Job ZCS_VERTRAG_ABLAUF)
  METHOD sende_ablaufhinweis.
    DATA(lt_text) = VALUE bcsy_text(
      FOR ls_vertr IN it_vertraege
      ( line = |{ ls_vertr-vbeln } { ls_vertr-kunnr } endet am { ls_vertr-venddat DATE = USER }| ) ).

    TRY.
        DATA(lo_send) = cl_bcs=>create_persistent( ).
        lo_send->set_document( cl_document_bcs=>create_document(
                                 i_type    = 'RAW'
                                 i_text    = lt_text
                                 i_subject = 'Auslaufende Serviceverträge' ) ).
        lo_send->add_recipient( cl_cam_address_bcs=>create_internet_address( iv_empfaenger ) ).
        lo_send->send( ).
        COMMIT WORK.
      CATCH cx_bcs INTO DATA(lx_bcs).
        RAISE EXCEPTION TYPE zcx_cs_mail
          EXPORTING
            previous = lx_bcs.
    ENDTRY.
  ENDMETHOD.
ENDCLASS.
