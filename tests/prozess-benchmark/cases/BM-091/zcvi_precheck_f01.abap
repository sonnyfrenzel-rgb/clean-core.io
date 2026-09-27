*----------------------------------------------------------------------*
***INCLUDE ZCVI_PRECHECK_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form CHECK_COUNTRY - Land, PLZ-Länge, USt-Id
*&---------------------------------------------------------------------*
FORM check_country USING ps_kna1 TYPE ty_kna1.
  DATA lv_len TYPE i.

  SELECT SINGLE lnplz, xegld
    FROM t005
    WHERE land1 = @ps_kna1-land1
    INTO @DATA(ls_t005).
  IF sy-subrc <> 0.
    PERFORM add_issue USING ps_kna1-kunnr 'E' 'Länderschlüssel unbekannt'.
    RETURN.
  ENDIF.

  lv_len = strlen( ps_kna1-pstlz ).
  IF ls_t005-lnplz > 0 AND lv_len <> ls_t005-lnplz.
    PERFORM add_issue USING ps_kna1-kunnr 'E' 'Postleitzahl hat falsche Länge'.
  ENDIF.

* USt-Id nur in EU-Ländern Pflicht (Änderung 2019-07)
  IF ls_t005-xegld = 'X' AND ps_kna1-stceg IS INITIAL.
    PERFORM add_issue USING ps_kna1-kunnr 'W' 'USt-Id fehlt (EU)'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form CHECK_ADDRESS - ohne ZAV-Adresse bricht die CVI-Synchronisation ab
*&---------------------------------------------------------------------*
FORM check_address USING ps_kna1 TYPE ty_kna1.
  DATA lv_addrnumber TYPE adrc-addrnumber.

  SELECT SINGLE addrnumber FROM adrc INTO lv_addrnumber
    WHERE addrnumber = ps_kna1-adrnr.
  IF sy-subrc <> 0.
    PERFORM add_issue USING ps_kna1-kunnr 'E' 'Keine ZAV-Adresse (ADRC)'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form CHECK_ACTIVITY - letzter Verkaufsbeleg älter als Grenze?
*&---------------------------------------------------------------------*
FORM check_activity USING ps_kna1 TYPE ty_kna1.
  DATA lv_last TYPE vbak-erdat.

  SELECT MAX( erdat ) FROM vbak INTO lv_last
    WHERE kunnr = ps_kna1-kunnr.
* Kunden ohne jeden Verkaufsbeleg gelten ebenfalls als inaktiv
  IF lv_last < gv_limit.
    PERFORM add_issue USING ps_kna1-kunnr 'I' 'Kein Verkaufsbeleg im Zeitraum'.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ADD_ISSUE
*&---------------------------------------------------------------------*
FORM add_issue USING pv_kunnr TYPE kna1-kunnr
                     pv_cat   TYPE c
                     pv_text  TYPE c.
  DATA ls_issue TYPE ty_issue.
  ls_issue-kunnr = pv_kunnr.
  ls_issue-cat   = pv_cat.
  ls_issue-text  = pv_text.
  APPEND ls_issue TO gt_issue.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form APPLY_FIXES - inaktive Kunden zum Löschen vormerken
*&---------------------------------------------------------------------*
FORM apply_fixes.
  DATA ls_issue TYPE ty_issue.

  LOOP AT gt_issue INTO ls_issue WHERE cat = 'I'.
*   direkt auf KNA1 - Transaktion XD06 zu langsam für 40.000 Kunden
    UPDATE kna1 SET loevm = 'X'
                    aedat = sy-datum
                    usnam = sy-uname
      WHERE kunnr = ls_issue-kunnr.
  ENDLOOP.
  COMMIT WORK.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form DISPLAY_ALV
*&---------------------------------------------------------------------*
FORM display_alv.
  DATA: lo_alv TYPE REF TO cl_salv_table,
        lx_msg TYPE REF TO cx_salv_msg.

  TRY.
      CALL METHOD cl_salv_table=>factory
        IMPORTING
          r_salv_table = lo_alv
        CHANGING
          t_table      = gt_issue.
    CATCH cx_salv_msg INTO lx_msg.
      MESSAGE lx_msg TYPE 'E'.
  ENDTRY.
  lo_alv->get_functions( )->set_all( abap_true ).
  lo_alv->display( ).
ENDFORM.
