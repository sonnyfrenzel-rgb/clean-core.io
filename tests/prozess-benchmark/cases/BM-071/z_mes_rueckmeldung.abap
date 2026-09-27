FUNCTION z_mes_rueckmeldung.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (remotefaehig)
*"  IMPORTING
*"     VALUE(IV_MES_ID) TYPE  ZMES_ID
*"     VALUE(IV_AUFNR) TYPE  AUFNR
*"     VALUE(IV_VORNR) TYPE  VORNR
*"     VALUE(IV_GUT) TYPE  RU_LMNGA
*"     VALUE(IV_AUS) TYPE  RU_XMNGA OPTIONAL
*"     VALUE(IV_MEINH) TYPE  MEINS
*"     VALUE(IV_ENDRM) TYPE  XFELD OPTIONAL
*"     VALUE(IV_BUDAT) TYPE  BUDAT DEFAULT SY-DATUM
*"  EXPORTING
*"     VALUE(EV_STATUS) TYPE  CHAR1
*"     VALUE(EV_RUECK) TYPE  CO_RUECK
*"     VALUE(EV_RMZHL) TYPE  CO_RMZHL
*"  TABLES
*"      ET_RETURN STRUCTURE  BAPIRET2 OPTIONAL
*"----------------------------------------------------------------------
  DATA: lv_aufnr TYPE aufnr,
        lv_ok    TYPE abap_bool,
        lv_dummy TYPE zmes_id.

  CLEAR: gs_ctx, ev_status, ev_rueck, ev_rmzhl.
  REFRESH et_return.
  gs_ctx-mes_id = iv_mes_id.
  gs_ctx-vornr  = iv_vornr.

* Technischer RFC-User des MES braucht Z_MES_IF / 16
  AUTHORITY-CHECK OBJECT 'Z_MES_IF'
    ID 'ACTVT' FIELD '16'.
  IF sy-subrc <> 0.
    ev_status = gc_st_err.
    APPEND VALUE #( type = 'E' message = 'Keine Berechtigung fuer MES-Rueckmeldung' )
      TO et_return.
    RETURN.
  ENDIF.

* Idempotenz: MES wiederholt bei Timeout mit gleicher MES-ID
  SELECT SINGLE mes_id FROM zmes_rm_log INTO lv_dummy
    WHERE mes_id = iv_mes_id
      AND status = gc_st_ok.
  IF sy-subrc = 0.
    ev_status = gc_st_dup.
    APPEND VALUE #( type = 'W' message = 'MES-ID bereits gebucht' ) TO et_return.
    RETURN.
  ENDIF.

  CALL FUNCTION 'CONVERSION_EXIT_ALPHA_INPUT'
    EXPORTING
      input  = iv_aufnr
    IMPORTING
      output = lv_aufnr.
  gs_ctx-aufnr = lv_aufnr.

  CALL FUNCTION 'ENQUEUE_ESORDER'
    EXPORTING
      aufnr          = lv_aufnr
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    ev_status     = gc_st_lock.
    gs_ctx-status = gc_st_lock.
    gs_ctx-text   = 'Auftrag gesperrt - MES wiederholt spaeter'.
    APPEND VALUE #( type = 'E' message = gs_ctx-text ) TO et_return.
    PERFORM schreibe_log.
    RETURN.
  ENDIF.

  PERFORM pruefe_auftrag USING lv_aufnr iv_vornr CHANGING lv_ok.
  IF lv_ok = abap_false.
    CALL FUNCTION 'DEQUEUE_ESORDER'
      EXPORTING
        aufnr = lv_aufnr.
    ev_status = gc_st_err.
    APPEND VALUE #( type = 'E' message = gs_ctx-text ) TO et_return.
    PERFORM schreibe_log.
    RETURN.
  ENDIF.

  PERFORM buche_rueckmeldung USING    lv_aufnr iv_vornr iv_gut iv_aus
                                      iv_meinh iv_endrm iv_budat
                             CHANGING ev_rueck ev_rmzhl.

  CALL FUNCTION 'DEQUEUE_ESORDER'
    EXPORTING
      aufnr = lv_aufnr.

  ev_status = gs_ctx-status.
  APPEND VALUE #( type = gs_ctx-status message = gs_ctx-text ) TO et_return.
  PERFORM schreibe_log.

ENDFUNCTION.
