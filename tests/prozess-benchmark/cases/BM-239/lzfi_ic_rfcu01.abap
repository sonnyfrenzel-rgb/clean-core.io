FUNCTION z_fi_ic_salden_lesen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (remotefaehig, Funktionsgruppe ZFI_IC_RFC)
*"  IMPORTING
*"     VALUE(IV_BUKRS) TYPE  BUKRS
*"     VALUE(IV_VBUND) TYPE  RASSC
*"     VALUE(IV_STICHTAG) TYPE  DATUM
*"  EXPORTING
*"     VALUE(EV_FORDERUNG) TYPE  DMBTR
*"     VALUE(EV_VERBINDLICHKEIT) TYPE  DMBTR
*"  EXCEPTIONS
*"      KEINE_DATEN
*"----------------------------------------------------------------------
* Laeuft im Partnersystem: offene Posten des Partner-Buchungskreises
* gegenueber der anfragenden Gesellschaft (VBUND) bis Stichtag.
*----------------------------------------------------------------------
  DATA: lv_ford_cnt TYPE i,
        lv_verb_cnt TYPE i.

  SELECT COUNT(*), SUM( CASE shkzg WHEN 'S' THEN dmbtr ELSE - dmbtr END )
    FROM bsid
    WHERE bukrs  = @iv_bukrs
      AND vbund  = @iv_vbund
      AND budat <= @iv_stichtag
    INTO (@lv_ford_cnt, @ev_forderung).

  SELECT COUNT(*), SUM( CASE shkzg WHEN 'H' THEN dmbtr ELSE - dmbtr END )
    FROM bsik
    WHERE bukrs  = @iv_bukrs
      AND vbund  = @iv_vbund
      AND budat <= @iv_stichtag
    INTO (@lv_verb_cnt, @ev_verbindlichkeit).

  IF lv_ford_cnt = 0 AND lv_verb_cnt = 0.
    RAISE keine_daten.
  ENDIF.
ENDFUNCTION.
