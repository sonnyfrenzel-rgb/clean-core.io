FUNCTION z_wm_nachschub_fixplatz.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LGNUM) TYPE  LGNUM
*"     VALUE(IV_LGTYP) TYPE  LGTYP DEFAULT '005'
*"     VALUE(IV_WERKS) TYPE  WERKS_D
*"     VALUE(IV_BWLVS) TYPE  BWLVS DEFAULT '319'
*"  EXPORTING
*"     VALUE(EV_ANZ_TA) TYPE  I
*"  TABLES
*"      ET_PROT STRUCTURE  BAPIRET2
*"  EXCEPTIONS
*"      LOCKED
*"----------------------------------------------------------------------
* Nachschub fuer Kommissionier-Fixplaetze (Lagertyp 005) aus Reserve.
* Wird per Job alle 30 Minuten und aus dem Leitstand gerufen.
  DATA: lt_mlgt  TYPE STANDARD TABLE OF mlgt,
        ls_mlgt  TYPE mlgt,
        lv_verme TYPE lqua-verme,
        lv_menge TYPE rl03t-anfme,
        lv_tanum TYPE ltak-tanum,
        ls_prot  TYPE bapiret2.

  CALL FUNCTION 'ENQUEUE_EZ_WM_NACHSCH'
    EXPORTING
      lgnum          = iv_lgnum
      lgtyp          = iv_lgtyp
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    RAISE locked.
  ENDIF.

  SELECT * FROM mlgt INTO TABLE lt_mlgt
    WHERE lgnum = iv_lgnum
      AND lgtyp = iv_lgtyp
      AND lgpla <> space
      AND lvorm = space.

  LOOP AT lt_mlgt INTO ls_mlgt WHERE lpmin > 0.
    CLEAR lv_verme.
    SELECT SUM( verme ) FROM lqua INTO lv_verme
      WHERE lgnum = ls_mlgt-lgnum
        AND lgtyp = ls_mlgt-lgtyp
        AND lgpla = ls_mlgt-lgpla
        AND matnr = ls_mlgt-matnr.
*   Nachschub erst unter Mindestmenge
    IF lv_verme >= ls_mlgt-lpmin.
      CONTINUE.
    ENDIF.
*   Nachschubmenge: gepflegte Menge, sonst bis Maximum auffuellen
    IF ls_mlgt-nsmng > 0.
      lv_menge = ls_mlgt-nsmng.
    ELSE.
      lv_menge = ls_mlgt-lpmax - lv_verme.
    ENDIF.

    CALL FUNCTION 'L_TO_CREATE_SINGLE'
      EXPORTING
        i_lgnum               = iv_lgnum
        i_bwlvs               = iv_bwlvs
        i_matnr               = ls_mlgt-matnr
        i_werks               = iv_werks
        i_anfme               = lv_menge
        i_nltyp               = ls_mlgt-lgtyp
        i_nlpla               = ls_mlgt-lgpla
        i_commit_work         = 'X'
      IMPORTING
        e_tanum               = lv_tanum
      EXCEPTIONS
        no_to_created         = 1
        bwlvs_wrong           = 2
        material_not_found    = 3
        quantity_wrong        = 4
        OTHERS                = 99.
    CLEAR ls_prot.
    IF sy-subrc = 0.
      ev_anz_ta = ev_anz_ta + 1.
      ls_prot-type = 'S'.
      ls_prot-message = |TA { lv_tanum } für { ls_mlgt-matnr } an { ls_mlgt-lgpla }|.
    ELSE.
      ls_prot-type = 'E'.
      ls_prot-message = |Kein TA für { ls_mlgt-matnr }, Fehler { sy-subrc }|.
    ENDIF.
    APPEND ls_prot TO et_prot.
  ENDLOOP.

  CALL FUNCTION 'DEQUEUE_EZ_WM_NACHSCH'
    EXPORTING
      lgnum = iv_lgnum
      lgtyp = iv_lgtyp.

ENDFUNCTION.
