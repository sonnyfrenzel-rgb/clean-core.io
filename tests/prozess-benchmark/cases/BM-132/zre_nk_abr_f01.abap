*&---------------------------------------------------------------------*
*& Include ZRE_NK_ABR_F01 - Unterprogramme Nebenkostenabrechnung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form TEILNEHMER_LESEN - Mieter der Abrechnungseinheit im Jahr
*&---------------------------------------------------------------------*
FORM teilnehmer_lesen.
  DATA lv_mon TYPE i.
  FIELD-SYMBOLS <ls_t> TYPE ty_teiln.

  SELECT t~recnnr, c~intreno, t~kunnr, t~flaeche, t~personen,
         t~von, t~bis
    FROM zre_nk_teiln AS t
    INNER JOIN vicncn AS c ON c~bukrs  = t~bukrs
                          AND c~recnnr = t~recnnr
    WHERE t~ae_id = @p_ae
      AND t~von  <= @gv_ende
      AND t~bis  >= @gv_beginn
    INTO CORRESPONDING FIELDS OF TABLE @gt_teiln.

  LOOP AT gt_teiln ASSIGNING <ls_t>.
*   Nutzungszeitraum auf das Abrechnungsjahr begrenzen
    <ls_t>-von = COND #( WHEN <ls_t>-von < gv_beginn THEN gv_beginn ELSE <ls_t>-von ).
    <ls_t>-bis = COND #( WHEN <ls_t>-bis > gv_ende OR <ls_t>-bis IS INITIAL
                         THEN gv_ende ELSE <ls_t>-bis ).
*   monatliche NK-Vorauszahlung laut Vertrag (Konditionsart Z200)
    SELECT SINGLE unitprice FROM vicdcond INTO @DATA(lv_vz)
      WHERE intreno  = @<ls_t>-intreno
        AND condtype = 'Z200'.
    lv_mon = ( <ls_t>-bis - <ls_t>-von + 1 ) / 30.
    <ls_t>-voraus = lv_vz * lv_mon.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form VERTEILEN - Kostenverteilung mit Fehlerbehandlung
*&---------------------------------------------------------------------*
FORM verteilen.
  TRY.
      PERFORM anteile_berechnen.
    CATCH cx_sy_zerodivide.
      MESSAGE e032(zre) WITH p_ae p_gjahr.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ANTEILE_BERECHNEN - Basis je Mieter, Kostensatz, Saldo
*&---------------------------------------------------------------------*
FORM anteile_berechnen RAISING cx_sy_zerodivide.
  DATA: lv_summe TYPE p LENGTH 15 DECIMALS 4,
        lv_satz  TYPE p LENGTH 15 DECIMALS 6.
  FIELD-SYMBOLS <ls_t> TYPE ty_teiln.

  LOOP AT gt_teiln ASSIGNING <ls_t>.
    <ls_t>-basis = COND decfloat34( WHEN gs_ae-umlageschl = 'PE' THEN <ls_t>-personen
                                    ELSE <ls_t>-flaeche )
                   * ( <ls_t>-bis - <ls_t>-von + 1 ).
    lv_summe = lv_summe + <ls_t>-basis.
  ENDLOOP.

  TRY.
      lv_satz = gv_gesamt / lv_summe.
      LOOP AT gt_teiln ASSIGNING <ls_t>.
        <ls_t>-kosten = lv_satz * <ls_t>-basis.
        <ls_t>-saldo  = <ls_t>-kosten - <ls_t>-voraus.
      ENDLOOP.
    CLEANUP.
      CLEAR gv_gesamt.
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUCHEN - Nachzahlung / Guthaben je Mieter ins FI
*&---------------------------------------------------------------------*
FORM buchen.
  DATA: ls_head TYPE bapiache09,
        lt_ar   TYPE STANDARD TABLE OF bapiacar09,
        lt_gl   TYPE STANDARD TABLE OF bapiacgl09,
        lt_cur  TYPE STANDARD TABLE OF bapiaccr09,
        lt_ret  TYPE STANDARD TABLE OF bapiret2,
        lv_key  TYPE bapiache09-obj_key.
  FIELD-SYMBOLS <ls_t> TYPE ty_teiln.

  LOOP AT gt_teiln ASSIGNING <ls_t>.
    CHECK <ls_t>-saldo <> 0.
    CLEAR: lt_ret, lv_key.
    ls_head = VALUE #( bus_act    = 'RFBU'
                       comp_code  = gs_ae-bukrs
                       doc_date   = sy-datum
                       pstng_date = sy-datum
                       doc_type   = 'NK'
                       header_txt = |NK { p_gjahr } { <ls_t>-recnnr }|
                       username   = sy-uname ).
    lt_ar  = VALUE #( ( itemno_acc = 1 customer = <ls_t>-kunnr ) ).
    lt_gl  = VALUE #( ( itemno_acc = 2 gl_account = gs_ae-erloeskonto ) ).
    lt_cur = VALUE #( ( itemno_acc = 1 currency = gs_ae-waers amt_doccur = <ls_t>-saldo )
                      ( itemno_acc = 2 currency = gs_ae-waers amt_doccur = 0 - <ls_t>-saldo ) ).

    CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
      EXPORTING
        documentheader    = ls_head
      IMPORTING
        obj_key           = lv_key
      TABLES
        accountgl         = lt_gl
        accountreceivable = lt_ar
        currencyamount    = lt_cur
        return            = lt_ret.

    IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      <ls_t>-meldung = VALUE #( lt_ret[ type = 'E' ]-message OPTIONAL ).
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    <ls_t>-belnr = lv_key(10).
    INSERT zre_nk_erg FROM @( VALUE zre_nk_erg( ae_id  = p_ae
                                                gjahr  = p_gjahr
                                                recnnr = <ls_t>-recnnr
                                                saldo  = <ls_t>-saldo
                                                belnr  = <ls_t>-belnr ) ).
  ENDLOOP.
  COMMIT WORK.
ENDFORM.
