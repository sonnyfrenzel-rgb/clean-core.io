REPORT zom_span_of_control.
************************************************************************
* Fuehrungsspanne: Personen je Organisationseinheit, rekursiv ab einer
* Wurzeleinheit ueber die Linienbeziehung B002 (O -> untergeordnete O).
* Personen je Einheit ueber Auswertungsweg O-S-P (nur direkt).
* 2012-06 OM-Team  Anlage
* 2021-03 OM-Team  Tiefenbegrenzung wg. Zyklus in Testmandant
************************************************************************
PARAMETERS: p_root TYPE hrobjid OBLIGATORY,
            p_date TYPE sy-datum DEFAULT sy-datum,
            p_maxd TYPE i DEFAULT 8.

TYPES: BEGIN OF ty_out,
         objid   TYPE hrobjid,
         depth   TYPE i,
         persons TYPE i,
       END OF ty_out.

DATA: gt_out      TYPE STANDARD TABLE OF ty_out,
      gv_too_deep TYPE abap_bool.

START-OF-SELECTION.
  PERFORM walk USING p_root 1.

  IF gv_too_deep = abap_true.
    MESSAGE i398(00) WITH 'Hierarchie tiefer als' p_maxd 'Ebenen,'
                          'Teilbaeume abgeschnitten'.
  ENDIF.

  TRY.
      cl_salv_table=>factory( IMPORTING r_salv_table = DATA(lo_alv)
                              CHANGING  t_table      = gt_out ).
      lo_alv->display( ).
    CATCH cx_salv_msg INTO DATA(lx_salv).
      MESSAGE lx_salv TYPE 'E'.
  ENDTRY.

*----------------------------------------------------------------------*
FORM walk USING pv_objid TYPE hrobjid
                pv_depth TYPE i.
  DATA: lt_result TYPE STANDARD TABLE OF swhactor,
        lt_sub    TYPE STANDARD TABLE OF hrp1001,
        ls_sub    TYPE hrp1001,
        ls_out    TYPE ty_out,
        lv_child  TYPE hrobjid,
        lv_next   TYPE i.

  IF pv_depth > p_maxd.
    gv_too_deep = abap_true.
    RETURN.
  ENDIF.

  CALL FUNCTION 'RH_STRUC_GET'
    EXPORTING
      act_otype      = 'O'
      act_objid      = pv_objid
      act_wegid      = 'O-S-P'
      act_begda      = p_date
      act_endda      = p_date
    TABLES
      result_tab     = lt_result
    EXCEPTIONS
      no_plvar_found = 1
      no_entry_found = 2
      OTHERS         = 3.
  IF sy-subrc = 0.
    ls_out-persons = REDUCE i( INIT n = 0
                               FOR r IN lt_result WHERE ( otype = 'P' )
                               NEXT n = n + 1 ).
  ENDIF.
  ls_out-objid = pv_objid.
  ls_out-depth = pv_depth.
  APPEND ls_out TO gt_out.

  SELECT * FROM hrp1001 INTO TABLE lt_sub
    WHERE plvar = '01'
      AND otype = 'O'
      AND objid = pv_objid
      AND rsign = 'B'
      AND relat = '002'
      AND sclas = 'O'
      AND begda <= p_date
      AND endda >= p_date.
  LOOP AT lt_sub INTO ls_sub.
    lv_child = ls_sub-sobid.
    lv_next  = pv_depth + 1.
    PERFORM walk USING lv_child lv_next.
  ENDLOOP.
ENDFORM.
