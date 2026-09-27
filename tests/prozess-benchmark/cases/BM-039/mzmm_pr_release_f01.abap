*&---------------------------------------------------------------------*
*& Include MZMM_PR_RELEASE_F01 - Unterprogramme
*&---------------------------------------------------------------------*

FORM codes_lesen.
* Freigabecodes des Benutzers (je Freigabegruppe) mit Wertgrenze
  SELECT * FROM zmm_frg_user INTO TABLE gt_codes
    WHERE uname = sy-uname
      AND datab <= sy-datum
      AND datbi >= sy-datum.
ENDFORM.

*----------------------------------------------------------------------*
FORM banf_lesen.
  DATA: lt_eban  TYPE STANDARD TABLE OF eban,
        ls_t16fs TYPE t16fs,
        lv_pos   TYPE i.
  FIELD-SYMBOLS <lv_code> TYPE frgco.

  CLEAR gt_line.
  IF gt_codes IS INITIAL.
    RETURN.
  ENDIF.
  SELECT * FROM eban INTO TABLE lt_eban
    FOR ALL ENTRIES IN gt_codes
    WHERE frggr = gt_codes-frggr
      AND frgkz = 'X'                       "zur Freigabe gesperrt
      AND loekz = space
      AND ebakz = space.

  LOOP AT lt_eban INTO DATA(ls_eban).
    SELECT SINGLE * FROM t16fs INTO ls_t16fs
      WHERE frggr = ls_eban-frggr
        AND frgsx = ls_eban-frgst.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
*   naechster offener Code = Position strlen( FRGZU ) + 1
    lv_pos = strlen( ls_eban-frgzu ) + 1.
    IF lv_pos > 8.
      CONTINUE.
    ENDIF.
    ASSIGN COMPONENT |FRGC{ lv_pos }| OF STRUCTURE ls_t16fs TO <lv_code>.
    IF sy-subrc <> 0.
      CONTINUE.
    ENDIF.
    READ TABLE gt_codes TRANSPORTING NO FIELDS
      WITH KEY frggr = ls_eban-frggr frgco = <lv_code>.
    IF sy-subrc <> 0.
      CONTINUE.                             "nicht mein Code
    ENDIF.
    CLEAR gs_line.
    MOVE-CORRESPONDING ls_eban TO gs_line.
    gs_line-wert = ls_eban-preis * ls_eban-menge / nmax( val1 = 1 val2 = ls_eban-peinh ).
    APPEND gs_line TO gt_line.
  ENDLOOP.
  SORT gt_line BY banfn bnfpo.
ENDFORM.

*----------------------------------------------------------------------*
FORM markierte_freigeben.
  DATA: lt_return TYPE STANDARD TABLE OF bapireturn,
        lv_code   TYPE frgco,
        lv_limit  TYPE zmm_frg_user-max_wert,
        lv_status TYPE bapimmpara-rel_status.

  CLEAR: gv_anz_ok, gv_anz_er.
  LOOP AT gt_line INTO gs_line WHERE mark = 'X'.
    READ TABLE gt_codes INTO DATA(ls_code) WITH KEY frggr = gs_line-frggr.
    lv_code  = ls_code-frgco.
    lv_limit = ls_code-max_wert.

*   Vier-Augen: ueber Wertgrenze des Codes nicht freigeben
    IF lv_limit > 0 AND gs_line-wert > lv_limit.
      MESSAGE i054 WITH gs_line-banfn gs_line-bnfpo lv_limit.
      gv_anz_er = gv_anz_er + 1.
      CONTINUE.
    ENDIF.
*   eigene Banf nicht selbst freigeben
    IF gs_line-ernam = sy-uname.
      MESSAGE i055 WITH gs_line-banfn.
      gv_anz_er = gv_anz_er + 1.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'ENQUEUE_EMEBANE'
      EXPORTING
        banfn          = gs_line-banfn
        bnfpo          = gs_line-bnfpo
      EXCEPTIONS
        foreign_lock   = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      MESSAGE i056 WITH gs_line-banfn sy-msgv1.
      gv_anz_er = gv_anz_er + 1.
      CONTINUE.
    ENDIF.

    CLEAR lt_return.
    CALL FUNCTION 'BAPI_REQUISITION_RELEASE'
      EXPORTING
        number         = gs_line-banfn
        rel_code       = lv_code
        item           = gs_line-bnfpo
        use_exceptions = 'X'
      IMPORTING
        rel_status_new = lv_status
      TABLES
        return         = lt_return
      EXCEPTIONS
        authority_check_fail   = 1
        requisition_not_found  = 2
        enqueue_fail           = 3
        prerequisite_fail      = 4
        release_already_posted = 5
        responsibility_fail    = 6
        OTHERS                 = 7.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      gv_anz_ok = gv_anz_ok + 1.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      gv_anz_er = gv_anz_er + 1.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_EMEBANE'
      EXPORTING
        banfn = gs_line-banfn
        bnfpo = gs_line-bnfpo.
  ENDLOOP.

  MESSAGE s057 WITH gv_anz_ok gv_anz_er.
  gv_loaded = abap_false.
ENDFORM.

*----------------------------------------------------------------------*
FORM markierte_ablehnen USING pv_grund TYPE char80.
  DATA: lv_objkey TYPE swr_struct-object_key,
        lv_rc     TYPE sy-subrc,
        lt_cont   TYPE STANDARD TABLE OF swr_cont.

  LOOP AT gt_line INTO gs_line WHERE mark = 'X'.
    CALL FUNCTION 'ENQUEUE_EMEBANE'
      EXPORTING
        banfn          = gs_line-banfn
        bnfpo          = gs_line-bnfpo
      EXCEPTIONS
        foreign_lock   = 1
        OTHERS         = 2.
    IF sy-subrc <> 0.
      MESSAGE i056 WITH gs_line-banfn sy-msgv1.
      CONTINUE.
    ENDIF.

*   Ablehnung: Bearbeitungsstatus 08 direkt setzen (kein BAPI in 4.6C)
    UPDATE eban SET banpr = '08'
                    aedat = sy-datum
      WHERE banfn = gs_line-banfn
        AND bnfpo = gs_line-bnfpo.
    INSERT zmm_pr_reject FROM @( VALUE #( banfn = gs_line-banfn
                                          bnfpo = gs_line-bnfpo
                                          grund = pv_grund
                                          uname = sy-uname
                                          datum = sy-datum ) ).

*   Anforderer per Workflow informieren
    lv_objkey = gs_line-banfn.
    lt_cont = VALUE #( ( element = 'Reason'   value = pv_grund )
                       ( element = 'Approver' value = sy-uname ) ).
    CALL FUNCTION 'SAP_WAPI_CREATE_EVENT'
      EXPORTING
        object_type     = 'BUS2105'
        object_key      = lv_objkey
        event           = 'ZREJECTED'
        commit_work     = space
      IMPORTING
        return_code     = lv_rc
      TABLES
        input_container = lt_cont.
    IF lv_rc <> 0.
      MESSAGE i058 WITH gs_line-banfn.
    ENDIF.

    COMMIT WORK.
    CALL FUNCTION 'DEQUEUE_EMEBANE'
      EXPORTING
        banfn = gs_line-banfn
        bnfpo = gs_line-bnfpo.
  ENDLOOP.
  gv_loaded = abap_false.
ENDFORM.

*----------------------------------------------------------------------*
FORM detail_anzeigen.
  READ TABLE gt_line INTO gs_line WITH KEY mark = 'X'.
  IF sy-subrc <> 0.
    GET CURSOR LINE DATA(lv_line).
    READ TABLE gt_line INTO gs_line INDEX tc_list-top_line + lv_line - 1.
    IF sy-subrc <> 0.
      MESSAGE s052.
      RETURN.
    ENDIF.
  ENDIF.
  SET PARAMETER ID 'BAN' FIELD gs_line-banfn.
  CALL TRANSACTION 'ME53N' AND SKIP FIRST SCREEN.
ENDFORM.

*----------------------------------------------------------------------*
FORM summe_anzeigen.
  DATA: lv_summe TYPE eban-rlwrt,
        lv_anz   TYPE i.
  LOOP AT gt_line INTO gs_line WHERE mark = 'X'.
    lv_summe = lv_summe + gs_line-wert.
    lv_anz   = lv_anz + 1.
  ENDLOOP.
  IF lv_anz = 0.
    MESSAGE s052.
  ELSE.
    MESSAGE i060 WITH lv_anz lv_summe.
  ENDIF.
ENDFORM.
