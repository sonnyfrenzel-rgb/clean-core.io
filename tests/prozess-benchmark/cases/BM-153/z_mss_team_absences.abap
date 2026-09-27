FUNCTION z_mss_team_absences.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (RFC, gerufen vom MSS-Teamkalender im Portal)
*"  IMPORTING
*"     VALUE(IV_UNAME) TYPE  SYUNAME DEFAULT SY-UNAME
*"     VALUE(IV_BEGDA) TYPE  BEGDA
*"     VALUE(IV_ENDDA) TYPE  ENDDA
*"  EXPORTING
*"     VALUE(ET_TEAM)  TYPE  ZMSS_T_TEAM_ABS
*"     VALUE(EV_HIDDEN) TYPE  I
*"  EXCEPTIONS
*"     NO_EMPLOYEE
*"     NOT_A_MANAGER
*"     NO_PROXY_AUTHORITY
*"----------------------------------------------------------------------
* 2011-09 HR-IT  Anlage fuer MSS-Teamkalender (Ersatz Standard-iView)
* 2016-03 HR-IT  Vertretung: Aufruf fuer fremden Benutzer mit Z_MSS_PRX
* 2022-01 HR-IT  Klasse ZCL_MSS_TEAM_READER ausgelagert
  DATA: lv_mgr_pernr TYPE pernr_d,
        lo_reader    TYPE REF TO zcl_mss_team_reader,
        lx_org       TYPE REF TO zcx_mss_no_org.

* Vertretungsregel: fremder Benutzer nur mit Proxy-Berechtigung
  IF iv_uname <> sy-uname.
    AUTHORITY-CHECK OBJECT 'Z_MSS_PRX'
      ID 'ACTVT' FIELD '03'.
    IF sy-subrc <> 0.
      RAISE no_proxy_authority.
    ENDIF.
  ENDIF.

* Mitarbeiter zum Benutzer (Kommunikation, Subtyp 0001 Systembenutzer)
  SELECT SINGLE pernr FROM pa0105 INTO lv_mgr_pernr
    WHERE usrty = '0001'
      AND usrid = iv_uname
      AND begda <= iv_endda
      AND endda >= iv_begda.
  IF sy-subrc <> 0.
    MESSAGE e020(zmss) WITH iv_uname RAISING no_employee.
  ENDIF.

  lo_reader = NEW zcl_mss_team_reader( iv_manager = lv_mgr_pernr
                                       iv_begda   = iv_begda
                                       iv_endda   = iv_endda ).
  TRY.
      lo_reader->read_team( ).
    CATCH zcx_mss_no_org INTO lx_org.
      MESSAGE lx_org TYPE 'E' RAISING not_a_manager.
  ENDTRY.

  et_team   = lo_reader->build_absence_overview( ).
  ev_hidden = lo_reader->mv_hidden.

ENDFUNCTION.
