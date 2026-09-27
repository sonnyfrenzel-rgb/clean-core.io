CLASS zcl_mss_team_reader DEFINITION PUBLIC FINAL CREATE PUBLIC.
************************************************************************
* Liest die direkt unterstellten Mitarbeiter einer Fuehrungskraft
* (Auswertungsweg ZMSS_DIR: P-S-O-S-P ueber Leiterplanstelle A012)
* und deren Abwesenheiten (IT2001) im Zeitraum.
* Doppelte Berechtigungspruefung P_ORGIN, weil das Portal ueber einen
* Systembenutzer mit weiten Rechten ruft (Befund Revision 2015).
************************************************************************
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_member,
             pernr TYPE pernr_d,
             orgeh TYPE orgeh,
           END OF ty_member,
           tt_member TYPE STANDARD TABLE OF ty_member WITH DEFAULT KEY.

    DATA mv_hidden TYPE i READ-ONLY.

    METHODS constructor
      IMPORTING iv_manager TYPE pernr_d
                iv_begda   TYPE begda
                iv_endda   TYPE endda.
    METHODS read_team
      RAISING zcx_mss_no_org.
    METHODS build_absence_overview
      RETURNING VALUE(rt_team) TYPE zmss_t_team_abs.

  PRIVATE SECTION.
    DATA: mv_manager TYPE pernr_d,
          mv_begda   TYPE begda,
          mv_endda   TYPE endda,
          mt_member  TYPE tt_member.

    METHODS is_authorized
      IMPORTING is_p0001       TYPE p0001
      RETURNING VALUE(rv_ok)   TYPE abap_bool.
ENDCLASS.


CLASS zcl_mss_team_reader IMPLEMENTATION.

  METHOD constructor.
    mv_manager = iv_manager.
    mv_begda   = iv_begda.
    mv_endda   = iv_endda.
  ENDMETHOD.


  METHOD read_team.
    DATA lt_result TYPE STANDARD TABLE OF swhactor.

    TRY.
        CALL FUNCTION 'RH_STRUC_GET'
          EXPORTING
            act_otype      = 'P'
            act_objid      = mv_manager
            act_wegid      = 'ZMSS_DIR'
            act_begda      = mv_begda
            act_endda      = mv_endda
          TABLES
            result_tab     = lt_result
          EXCEPTIONS
            no_plvar_found = 1
            no_entry_found = 2
            OTHERS         = 3.
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE zcx_mss_no_org.
        ENDIF.

*       nur Personen, die Fuehrungskraft selbst ausschliessen
        mt_member = VALUE #( FOR r IN lt_result
                             WHERE ( otype = 'P' AND objid <> mv_manager )
                             ( pernr = r-objid ) ).
        IF mt_member IS INITIAL.
          RAISE EXCEPTION TYPE zcx_mss_no_org.
        ENDIF.
      CLEANUP.
        CLEAR mt_member.
    ENDTRY.
  ENDMETHOD.


  METHOD build_absence_overview.
    DATA: lt_p0001 TYPE STANDARD TABLE OF p0001,
          lt_p2001 TYPE STANDARD TABLE OF p2001,
          ls_p0001 TYPE p0001,
          ls_line  LIKE LINE OF rt_team.

    LOOP AT mt_member ASSIGNING FIELD-SYMBOL(<ls_member>).
      CALL FUNCTION 'HR_READ_INFOTYPE'
        EXPORTING
          pernr           = <ls_member>-pernr
          infty           = '0001'
          begda           = mv_endda
          endda           = mv_endda
        TABLES
          infty_tab       = lt_p0001
        EXCEPTIONS
          infty_not_found = 1
          OTHERS          = 2.
      IF sy-subrc <> 0 OR lt_p0001 IS INITIAL.
        CONTINUE.
      ENDIF.
      READ TABLE lt_p0001 INTO ls_p0001 INDEX 1.

      IF is_authorized( ls_p0001 ) = abap_false.
        mv_hidden = mv_hidden + 1.
        CONTINUE.
      ENDIF.

      CLEAR lt_p2001.
      CALL FUNCTION 'HR_READ_INFOTYPE'
        EXPORTING
          pernr           = <ls_member>-pernr
          infty           = '2001'
          begda           = mv_begda
          endda           = mv_endda
        TABLES
          infty_tab       = lt_p2001
        EXCEPTIONS
          infty_not_found = 1
          OTHERS          = 2.

      CLEAR ls_line.
      ls_line-pernr = <ls_member>-pernr.
      ls_line-orgeh = ls_p0001-orgeh.
      ls_line-days  = REDUCE #( INIT d = 0
                                FOR a IN lt_p2001
                                NEXT d = d + a-abwtg ).
      ls_line-level = SWITCH #( ls_line-days
                                WHEN 0 THEN 'FREI'
                                ELSE COND #( WHEN ls_line-days > 10
                                             THEN 'HOCH'
                                             ELSE 'NORMAL' ) ).
      APPEND ls_line TO rt_team.
    ENDLOOP.

    SORT rt_team BY days DESCENDING.
  ENDMETHOD.


  METHOD is_authorized.
*   Abwesenheiten (2001) lesen, auf Ebene der Organisationszuordnung
    AUTHORITY-CHECK OBJECT 'P_ORGIN'
      ID 'INFTY' FIELD '2001'
      ID 'SUBTY' DUMMY
      ID 'AUTHC' FIELD 'R'
      ID 'PERSA' FIELD is_p0001-werks
      ID 'PERSG' FIELD is_p0001-persg
      ID 'PERSK' FIELD is_p0001-persk
      ID 'VDSK1' FIELD is_p0001-vdsk1.
    rv_ok = xsdbool( sy-subrc = 0 ).
  ENDMETHOD.

ENDCLASS.
