*&---------------------------------------------------------------------*
*&  Include           ZCO_ABWEICHUNG_MAIL_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  ABWEICHUNG_ERMITTELN
*&---------------------------------------------------------------------*
*       Plan (WRTTP 01) und Ist (WRTTP 04) kumuliert Periode 1..p_perbi
*----------------------------------------------------------------------*
FORM abweichung_ermitteln USING    ps_ks  TYPE ty_ks
                          CHANGING cs_abw TYPE ty_abw.
  DATA: lt_cosp  TYPE STANDARD TABLE OF cosp,
        ls_cosp  TYPE cosp,
        lv_objnr TYPE j_objnr,
        lv_wert  TYPE wkgxxx.

  CLEAR cs_abw.
  cs_abw-kostl = ps_ks-kostl.
  CONCATENATE 'KS' p_kokrs ps_ks-kostl INTO lv_objnr.

* nur Primaerkosten (COSP); Sekundaerkosten COSS bewusst nicht
  SELECT * FROM cosp INTO TABLE lt_cosp
    WHERE objnr = lv_objnr
      AND gjahr = p_gjahr
      AND wrttp IN ('01', '04')
      AND versn = p_versn.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  LOOP AT lt_cosp INTO ls_cosp.
    DO p_perbi TIMES VARYING lv_wert FROM ls_cosp-wkg001 NEXT ls_cosp-wkg002.
      IF ls_cosp-wrttp = '01'.
        cs_abw-plan = cs_abw-plan + lv_wert.
      ELSE.
        cs_abw-ist = cs_abw-ist + lv_wert.
      ENDIF.
    ENDDO.
  ENDLOOP.

  IF cs_abw-plan <> 0.
    cs_abw-proz = ( cs_abw-ist - cs_abw-plan ) * 100 / cs_abw-plan.
  ELSE.
*   ohne Plan gilt jede Istbuchung als Abweichung
    cs_abw-proz = 999.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  MAIL_SENDEN
*&---------------------------------------------------------------------*
FORM mail_senden USING ps_ks  TYPE ty_ks
                       ps_abw TYPE ty_abw.
  DATA: lo_send    TYPE REF TO cl_bcs,
        lo_doc     TYPE REF TO cl_document_bcs,
        lo_rec     TYPE REF TO if_recipient_bcs,
        lx_bcs     TYPE REF TO cx_bcs,
        lt_text    TYPE bcsy_text,
        ls_text    TYPE soli,
        lv_subject TYPE so_obj_des,
        lv_ok      TYPE os_boolean,
        lv_c(20)   TYPE c.

  CONCATENATE 'Plan/Ist-Abweichung Kostenstelle' ps_abw-kostl
    INTO lv_subject SEPARATED BY space.
  WRITE ps_abw-plan TO lv_c.
  CONCATENATE 'Plan kumuliert:' lv_c INTO ls_text-line SEPARATED BY space.
  APPEND ls_text TO lt_text.
  WRITE ps_abw-ist TO lv_c.
  CONCATENATE 'Ist kumuliert:' lv_c INTO ls_text-line SEPARATED BY space.
  APPEND ls_text TO lt_text.
  WRITE ps_abw-proz TO lv_c.
  CONCATENATE 'Abweichung %:' lv_c INTO ls_text-line SEPARATED BY space.
  APPEND ls_text TO lt_text.

  TRY.
      lo_send = cl_bcs=>create_persistent( ).
      lo_doc  = cl_document_bcs=>create_document( i_type    = 'RAW'
                                                  i_text    = lt_text
                                                  i_subject = lv_subject ).
      lo_send->set_document( lo_doc ).
      lo_rec = cl_sapuser_bcs=>create( ps_ks-verak_user ).
      lo_send->add_recipient( lo_rec ).
      lv_ok = lo_send->send( ).
      IF lv_ok = abap_true.
        COMMIT WORK.
        WRITE: / ps_ks-kostl, 'Mail an', ps_ks-verak_user.
      ENDIF.
    CATCH cx_bcs INTO lx_bcs.
      WRITE: / ps_ks-kostl, 'Mailfehler:', lx_bcs->error_type.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  LISTE_AUSGEBEN
*&---------------------------------------------------------------------*
FORM liste_ausgeben.
  DATA ls_abw TYPE ty_abw.

  ULINE.
  LOOP AT gt_abw INTO ls_abw.
    WRITE: / ls_abw-kostl, ls_abw-plan, ls_abw-ist, ls_abw-proz.
  ENDLOOP.
ENDFORM.
