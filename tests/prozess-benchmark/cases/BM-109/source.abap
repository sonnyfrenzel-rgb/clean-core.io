REPORT zehs_sdb_erstversand.
*----------------------------------------------------------------------*
* EHS: Sicherheitsdatenblatt-Erstversand
* Warenausgebuchte Lieferungen mit Gefahrstoffen an Kunden, die das
* SDB zum Stoff noch nicht erhalten haben -> Versandjob einplanen
* 2012-08 PBE  Erstellung
* 2014-03 PBE  Versand als Hintergrundjob ZEHS_SDB_VERSAND
*----------------------------------------------------------------------*
TABLES likp.
SELECT-OPTIONS s_wadat FOR likp-wadat_ist.
PARAMETERS p_vers AS CHECKBOX.

TYPES: BEGIN OF ty_pos,
         vbeln TYPE likp-vbeln,
         kunnr TYPE likp-kunnr,
         matnr TYPE lips-matnr,
       END OF ty_pos,
       BEGIN OF ty_link,
         matnr TYPE estmj-matnr,
         subid TYPE estrh-subid,
       END OF ty_link.

DATA: gt_pos      TYPE STANDARD TABLE OF ty_pos,
      gs_pos      TYPE ty_pos,
      gt_link     TYPE STANDARD TABLE OF ty_link,
      gs_link     TYPE ty_link,
      gt_log      TYPE SORTED TABLE OF zehs_sdb_log WITH UNIQUE KEY kunnr subid,
      gt_todo     TYPE STANDARD TABLE OF zehs_sdb_log,
      gs_todo     TYPE zehs_sdb_log,
      gv_jobname  TYPE tbtcjob-jobname VALUE 'ZEHS_SDB_VERSAND',
      gv_jobcount TYPE tbtcjob-jobcount.

START-OF-SELECTION.
  SELECT k~vbeln k~kunnr p~matnr INTO TABLE gt_pos
    FROM likp AS k
    INNER JOIN lips AS p ON p~vbeln = k~vbeln
    INNER JOIN vbuk AS u ON u~vbeln = k~vbeln
    WHERE k~wadat_ist IN s_wadat
      AND u~wbstk = 'C'.
  SORT gt_pos BY kunnr matnr.
  DELETE ADJACENT DUPLICATES FROM gt_pos COMPARING kunnr matnr.
  IF gt_pos IS INITIAL.
    RETURN.
  ENDIF.

* Material -> reale Stoffe (Spezifikation)
  SELECT m~matnr h~subid INTO TABLE gt_link
    FROM estmj AS m
    INNER JOIN estrh AS h ON h~recnroot = m~recnroot
    FOR ALL ENTRIES IN gt_pos
    WHERE m~matnr = gt_pos-matnr
      AND h~subcat = 'REAL_SUB'.
  IF gt_link IS NOT INITIAL.
    SELECT * FROM zehs_sdb_log INTO TABLE gt_log
      FOR ALL ENTRIES IN gt_link
      WHERE subid = gt_link-subid.
  ENDIF.

  LOOP AT gt_pos INTO gs_pos.
    READ TABLE gt_link INTO gs_link WITH KEY matnr = gs_pos-matnr.
    IF sy-subrc <> 0.
      CONTINUE.                           "kein Gefahrstoff
    ENDIF.
    READ TABLE gt_log WITH TABLE KEY kunnr = gs_pos-kunnr
                                     subid = gs_link-subid
         TRANSPORTING NO FIELDS.
    IF sy-subrc = 0.
      CONTINUE.                           "SDB schon versandt
    ENDIF.
    gs_todo-kunnr = gs_pos-kunnr.
    gs_todo-subid = gs_link-subid.
    gs_todo-vbeln = gs_pos-vbeln.
    APPEND gs_todo TO gt_todo.
    WRITE: / gs_pos-kunnr, gs_link-subid, gs_pos-vbeln, 'SDB fällig'.
  ENDLOOP.

  IF p_vers IS INITIAL OR gt_todo IS INITIAL.
    RETURN.
  ENDIF.

  CALL FUNCTION 'JOB_OPEN'
    EXPORTING
      jobname  = gv_jobname
    IMPORTING
      jobcount = gv_jobcount
    EXCEPTIONS
      OTHERS   = 1.
  EXPORT todo = gt_todo TO DATABASE indx(zs) ID gv_jobcount.
  SUBMIT zehs_sdb_versand WITH p_memid = gv_jobcount
         VIA JOB gv_jobname NUMBER gv_jobcount
         AND RETURN.
  CALL FUNCTION 'JOB_CLOSE'
    EXPORTING
      jobcount  = gv_jobcount
      jobname   = gv_jobname
      strtimmed = 'X'
    EXCEPTIONS
      OTHERS    = 1.

*----------------------------------------------------------------------*
* Protokoll - früher direkt hier, jetzt im Versandjob
*----------------------------------------------------------------------*
FORM log_schreiben.
  INSERT zehs_sdb_log FROM TABLE gt_todo ACCEPTING DUPLICATE KEYS.
  COMMIT WORK.
ENDFORM.
