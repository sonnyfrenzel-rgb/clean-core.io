FUNCTION z_wty_antrag_anlegen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_EQUNR) TYPE  EQUNR
*"     VALUE(IV_BETRAG) TYPE  ZWTY_BETRAG
*"     VALUE(IV_SCHADEN) TYPE  ZWTY_SCHADENSCODE
*"  EXPORTING
*"     VALUE(EV_ANTRAG) TYPE  ZWTY_ANTRAG_NR
*"  EXCEPTIONS
*"      GARANTIE_ABGELAUFEN
*"----------------------------------------------------------------------
* Garantieantrag zum Gerät anlegen (Händlerportal, RFC)
  DATA ls_antrag TYPE zwty_antrag.

  DATA(lv_objnr) = |IE{ iv_equnr }|.
  SELECT SINGLE gwlen FROM bgmkobj INTO @DATA(lv_gwlen)
    WHERE j_objnr = @lv_objnr
      AND gaart   = '1'.
  IF sy-subrc <> 0 OR lv_gwlen < sy-datum.
    MESSAGE e001(zwty) WITH iv_equnr RAISING garantie_abgelaufen.
  ENDIF.

  CALL FUNCTION 'NUMBER_GET_NEXT'
    EXPORTING
      nr_range_nr = '01'
      object      = 'ZWTY_ANTR'
    IMPORTING
      number      = ev_antrag.

  ls_antrag = VALUE #( antrag  = ev_antrag
                       equnr   = iv_equnr
                       schaden = iv_schaden
                       betrag  = iv_betrag
                       status  = COND #( WHEN iv_betrag > 5000 THEN 'P' ELSE 'F' )
                       erdat   = sy-datum
                       ernam   = sy-uname ).
  INSERT zwty_antrag FROM ls_antrag.
ENDFUNCTION.
