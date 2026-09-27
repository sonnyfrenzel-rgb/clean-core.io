*&---------------------------------------------------------------------*
*&  Include           ZCO_KALK_UEBERNAHME_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  KALKULATIONEN_LESEN
*&---------------------------------------------------------------------*
FORM kalkulationen_lesen.
* nur Materialkalkulationen (BZOBJ 0), Version 1
  SELECT * FROM keko INTO TABLE gt_keko
    WHERE bzobj  = '0'
      AND matnr IN s_matnr
      AND werks IN s_werks
      AND klvar  = p_klvar
      AND kadky  = p_kadky
      AND tvers  = '01'.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  KALKULATION_VERARBEITEN
*&---------------------------------------------------------------------*
FORM kalkulation_verarbeiten USING ps_keko TYPE keko
                             RAISING zcx_co_kalk.
  TRY.
      go_regel->pruefen( ps_keko ).
    CLEANUP.
*     Zaehler fuer die Statistik am Listenende
      ADD 1 TO gv_abgelehnt.
  ENDTRY.

  IF p_test = 'X'.
    PERFORM protokoll USING ps_keko 'I' `Testlauf: Pruefung bestanden`.
    RETURN.
  ENDIF.

  PERFORM preis_uebernehmen USING ps_keko.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PREIS_UEBERNEHMEN
*&---------------------------------------------------------------------*
FORM preis_uebernehmen USING ps_keko TYPE keko.
  DATA: lt_prices TYPE STANDARD TABLE OF bapi_matval_prices,
        ls_price  TYPE bapi_matval_prices,
        ls_return TYPE bapiret2,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_frg    TYPE zco_kalk_frg,
        lv_preis  TYPE ck_kwt.

  lv_preis = go_regel->kalk_preis( ps_keko ).

  ls_price-currency_type = '10'.            "Hauswaehrung
  ls_price-price         = lv_preis.
  ls_price-currency      = ps_keko-hwaer.
  ls_price-price_unit    = 1.
  APPEND ls_price TO lt_prices.

  CALL FUNCTION 'BAPI_MATVAL_PRICE_CHANGE'
    EXPORTING
      material      = ps_keko-matnr
      valuationarea = ps_keko-werks
      valuationtype = space
      price_date    = sy-datum
    TABLES
      prices        = lt_prices
      returntab     = lt_return.

  READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
  IF sy-subrc = 0.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    PERFORM protokoll USING ps_keko 'E' CONV string( ls_return-message ).
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    ls_frg-kalnr = ps_keko-kalnr.
    ls_frg-kadky = ps_keko-kadky.
    ls_frg-matnr = ps_keko-matnr.
    ls_frg-werks = ps_keko-werks.
    ls_frg-preis = lv_preis.
    ls_frg-uname = sy-uname.
    ls_frg-datum = sy-datum.
    INSERT zco_kalk_frg FROM ls_frg.
    PERFORM protokoll USING ps_keko 'S' |Preis { lv_preis } uebernommen|.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  PROTOKOLL
*&---------------------------------------------------------------------*
FORM protokoll USING ps_keko    TYPE keko
                     pv_schwere TYPE symsgty
                     pv_text    TYPE string.
  APPEND VALUE #( matnr   = ps_keko-matnr
                  werks   = ps_keko-werks
                  kalnr   = ps_keko-kalnr
                  schwere = pv_schwere
                  text    = pv_text ) TO gt_prot.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  AUSGABE
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA ls_prot TYPE ty_prot.

  SORT gt_prot BY schwere matnr.
  LOOP AT gt_prot INTO ls_prot.
    WRITE: / ls_prot-schwere, ls_prot-matnr, ls_prot-werks, ls_prot-text.
  ENDLOOP.
  ULINE.
  WRITE: / 'Abgelehnt:', gv_abgelehnt.
ENDFORM.

*&---------------------------------------------------------------------*
*& Version 2012: Vormerken und Freigeben ueber CK24 per Batch-Input.
*& Abgeloest 2016, weil CK24 nur einmal je Periode freigeben kann.
*&---------------------------------------------------------------------*
*FORM ck24_freigeben USING ps_keko TYPE keko.
*  DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
*        ls_bdc TYPE bdcdata.
*
*  ls_bdc-program  = 'SAPRCK24'.
*  ls_bdc-dynpro   = '1000'.
*  ls_bdc-dynbegin = 'X'.
*  APPEND ls_bdc TO lt_bdc.
*  CLEAR ls_bdc.
*  ls_bdc-fnam = 'P_BUKRS'.
*  ls_bdc-fval = '2000'.
*  APPEND ls_bdc TO lt_bdc.
*  CLEAR ls_bdc.
*  ls_bdc-fnam = 'BDC_OKCODE'.
*  ls_bdc-fval = '=ONLI'.
*  APPEND ls_bdc TO lt_bdc.
*  CALL TRANSACTION 'CK24' USING lt_bdc MODE 'N'.
*ENDFORM.
