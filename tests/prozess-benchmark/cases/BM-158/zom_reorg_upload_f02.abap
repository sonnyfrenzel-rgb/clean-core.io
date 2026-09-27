*&---------------------------------------------------------------------*
*& Include ZOM_REORG_UPLOAD_F02  - Aktionen (dynamisch: ACT_<Aktion>)
*&---------------------------------------------------------------------*

FORM act_newo USING is_line TYPE ty_line
              CHANGING cv_ok TYPE abap_bool.
  DATA lv_new TYPE hrobjid.

  CALL FUNCTION 'RH_OBJECT_CREATE'
    EXPORTING
      plvar     = gc_plvar
      otype     = 'O'
      short     = is_line-short
      stext     = is_line-stext
      begda     = p_begda
      endda     = gc_endda
      vtask     = 'V'
    IMPORTING
      objid     = lv_new
    EXCEPTIONS
      text_required = 1
      invalid_otype = 2
      OTHERS        = 3.
  IF sy-subrc <> 0.
    PERFORM prot_add USING is_line-lineno 'E' 'Org.-Einheit nicht angelegt'.
    RETURN.
  ENDIF.

* neue Einheit berichtet an die uebergeordnete (A002)
  CALL FUNCTION 'RH_RELATION_MAINTAIN'
    EXPORTING
      act_fcode           = 'INSE'
      act_plvar           = gc_plvar
      act_otype           = 'O'
      act_objid           = lv_new
      act_rsign           = 'A'
      act_relat           = '002'
      act_sclas           = 'O'
      act_sobid           = is_line-parent
      act_begda           = p_begda
      act_endda           = gc_endda
      act_vtask           = 'V'
    EXCEPTIONS
      maintainance_failed = 1
      OTHERS              = 2.
  cv_ok = xsdbool( sy-subrc = 0 ).
ENDFORM.

*----------------------------------------------------------------------*
FORM act_movs USING is_line TYPE ty_line
              CHANGING cv_ok TYPE abap_bool.
  DATA: ls_old     TYPE p1001,
        lt_old     TYPE STANDARD TABLE OF p1001,
        lt_holders TYPE STANDARD TABLE OF hrp1001,
        lv_pernr   TYPE pernr_d,
        lv_pa_ok   TYPE abap_bool.

* bisherige Zuordnung Planstelle -> Org.-Einheit (A003) abgrenzen
  SELECT SINGLE * FROM hrp1001 INTO CORRESPONDING FIELDS OF ls_old
    WHERE plvar = gc_plvar AND otype = 'S' AND objid = is_line-objid
      AND rsign = 'A' AND relat = '003'
      AND begda <= p_begda AND endda >= p_begda.
  IF sy-subrc = 0.
    APPEND ls_old TO lt_old.
    CALL FUNCTION 'RH_CUT_INFTY'
      EXPORTING
        gdate        = p_begda - 1
        vtask        = 'V'
      TABLES
        innnn        = lt_old
      EXCEPTIONS
        error_during_cut = 1
        OTHERS           = 2.
    IF sy-subrc <> 0.
      PERFORM prot_add USING is_line-lineno 'E' 'Alte Zuordnung nicht abgegrenzt'.
      RETURN.
    ENDIF.
  ENDIF.

  CALL FUNCTION 'RH_RELATION_MAINTAIN'
    EXPORTING
      act_fcode           = 'INSE'
      act_plvar           = gc_plvar
      act_otype           = 'S'
      act_objid           = is_line-objid
      act_rsign           = 'A'
      act_relat           = '003'
      act_sclas           = 'O'
      act_sobid           = is_line-parent
      act_begda           = p_begda
      act_endda           = gc_endda
      act_vtask           = 'V'
    EXCEPTIONS
      maintainance_failed = 1
      OTHERS              = 2.
  IF sy-subrc <> 0.
    PERFORM prot_add USING is_line-lineno 'E' 'Neue Zuordnung fehlgeschlagen'.
    RETURN.
  ENDIF.
  cv_ok = abap_true.

* Inhaber der Planstelle (A008 -> P): Massnahme im Personalstamm
  SELECT * FROM hrp1001 INTO TABLE lt_holders
    WHERE plvar = gc_plvar AND otype = 'S' AND objid = is_line-objid
      AND rsign = 'A' AND relat = '008' AND sclas = 'P'
      AND begda <= p_begda AND endda >= p_begda.
  LOOP AT lt_holders INTO DATA(ls_holder).
    lv_pernr = ls_holder-sobid.
    PERFORM pa_org_reassign USING lv_pernr is_line-objid
                            CHANGING lv_pa_ok.
    IF lv_pa_ok = abap_false.
*     OM-Aenderung bleibt trotzdem, Personalstamm manuell nachziehen
      PERFORM prot_add USING is_line-lineno 'W'
                             |Massnahme PA40 fuer { lv_pernr } fehlgeschlagen|.
    ENDIF.
  ENDLOOP.
ENDFORM.

*----------------------------------------------------------------------*
FORM act_rena USING is_line TYPE ty_line
              CHANGING cv_ok TYPE abap_bool.
  DATA: ls_1000 TYPE p1000,
        lt_1000 TYPE STANDARD TABLE OF p1000.

  SELECT SINGLE * FROM hrp1000 INTO CORRESPONDING FIELDS OF ls_1000
    WHERE plvar = gc_plvar AND otype = 'O' AND objid = is_line-objid
      AND begda <= p_begda AND endda >= p_begda
      AND langu = sy-langu.
  IF sy-subrc <> 0.
    RETURN.
  ENDIF.
  ls_1000-short = is_line-short.
  ls_1000-stext = is_line-stext.
  APPEND ls_1000 TO lt_1000.
  CALL FUNCTION 'RH_UPDATE_INFTY'
    EXPORTING
      vtask     = 'V'
    TABLES
      innnn     = lt_1000
    EXCEPTIONS
      error_during_update = 1
      OTHERS              = 2.
  cv_ok = xsdbool( sy-subrc = 0 ).
ENDFORM.

*----------------------------------------------------------------------*
FORM act_delo USING is_line TYPE ty_line
              CHANGING cv_ok TYPE abap_bool.
  DATA: lv_sub  TYPE i,
        ls_1000 TYPE p1000,
        lt_1000 TYPE STANDARD TABLE OF p1000.

* nur leere Einheiten: keine untergeordneten Einheiten/Planstellen
  SELECT COUNT(*) FROM hrp1001 INTO lv_sub
    WHERE plvar = gc_plvar AND otype = 'O' AND objid = is_line-objid
      AND rsign = 'B' AND relat IN ('002', '003')
      AND endda >= p_begda.
  IF lv_sub > 0.
    PERFORM prot_add USING is_line-lineno 'E' 'Einheit nicht leer'.
    RETURN.
  ENDIF.

  SELECT SINGLE * FROM hrp1000 INTO CORRESPONDING FIELDS OF ls_1000
    WHERE plvar = gc_plvar AND otype = 'O' AND objid = is_line-objid
      AND begda <= p_begda AND endda >= p_begda.
  APPEND ls_1000 TO lt_1000.
  CALL FUNCTION 'RH_CUT_INFTY'
    EXPORTING
      gdate        = p_begda - 1
      vtask        = 'V'
    TABLES
      innnn        = lt_1000
    EXCEPTIONS
      error_during_cut = 1
      OTHERS           = 2.
  cv_ok = xsdbool( sy-subrc = 0 ).
ENDFORM.
