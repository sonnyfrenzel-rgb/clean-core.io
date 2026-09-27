*&---------------------------------------------------------------------*
*&  Include           ZHR_UEBERSTUNDEN_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  CATS_LESEN
*&---------------------------------------------------------------------*
*       genehmigte Zeiten der Periode je Mitarbeiter und Art verdichten
*----------------------------------------------------------------------*
FORM cats_lesen.
  SELECT pernr awart SUM( catshours )
    FROM catsdb
    INTO TABLE gt_summe
    WHERE pernr    IN s_pernr
      AND awart    IN s_awart
      AND status   =  gc_status_genehmigt
      AND workdate BETWEEN gv_begda AND gv_endda
    GROUP BY pernr awart.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  MITARBEITER_UEBERTRAGEN
*&---------------------------------------------------------------------*
FORM mitarbeiter_uebertragen USING ps_summe TYPE ty_summe.
  DATA: lo_regel   TYPE REF TO lcl_regel,
        lv_anzhl   TYPE ptm_quonum,
        lv_da      TYPE abap_bool,
        ls_p2010   TYPE p2010,
        ls_ret     TYPE bapireturn1,
        ls_uebertr TYPE zhr_ot_uebertr,
        lv_text    TYPE char80.

* schon uebertragen? (Job lief frueher doppelt, siehe Ticket 20190412)
  SELECT SINGLE @abap_true FROM zhr_ot_uebertr
    WHERE pernr  = @ps_summe-pernr
      AND awart  = @ps_summe-awart
      AND period = @p_per
    INTO @lv_da.
  IF sy-subrc = 0.
    PERFORM protokoll USING ps_summe 'W' 'bereits uebertragen'.
    RETURN.
  ENDIF.

  TRY.
      lo_regel = lcl_regel=>fabrik( iv_pernr = ps_summe-pernr
                                    iv_datum = gv_endda ).
    CATCH lcx_keine_orgzuordnung.
      PERFORM protokoll USING ps_summe 'E' 'keine Org-Zuordnung zum Periodenende'.
      RETURN.
    CATCH lcx_regel.
      PERFORM protokoll USING ps_summe 'E' 'keine gueltige Mehrarbeitsregel'.
      RETURN.
  ENDTRY.

  IF lo_regel->pruefen( ps_summe-stunden ) = abap_false.
    PERFORM protokoll USING ps_summe 'W' 'nicht verguetungsfaehig'.
    RETURN.
  ENDIF.

  lv_anzhl = lo_regel->umrechnen( ps_summe-stunden ).

  IF p_test = 'X'.
    WRITE lv_anzhl TO lv_text LEFT-JUSTIFIED.
    CONCATENATE 'Testlauf: Anzahl' lv_text INTO lv_text SEPARATED BY space.
    PERFORM protokoll USING ps_summe 'I' lv_text.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_EMPLOYEE_ENQUEUE'
    EXPORTING
      number = ps_summe-pernr
    IMPORTING
      return = ls_ret.
  IF ls_ret-type = 'E'.
    PERFORM protokoll USING ps_summe 'E' ls_ret-message.
    RETURN.
  ENDIF.

  ls_p2010-pernr = ps_summe-pernr.
  ls_p2010-infty = gc_infty_2010.
  ls_p2010-begda = gv_endda.
  ls_p2010-endda = gv_endda.
  ls_p2010-lgart = lo_regel->lohnart( ).
  ls_p2010-anzhl = lv_anzhl.

  CALL FUNCTION 'HR_INFOTYPE_OPERATION'
    EXPORTING
      infty         = gc_infty_2010
      number        = ps_summe-pernr
      subtype       = ls_p2010-lgart
      validityend   = gv_endda
      validitybegin = gv_endda
      record        = ls_p2010
      operation     = 'INS'
      nocommit      = 'X'
    IMPORTING
      return        = ls_ret.
  IF ls_ret-type CA 'EA'.
    ROLLBACK WORK.
    PERFORM protokoll USING ps_summe 'E' ls_ret-message.
  ELSE.
    ls_uebertr-pernr  = ps_summe-pernr.
    ls_uebertr-awart  = ps_summe-awart.
    ls_uebertr-period = p_per.
    ls_uebertr-anzhl  = lv_anzhl.
    ls_uebertr-uname  = sy-uname.
    ls_uebertr-datum  = sy-datum.
    INSERT zhr_ot_uebertr FROM ls_uebertr.
    COMMIT WORK.
    PERFORM protokoll USING ps_summe 'S' 'als Entgeltbeleg uebertragen'.
  ENDIF.

  CALL FUNCTION 'BAPI_EMPLOYEE_DEQUEUE'
    EXPORTING
      number = ps_summe-pernr.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL
*&---------------------------------------------------------------------*
FORM protokoll USING ps_summe TYPE ty_summe
                     pv_typ   TYPE symsgty
                     pv_text  TYPE any.
  DATA ls_prot TYPE ty_prot.

  ls_prot-pernr = ps_summe-pernr.
  ls_prot-awart = ps_summe-awart.
  ls_prot-typ   = pv_typ.
  ls_prot-text  = pv_text.
  APPEND ls_prot TO gt_prot.

  IF pv_typ = 'E'.
    ADD 1 TO gv_fehler.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGEBEN
*&---------------------------------------------------------------------*
FORM ausgeben.
  DATA: lt_fcat TYPE slis_t_fieldcat_alv.

  CALL FUNCTION 'REUSE_ALV_FIELDCATALOG_MERGE'
    EXPORTING
      i_program_name     = sy-repid
      i_internal_tabname = 'GT_PROT'
      i_inclname         = 'ZHR_UEBERSTUNDEN_TOP'
    CHANGING
      ct_fieldcat        = lt_fcat
    EXCEPTIONS
      OTHERS             = 1.

  SORT gt_prot BY typ pernr.
  CALL FUNCTION 'REUSE_ALV_LIST_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      it_fieldcat        = lt_fcat
    TABLES
      t_outtab           = gt_prot
    EXCEPTIONS
      OTHERS             = 1.
ENDFORM.

*&---------------------------------------------------------------------*
*& alte Umrechnung vor Umbau auf Regelklassen (2014) - nicht mehr
*& gerufen, bleibt zur Nachvollziehbarkeit alter Abrechnungen stehen
*&---------------------------------------------------------------------*
*FORM umrechnen_alt USING    ps_summe TYPE ty_summe
*                            pv_persk TYPE persk
*                   CHANGING cv_anzhl TYPE ptm_quonum.
*  CASE pv_persk.
*    WHEN 'DT' OR 'DG'.            "Tarif gewerblich / Angestellte
*      cv_anzhl = ps_summe-stunden * '1.25'.
*    WHEN 'DA'.                    "AT
*      IF ps_summe-stunden > 10.
*        cv_anzhl = ps_summe-stunden - 10.
*      ELSE.
*        CLEAR cv_anzhl.
*      ENDIF.
*    WHEN OTHERS.
*      CLEAR cv_anzhl.
*  ENDCASE.
*ENDFORM.
