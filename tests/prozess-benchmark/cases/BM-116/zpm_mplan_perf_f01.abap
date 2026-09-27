*----------------------------------------------------------------------*
***INCLUDE ZPM_MPLAN_PERF_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form SELECT_PLANS
*&---------------------------------------------------------------------*
* Leistungsabhängige Pläne: Zyklus mit Messpunkt; ohne Pläne mit
* Löschvormerkung (I0076) oder inaktiv (I0320)
*----------------------------------------------------------------------*
FORM select_plans.
  SELECT DISTINCT a~warpl p~iwerk
    INTO CORRESPONDING FIELDS OF TABLE gt_plan
    FROM mpla AS a
    INNER JOIN mpos AS p ON p~warpl = a~warpl
    INNER JOIN mmpt AS c ON c~warpl = a~warpl
    WHERE a~warpl IN s_warpl
      AND p~iwerk IN s_iwerk
      AND c~point <> space
      AND a~objnr NOT IN ( SELECT objnr FROM jest
                             WHERE ( stat = 'I0076' OR stat = 'I0320' )
                               AND inact = space ).
  SORT gt_plan BY iwerk warpl.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPATCH
*&---------------------------------------------------------------------*
* Ein Paket je Planungswerk - sequentiell oder als aRFC
*----------------------------------------------------------------------*
FORM dispatch.
  DATA: lt_pack TYPE zpm_t_warpl,
        lt_res  TYPE zpm_t_mplan_result,
        lv_task TYPE c LENGTH 32,
        lv_idx  TYPE i,
        lv_rc   TYPE sy-subrc,
        lv_text TYPE string.

  LOOP AT gt_plan INTO DATA(ls_plan)
       GROUP BY ( iwerk = ls_plan-iwerk ) ASSIGNING FIELD-SYMBOL(<ls_grp>).

    lt_pack = VALUE #( FOR ls_m IN GROUP <ls_grp> ( ls_m-warpl ) ).

    IF p_para IS INITIAL.
      CALL FUNCTION 'Z_PM_MPLAN_CALC'
        EXPORTING
          it_warpl  = lt_pack
          iv_test   = p_test
        IMPORTING
          et_result = lt_res.
      APPEND LINES OF lt_res TO gt_result.
      CONTINUE.
    ENDIF.

    lv_idx  = lv_idx + 1.
    lv_task = |MPLAN_{ <ls_grp>-iwerk }_{ lv_idx }|.

    DO.
      CALL FUNCTION 'Z_PM_MPLAN_CALC'
        STARTING NEW TASK lv_task
        DESTINATION IN GROUP p_group
        PERFORMING receive_result ON END OF TASK
        EXPORTING
          it_warpl              = lt_pack
          iv_test               = p_test
        EXCEPTIONS
          communication_failure = 1
          system_failure        = 2
          resource_failure      = 3.
      lv_rc = sy-subrc.
      CASE lv_rc.
        WHEN 0.
          gv_sent = gv_sent + 1.
          EXIT.
        WHEN 3.
*         keine freien Dialogprozesse - warten und erneut versuchen
          WAIT UNTIL gv_done >= gv_sent UP TO 5 SECONDS.
        WHEN OTHERS.
          lv_text = |Werk { <ls_grp>-iwerk }: RFC-Fehler { lv_rc }|.
          PERFORM log_add USING 'E' lv_text.
          EXIT.
      ENDCASE.
    ENDDO.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form RECEIVE_RESULT
*&---------------------------------------------------------------------*
* Rückruf bei Ende eines aRFC-Pakets
*----------------------------------------------------------------------*
FORM receive_result USING pv_task TYPE clike.
  DATA: lt_res  TYPE zpm_t_mplan_result,
        lv_text TYPE string.

  RECEIVE RESULTS FROM FUNCTION 'Z_PM_MPLAN_CALC'
    IMPORTING
      et_result             = lt_res
    EXCEPTIONS
      communication_failure = 1
      system_failure        = 2.
  gv_done = gv_done + 1.
  IF sy-subrc <> 0.
    lv_text = |Paket { pv_task } abgebrochen|.
    PERFORM log_add USING 'E' lv_text.
    RETURN.
  ENDIF.
  APPEND LINES OF lt_res TO gt_result.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LOG_ADD
*&---------------------------------------------------------------------*
FORM log_add USING pv_type TYPE symsgty
                   pv_text TYPE csequence.
  CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
    EXPORTING
      i_log_handle = gv_log
      i_msgty      = pv_type
      i_text       = pv_text
    EXCEPTIONS
      OTHERS       = 1.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPLAY
*&---------------------------------------------------------------------*
FORM display.
  DATA lo_alv TYPE REF TO cl_salv_table.

  TRY.
      cl_salv_table=>factory(
        IMPORTING
          r_salv_table = lo_alv
        CHANGING
          t_table      = gt_result ).
      lo_alv->get_functions( )->set_all( abap_true ).
      lo_alv->display( ).
    CATCH cx_salv_msg INTO DATA(lx_salv).
      MESSAGE lx_salv TYPE 'I' DISPLAY LIKE 'E'.
  ENDTRY.
ENDFORM.
