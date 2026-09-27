FUNCTION z_qm_charge_bewerten.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_MATNR) TYPE  MATNR
*"     VALUE(IV_CHARG) TYPE  CHARG_D
*"     VALUE(IV_MIN_REINHEIT) TYPE  ATFLV DEFAULT '99.5'
*"  EXPORTING
*"     VALUE(EV_STATUS) TYPE  CHAR1
*"     VALUE(EV_REINHEIT) TYPE  ATFLV
*"  EXCEPTIONS
*"      KEINE_KLASSIFIZIERUNG
*"----------------------------------------------------------------------
* Bewertung einer Charge anhand ihrer Klassifizierung (Klassenart 023)
* Status: F = freigeben, S = sperren, P = pruefen (Merkmal fehlt)
  CONSTANTS: lc_klart   TYPE klassenart VALUE '023',
             lc_merkmal TYPE atnam VALUE 'Z_REINHEIT',
             lc_verfall TYPE atnam VALUE 'LOBM_VFDAT'.
  DATA: lv_objek    TYPE cuobn,
        lv_cuobj    TYPE inob-cuobj,
        lv_objek_cl TYPE ausp-objek,
        lv_atinn    TYPE atinn,
        lv_atinn_vf TYPE atinn,
        lt_ausp     TYPE STANDARD TABLE OF ausp,
        ls_ausp     TYPE ausp,
        lv_num8     TYPE n LENGTH 8,
        lv_vfdat    TYPE d.

  CLEAR: ev_status, ev_reinheit.

* Objektschluessel Charge (MCH1) = Material (18) + Charge (10)
  lv_objek     = iv_matnr.
  lv_objek+18  = iv_charg.

  SELECT SINGLE cuobj FROM inob INTO lv_cuobj
    WHERE klart = lc_klart
      AND obtab = 'MCH1'
      AND objek = lv_objek.
  IF sy-subrc <> 0.
    RAISE keine_klassifizierung.
  ENDIF.
  lv_objek_cl = lv_cuobj.

  SELECT SINGLE atinn FROM cabn INTO lv_atinn
    WHERE atnam = lc_merkmal.
  SELECT SINGLE atinn FROM cabn INTO lv_atinn_vf
    WHERE atnam = lc_verfall.

  SELECT * FROM ausp INTO TABLE lt_ausp
    WHERE objek = lv_objek_cl
      AND klart = lc_klart.
*     AND mafid = 'O'.

  READ TABLE lt_ausp INTO ls_ausp WITH KEY atinn = lv_atinn.
  IF sy-subrc <> 0.
    ev_status = 'P'.
    RETURN.
  ENDIF.
  ev_reinheit = ls_ausp-atflv.

  READ TABLE lt_ausp INTO ls_ausp WITH KEY atinn = lv_atinn_vf.
  IF sy-subrc = 0.
    lv_num8  = ls_ausp-atflv.
    lv_vfdat = lv_num8.
  ENDIF.

  IF lv_vfdat IS NOT INITIAL AND lv_vfdat < sy-datum.
    ev_status = 'S'.
  ELSEIF ev_reinheit >= iv_min_reinheit.
    ev_status = 'F'.
  ELSE.
    ev_status = 'S'.
  ENDIF.

ENDFUNCTION.
