FUNCTION z_wf_bank_approver_rule.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  TABLES
*"      ACTOR_TAB STRUCTURE  SWHACTOR
*"      AC_CONTAINER STRUCTURE  SWCONT
*"  EXCEPTIONS
*"      NOBODY_FOUND
*"----------------------------------------------------------------------
* Agentenregel 90000031: Freigeber Bankverbindung
* 1. feste Freigeber je Buchungskreis (ZWF_BANK_APPR), ohne Antragsteller
* 2. sonst Leiter der Organisationseinheit des Antragstellers
*----------------------------------------------------------------------
  DATA: ls_cont      TYPE swcont,
        lv_bukrs     TYPE bukrs,
        lv_requester TYPE syuname,
        lt_appr      TYPE STANDARD TABLE OF zwf_bank_appr,
        ls_appr      TYPE zwf_bank_appr,
        ls_actor     TYPE swhactor,
        lv_pernr     TYPE persno,
        lv_ltype     TYPE otype,
        lv_lid       TYPE realo.

  READ TABLE ac_container INTO ls_cont WITH KEY element = 'BUKRS'.
  lv_bukrs = ls_cont-value.
  READ TABLE ac_container INTO ls_cont WITH KEY element = 'REQUESTER'.
  lv_requester = ls_cont-value.

  SELECT * FROM zwf_bank_appr INTO TABLE lt_appr
    WHERE bukrs      = lv_bukrs
      AND valid_from <= sy-datum
      AND valid_to   >= sy-datum.
  LOOP AT lt_appr INTO ls_appr.
    CHECK ls_appr-uname <> lv_requester.       "Vier-Augen-Prinzip
    ls_actor-otype = 'US'.
    ls_actor-objid = ls_appr-uname.
    APPEND ls_actor TO actor_tab.
  ENDLOOP.
  IF actor_tab[] IS NOT INITIAL.
    RETURN.
  ENDIF.

* Fallback über HR-Organisationsmanagement
  SELECT SINGLE pernr FROM pa0105 INTO lv_pernr
    WHERE usrty = '0001'
      AND usrid = lv_requester
      AND begda <= sy-datum
      AND endda >= sy-datum.
  IF sy-subrc <> 0.
    RAISE nobody_found.
  ENDIF.

  CALL FUNCTION 'RH_GET_LEADER'
    EXPORTING
      plvar             = '01'
      keydate           = sy-datum
      otype             = 'P'
      objid             = lv_pernr
    IMPORTING
      leader_type       = lv_ltype
      leader_id         = lv_lid
    EXCEPTIONS
      no_leader_found   = 1
      no_leader_defined = 2
      OTHERS            = 3.
  IF sy-subrc <> 0.
    RAISE nobody_found.
  ENDIF.
  ls_actor-otype = lv_ltype.
  ls_actor-objid = lv_lid.
  APPEND ls_actor TO actor_tab.
ENDFUNCTION.
