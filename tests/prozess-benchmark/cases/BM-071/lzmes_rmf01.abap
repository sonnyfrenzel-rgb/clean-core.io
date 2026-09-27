*----------------------------------------------------------------------*
***INCLUDE LZMES_RMF01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Auftrag/Vorgang fachlich pruefen: Fertigungsauftrag, freigegeben,
*& nicht technisch abgeschlossen, Vorgang vorhanden
*&---------------------------------------------------------------------*
FORM pruefe_auftrag USING    iv_aufnr TYPE aufnr
                             iv_vornr TYPE vornr
                    CHANGING cv_ok    TYPE abap_bool.
  DATA: lv_objnr TYPE j_objnr,
        lv_autyp TYPE auftyp,
        lv_aufpl TYPE co_aufpl,
        lv_vornr TYPE vornr.

  cv_ok = abap_false.

  SELECT SINGLE objnr autyp FROM aufk INTO (lv_objnr, lv_autyp)
    WHERE aufnr = iv_aufnr.
  IF sy-subrc <> 0 OR lv_autyp <> '10'.
    gs_ctx-status = gc_st_err.
    gs_ctx-text   = 'Kein Fertigungsauftrag'.
    RETURN.
  ENDIF.

* I0002 = FREI muss aktiv sein
  CALL FUNCTION 'STATUS_CHECK'
    EXPORTING
      objnr             = lv_objnr
      status            = 'I0002'
    EXCEPTIONS
      object_not_found  = 1
      status_not_active = 2
      OTHERS            = 3.
  IF sy-subrc <> 0.
    gs_ctx-status = gc_st_err.
    gs_ctx-text   = 'Auftrag nicht freigegeben'.
    RETURN.
  ENDIF.

* I0045 = TABG darf nicht aktiv sein
  CALL FUNCTION 'STATUS_CHECK'
    EXPORTING
      objnr             = lv_objnr
      status            = 'I0045'
    EXCEPTIONS
      object_not_found  = 1
      status_not_active = 2
      OTHERS            = 3.
  IF sy-subrc = 0.
    gs_ctx-status = gc_st_err.
    gs_ctx-text   = 'Auftrag technisch abgeschlossen'.
    RETURN.
  ENDIF.

  SELECT SINGLE aufpl FROM afko INTO lv_aufpl
    WHERE aufnr = iv_aufnr.
  SELECT SINGLE vornr FROM afvc INTO lv_vornr
    WHERE aufpl = lv_aufpl
      AND vornr = iv_vornr.
  IF sy-subrc <> 0.
    gs_ctx-status = gc_st_err.
    gs_ctx-text   = 'Vorgang im Auftrag nicht vorhanden'.
    RETURN.
  ENDIF.

  cv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Rueckmeldung buchen (eigene LUW)
*&---------------------------------------------------------------------*
FORM buche_rueckmeldung USING    iv_aufnr TYPE aufnr
                                 iv_vornr TYPE vornr
                                 iv_gut   TYPE ru_lmnga
                                 iv_aus   TYPE ru_xmnga
                                 iv_meinh TYPE meins
                                 iv_endrm TYPE xfeld
                                 iv_budat TYPE budat
                        CHANGING cv_rueck TYPE co_rueck
                                 cv_rmzhl TYPE co_rmzhl.
  DATA: lt_tt     TYPE STANDARD TABLE OF bapi_pp_timeticket,
        ls_tt     TYPE bapi_pp_timeticket,
        ls_return TYPE bapiret1,
        lt_detail TYPE STANDARD TABLE OF bapi_coru_return,
        ls_detail TYPE bapi_coru_return.

  ls_tt-orderid        = iv_aufnr.
  ls_tt-operation      = iv_vornr.
  ls_tt-postg_date     = iv_budat.
  ls_tt-yield          = iv_gut.
  ls_tt-scrap          = iv_aus.
  ls_tt-conf_quan_unit = iv_meinh.
  ls_tt-fin_conf       = iv_endrm.
  ls_tt-conf_text      = |MES { gs_ctx-mes_id }|.
  APPEND ls_tt TO lt_tt.

  CALL FUNCTION 'BAPI_PRODORDCONF_CREATE_TT'
    IMPORTING
      return        = ls_return
    TABLES
      timetickets   = lt_tt
      detail_return = lt_detail.

  READ TABLE lt_detail INTO ls_detail INDEX 1.
  IF ls_return-type CA 'EA' OR ls_detail-type CA 'EA'.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    gs_ctx-status = gc_st_err.
    gs_ctx-text   = COND #( WHEN ls_detail-message IS NOT INITIAL
                            THEN ls_detail-message
                            ELSE ls_return-message ).
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    cv_rueck      = ls_detail-conf_no.
    cv_rmzhl      = ls_detail-conf_cnt.
    gs_ctx-status = gc_st_ok.
    gs_ctx-text   = |Rueckmeldung { cv_rueck }/{ cv_rmzhl } gebucht|.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Schnittstellenprotokoll fortschreiben (auch im Fehlerfall)
*&---------------------------------------------------------------------*
FORM schreibe_log.
  DATA ls_log TYPE zmes_rm_log.

  ls_log-mes_id = gs_ctx-mes_id.
  ls_log-aufnr  = gs_ctx-aufnr.
  ls_log-vornr  = gs_ctx-vornr.
  ls_log-status = gs_ctx-status.
  ls_log-text   = gs_ctx-text.
  ls_log-erdat  = sy-datum.
  ls_log-erzet  = sy-uzeit.
  ls_log-ernam  = sy-uname.
  MODIFY zmes_rm_log FROM ls_log.
  COMMIT WORK.
ENDFORM.
