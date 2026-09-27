*&---------------------------------------------------------------------*
*& Include ZTV_APPROVAL_MONITOR_F01
*&---------------------------------------------------------------------*

FORM select_trips.
  SELECT p~pernr, p~reinr, h~dates
    FROM ptrv_perio AS p
    INNER JOIN ptrv_head AS h
      ON h~pernr = p~pernr AND h~reinr = p~reinr
    WHERE p~antrg = '3'
    INTO TABLE @DATA(lt_trips).
  CHECK lt_trips IS NOT INITIAL.

  SELECT pernr, reinr, SUM( rec_amount ) AS amount
    FROM ptrv_srec
    FOR ALL ENTRIES IN @lt_trips
    WHERE pernr = @lt_trips-pernr
      AND reinr = @lt_trips-reinr
    GROUP BY pernr, reinr
    INTO TABLE @DATA(lt_sum).

  LOOP AT lt_trips INTO DATA(ls_trip).
    APPEND VALUE ty_work(
             pernr  = ls_trip-pernr
             reinr  = ls_trip-reinr
             days   = sy-datum - ls_trip-dates
             amount = VALUE #( lt_sum[ pernr = ls_trip-pernr
                                       reinr = ls_trip-reinr ]-amount
                               OPTIONAL ) ) TO gt_work.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM determine_approvers.
  DATA lt_p0001 TYPE STANDARD TABLE OF p0001.

  LOOP AT gt_work ASSIGNING FIELD-SYMBOL(<ls_work>).
    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = <ls_work>-pernr
        infty     = '0001'
        begda     = sy-datum
        endda     = sy-datum
      TABLES
        infty_tab = lt_p0001
      EXCEPTIONS
        OTHERS    = 1.
    IF sy-subrc <> 0 OR lt_p0001 IS INITIAL.
      <ls_work>-action = 'KEIN_ORG'.
      CONTINUE.
    ENDIF.
    PERFORM get_leader USING lt_p0001[ 1 ]-orgeh
                       CHANGING <ls_work>-approver.
*   Fuehrungskraft reicht eigene Reise ein -> naechsthoehere Ebene
    IF <ls_work>-approver = <ls_work>-pernr.
      <ls_work>-approver = '99999999'.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM get_leader USING pv_orgeh TYPE orgeh
                CHANGING cv_leader TYPE pernr_d.
  DATA: lv_type TYPE otype,
        lv_id   TYPE realo.
  CLEAR cv_leader.
  CALL FUNCTION 'RH_GET_LEADER'
    EXPORTING
      plvar             = '01'
      keydate           = sy-datum
      otype             = 'O'
      objid             = pv_orgeh
    IMPORTING
      leader_type       = lv_type
      leader_id         = lv_id
    EXCEPTIONS
      no_leader_found   = 1
      no_leading_position_found = 2
      OTHERS            = 3.
  IF sy-subrc = 0 AND lv_type = 'P'.
    cv_leader = lv_id.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM process_by_approver.
  DATA lt_remind TYPE tt_work.

  LOOP AT gt_work INTO DATA(ls_group_key)
       GROUP BY ( approver = ls_group_key-approver )
       ASSIGNING FIELD-SYMBOL(<lg_appr>).
    CLEAR lt_remind.
    LOOP AT GROUP <lg_appr> ASSIGNING FIELD-SYMBOL(<ls_w>).
      CHECK <ls_w>-action IS INITIAL.
      IF <ls_w>-amount <= p_auto AND <ls_w>-days >= p_dauto.
        PERFORM auto_approve CHANGING <ls_w>.
      ELSEIF <ls_w>-days >= p_desc.
        <ls_w>-action = 'ESKALATION'.
        APPEND <ls_w> TO gt_esc.
      ELSEIF <ls_w>-days >= p_drem.
        <ls_w>-action = 'ERINNERUNG'.
        APPEND <ls_w> TO lt_remind.
      ENDIF.
    ENDLOOP.
    IF lt_remind IS NOT INITIAL AND <lg_appr>-approver IS NOT INITIAL.
      PERFORM send_mail USING <lg_appr>-approver lt_remind 'Erinnerung'.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM auto_approve CHANGING cs_work TYPE ty_work.
  DATA lt_return TYPE STANDARD TABLE OF bapiret2.
  IF p_test = abap_true.
    cs_work-action = 'AUTO(TEST)'.
    RETURN.
  ENDIF.
  CALL FUNCTION 'BAPI_TRIP_APPROVE'
    EXPORTING
      employeenumber = cs_work-pernr
      tripnumber     = cs_work-reinr
    TABLES
      return         = lt_return.
  IF line_exists( lt_return[ type = 'E' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    cs_work-action = 'FEHLER'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    cs_work-action = 'AUTO'.
  ENDIF.
ENDFORM.

*----------------------------------------------------------------------*
FORM escalate.
  DATA: lt_p0001 TYPE STANDARD TABLE OF p0001,
        lv_boss  TYPE pernr_d.

  LOOP AT gt_esc INTO DATA(ls_esc)
       GROUP BY ls_esc-approver INTO DATA(lv_approver).
    CALL FUNCTION 'HR_READ_INFOTYPE'
      EXPORTING
        pernr     = lv_approver
        infty     = '0001'
        begda     = sy-datum
        endda     = sy-datum
      TABLES
        infty_tab = lt_p0001
      EXCEPTIONS
        OTHERS    = 1.
    IF sy-subrc <> 0 OR lt_p0001 IS INITIAL.
      CONTINUE.
    ENDIF.
    PERFORM get_leader USING lt_p0001[ 1 ]-orgeh CHANGING lv_boss.
    IF lv_boss IS INITIAL OR lv_boss = lv_approver.
      CONTINUE.
    ENDIF.
    PERFORM send_mail USING lv_boss
                            VALUE tt_work( FOR e IN GROUP lv_approver ( e ) )
                            'Eskalation'.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM send_mail USING pv_pernr TYPE pernr_d
                     pt_work  TYPE tt_work
                     pv_kind  TYPE clike.
  DATA: lt_text TYPE bcsy_text,
        lv_mail TYPE ad_smtpadr.

  CHECK p_test IS INITIAL.
  SELECT SINGLE usrid_long FROM pa0105 INTO @lv_mail
    WHERE pernr = @pv_pernr
      AND usrty = '0010'
      AND begda <= @sy-datum
      AND endda >= @sy-datum.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.

  lt_text = VALUE #( FOR w IN pt_work
                     ( line = |Reise { w-reinr } von { w-pernr }: { w-days } Tage offen| ) ).
  TRY.
      DATA(lo_send) = cl_bcs=>create_persistent( ).
      lo_send->set_document( cl_document_bcs=>create_document(
                               i_type    = 'RAW'
                               i_text    = lt_text
                               i_subject = |Reisekosten: { pv_kind } Genehmigung| ) ).
      lo_send->add_recipient( cl_cam_address_bcs=>create_internet_address( lv_mail ) ).
      lo_send->send( ).
      COMMIT WORK.
    CATCH cx_bcs INTO DATA(lx_bcs).
      MESSAGE lx_bcs->get_text( ) TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.

*----------------------------------------------------------------------*
FORM show_result.
  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                              CHANGING  t_table      = gt_work ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg.
      WRITE: / 'Anzeige nicht moeglich'.
  ENDTRY.
ENDFORM.
