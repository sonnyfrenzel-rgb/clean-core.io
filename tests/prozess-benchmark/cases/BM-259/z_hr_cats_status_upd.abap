FUNCTION z_hr_cats_status_upd.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein (Start sofort)
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IT_COUNTER) TYPE  ZCL_HR_ZEIT_SERVICE=>TT_COUNTER
*"     VALUE(IV_STATUS) TYPE  CATSSTATUS
*"     VALUE(IV_GRUND) TYPE  STRING
*"     VALUE(IV_APNAM) TYPE  SYUNAME
*"----------------------------------------------------------------------
* Achtung: direktes Aendern der CATSDB - CATS-Transfer (CAT6/CAT7/CATM)
* liest den Status beim naechsten Lauf. Keine Aenderungsbelege!

  LOOP AT it_counter INTO DATA(lv_counter).
    UPDATE catsdb SET status  = @iv_status,
                      apnam   = @iv_apnam,
                      apdat   = @sy-datum,
                      zzgrund = @iv_grund
      WHERE counter = @lv_counter
        AND status  = '20'.
    IF sy-subrc <> 0.
*     inzwischen von anderer Stelle geaendert
      MESSAGE a031(zhr_cats) WITH lv_counter.
    ENDIF.
  ENDLOOP.

ENDFUNCTION.
