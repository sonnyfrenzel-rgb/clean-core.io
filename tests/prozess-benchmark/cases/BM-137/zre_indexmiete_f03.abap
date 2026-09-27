*&---------------------------------------------------------------------*
*& Include ZRE_INDEXMIETE_F03 - Mail an die Objektbetreuung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form FEHLER_MAILEN
*&   Verträge mit Fehler, Sperre oder Druckfehler an die im
*&   Buchungskreis hinterlegte Adresse der Objektbetreuung melden
*&---------------------------------------------------------------------*
FORM fehler_mailen.
  DATA: lt_text   TYPE bcsy_text,
        lt_fehler LIKE gt_erg,
        lv_empf   TYPE ad_smtpadr.

  lt_fehler = VALUE #( FOR ls_e IN gt_erg
                       WHERE ( status = 'F' OR status = 'G' OR status = 'D' )
                       ( ls_e ) ).
  IF lt_fehler IS INITIAL.
    RETURN.
  ENDIF.

  SELECT SINGLE smtp_addr FROM zre_bukrs_mail INTO lv_empf
    WHERE bukrs = p_bukrs.
  IF sy-subrc <> 0.
    MESSAGE s213 WITH p_bukrs.
    RETURN.
  ENDIF.

  lt_text = VALUE #( ( line = |Indexmietanpassung { p_monat } wirksam ab { p_ab DATE = USER }| )
                     ( line = |Folgende Verträge brauchen Nacharbeit:| ) ).
  LOOP AT lt_fehler INTO DATA(ls_f).
    APPEND VALUE #( line = |{ ls_f-recnnr } { ls_f-status } { ls_f-text }| ) TO lt_text.
  ENDLOOP.

  TRY.
      DATA(lo_send) = cl_bcs=>create_persistent( ).
      lo_send->set_document( cl_document_bcs=>create_document(
                               i_type    = 'RAW'
                               i_text    = lt_text
                               i_subject = CONV so_obj_des( |Indexmiete { p_bukrs }: Nacharbeit| ) ) ).
      lo_send->add_recipient( cl_cam_address_bcs=>create_internet_address( lv_empf ) ).
      lo_send->send( ).
      COMMIT WORK.
    CATCH cx_bcs INTO DATA(lx_bcs).
      MESSAGE lx_bcs TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.
