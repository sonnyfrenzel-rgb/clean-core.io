FUNCTION z_pm_zaehler_plausi.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_POINT) TYPE  IMRC_POINT
*"     VALUE(IV_READG) TYPE  IMRC_READG
*"     VALUE(IV_IDATE) TYPE  IMRC_IDATE
*"  EXPORTING
*"     VALUE(EV_DIFF) TYPE  IMRC_READG
*"  EXCEPTIONS
*"      READING_TOO_LOW
*"----------------------------------------------------------------------
* Plausibilisierung Zählerstand vor Erfassung (Aufruf aus ZPM_ZAEHLER_UPL)
* 2017-03 MBR: Zählerüberlauf berücksichtigen
  SELECT SINGLE cjump FROM imptt
    WHERE point = @iv_point
      AND indct = 'X'
    INTO @DATA(lv_cjump).

  SELECT idate, itime, readg FROM imrg
    WHERE point = @iv_point
      AND cancl = @space
      AND idate <= @iv_idate
    ORDER BY idate DESCENDING, itime DESCENDING
    INTO TABLE @DATA(lt_last)
    UP TO 1 ROWS.

  ev_diff = iv_readg - VALUE imrc_readg( lt_last[ 1 ]-readg OPTIONAL ).
  IF ev_diff < 0 AND lv_cjump IS INITIAL.
    MESSAGE e102(zpm) WITH iv_point RAISING reading_too_low.
  ENDIF.
  ev_diff = COND #( WHEN ev_diff < 0 THEN ev_diff + lv_cjump
                    ELSE ev_diff ).
ENDFUNCTION.
