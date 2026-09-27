*----------------------------------------------------------------------*
***INCLUDE ZFI_FXVAL_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form SELECT_ITEMS - zum Stichtag offene Posten
*&---------------------------------------------------------------------*
FORM select_items.
  DATA lt_cleared TYPE STANDARD TABLE OF ty_item.

* heute noch offen, gebucht bis Stichtag
  SELECT lifnr belnr gjahr buzei shkzg waers wrbtr dmbtr
    FROM bsik INTO TABLE gt_items
    WHERE bukrs =  p_bukrs
      AND budat <= p_stich
      AND waers <> gv_hwaer.

* nach dem Stichtag ausgeglichen = am Stichtag noch offen
  SELECT lifnr belnr gjahr buzei shkzg waers wrbtr dmbtr
    FROM bsak INTO TABLE lt_cleared
    WHERE bukrs =  p_bukrs
      AND budat <= p_stich
      AND augdt >  p_stich
      AND waers <> gv_hwaer.
  APPEND LINES OF lt_cleared TO gt_items.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form VALUATE - Kursdifferenz je Posten, Summe je Waehrung
*&---------------------------------------------------------------------*
FORM valuate.
  DATA: ls_item   TYPE ty_item,
        lv_new    TYPE dmbtr,
        lv_old    TYPE dmbtr,
        lv_wrbtr  TYPE wrbtr.

  LOOP AT gt_items INTO ls_item.
*   Haben (Verbindlichkeit) negativ
    IF ls_item-shkzg = 'H'.
      lv_wrbtr = - ls_item-wrbtr.
      lv_old   = - ls_item-dmbtr.
    ELSE.
      lv_wrbtr = ls_item-wrbtr.
      lv_old   = ls_item-dmbtr.
    ENDIF.

    CALL FUNCTION 'CONVERT_TO_LOCAL_CURRENCY'
      EXPORTING
        date             = p_stich
        foreign_amount   = lv_wrbtr
        foreign_currency = ls_item-waers
        local_currency   = gv_hwaer
        type_of_rate     = p_kurst
      IMPORTING
        local_amount     = lv_new
      EXCEPTIONS
        no_rate_found    = 1
        overflow         = 2
        no_factors_found = 3
        OTHERS           = 4.
    IF sy-subrc <> 0.
      INSERT ls_item-waers INTO TABLE gt_norate.
      CONTINUE.
    ENDIF.

    CLEAR gs_sum.
    gs_sum-waers = ls_item-waers.
    gs_sum-diff  = lv_new - lv_old.
    COLLECT gs_sum INTO gt_sum.
  ENDLOOP.

* Waehrungen ohne Kurs komplett aus der Bewertung nehmen
  LOOP AT gt_norate INTO DATA(lv_waers).
    DELETE gt_sum WHERE waers = lv_waers.
    WRITE: / 'Kein Kurs fuer', lv_waers, '- Waehrung nicht bewertet'.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form POST_DIFFERENCES - ein Beleg je Waehrung
*&---------------------------------------------------------------------*
FORM post_differences.
  DATA: ls_header TYPE bapiache09,
        lt_gl     TYPE STANDARD TABLE OF bapiacgl09,
        lt_amt    TYPE STANDARD TABLE OF bapiaccr09,
        lt_ret    TYPE STANDARD TABLE OF bapiret2,
        lv_soll   TYPE hkont,
        lv_haben  TYPE hkont,
        lv_betrag TYPE bapidoccur,
        ls_log    TYPE zfi_fxval_log.

  LOOP AT gt_sum INTO gs_sum.
    IF gs_sum-diff = 0.
      CONTINUE.
    ENDIF.

*   Verbindlichkeit waechst (diff < 0) = Kursverlust
    IF gs_sum-diff < 0.
      lv_soll  = p_aufw.
      lv_haben = p_korr.
    ELSE.
      lv_soll  = p_korr.
      lv_haben = p_ertr.
    ENDIF.
    lv_betrag = abs( gs_sum-diff ).

    CLEAR: ls_header, lt_gl, lt_amt, lt_ret, gv_objkey.
    ls_header-bus_act    = 'RFBU'.
    ls_header-username   = sy-uname.
    ls_header-comp_code  = p_bukrs.
    ls_header-doc_date   = p_stich.
    ls_header-pstng_date = p_budat.
    ls_header-doc_type   = 'SA'.
    ls_header-header_txt = |FW-Bewertung { gs_sum-waers } { p_stich DATE = USER }|.
    APPEND VALUE #( itemno_acc = 1 gl_account = lv_soll  ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 2 gl_account = lv_haben ) TO lt_gl.
    APPEND VALUE #( itemno_acc = 1 currency = gv_hwaer amt_doccur = lv_betrag ) TO lt_amt.
    APPEND VALUE #( itemno_acc = 2 currency = gv_hwaer amt_doccur = - lv_betrag ) TO lt_amt.

    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader = ls_header
      IMPORTING
        obj_key        = gv_objkey
      TABLES
        accountgl      = lt_gl
        currencyamount = lt_amt
        return         = lt_ret.

    READ TABLE lt_ret TRANSPORTING NO FIELDS WITH KEY type = 'E'.
    IF sy-subrc = 0.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      WRITE: / gs_sum-waers, 'Buchung fehlgeschlagen'.
      CONTINUE.
    ENDIF.

*   Protokoll fuer Auflösung zum Folgemonat (manuell per FB08)
    ls_log-bukrs  = p_bukrs.
    ls_log-stich  = p_stich.
    ls_log-waers  = gs_sum-waers.
    ls_log-objkey = gv_objkey.
    ls_log-diff   = gs_sum-diff.
    INSERT zfi_fxval_log FROM ls_log.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    WRITE: / gs_sum-waers, 'gebucht', gv_objkey(10).
  ENDLOOP.
ENDFORM.
