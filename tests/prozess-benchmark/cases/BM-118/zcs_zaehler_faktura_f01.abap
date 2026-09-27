*----------------------------------------------------------------------*
***INCLUDE ZCS_ZAEHLER_FAKTURA_F01.
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Form VERTRAEGE_LESEN
*&---------------------------------------------------------------------*
* Kontraktpositionen mit Zählerabrechnung, Laufzeit überlappt Periode
*----------------------------------------------------------------------*
FORM vertraege_lesen.
  SELECT k~vbeln p~posnr k~kunnr k~vkorg k~vtweg k~spart k~knumv
         p~matnr p~zzfrei
    INTO CORRESPONDING FIELDS OF TABLE gt_ctr
    FROM vbak AS k
    INNER JOIN vbap AS p ON p~vbeln = k~vbeln
    INNER JOIN veda AS v ON v~vbeln = k~vbeln AND v~vposn = '000000'
    WHERE k~vbtyp    = 'G'
      AND k~vkorg    IN s_vkorg
      AND k~vbeln    IN s_vbeln
      AND k~kunnr    IN s_kunnr
      AND p~zzabrart = 'Z'
      AND v~vbegdat  <= p_bis
      AND v~venddat  >= p_von.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form OBJEKTE_LESEN
*&---------------------------------------------------------------------*
* Equipments der Vertragspositionen (Objektliste SER02/OBJK)
*----------------------------------------------------------------------*
FORM objekte_lesen.
  SELECT s~sdaufnr AS vbeln s~posnr o~equnr
    INTO CORRESPONDING FIELDS OF TABLE gt_obj
    FROM ser02 AS s
    INNER JOIN objk AS o ON o~obknr = s~obknr
    FOR ALL ENTRIES IN gt_ctr
    WHERE s~sdaufnr = gt_ctr-vbeln
      AND s~posnr   = gt_ctr-posnr
      AND o~equnr   <> space.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form VERBRAUCH_ERMITTELN
*&---------------------------------------------------------------------*
* Verbrauch je Equipment über den Abrechnungszähler (PSORT ABRECHNUNG)
*----------------------------------------------------------------------*
FORM verbrauch_ermitteln.
  DATA: lx_meter TYPE REF TO zcx_cs_meter,
        lv_text  TYPE string.

  LOOP AT gt_obj ASSIGNING FIELD-SYMBOL(<ls_obj>).
    SELECT SINGLE p~point FROM imptt AS p
      INNER JOIN equi AS e ON e~objnr = p~mpobj
      WHERE e~equnr = @<ls_obj>-equnr
        AND p~psort = 'ABRECHNUNG'
        AND p~indct = 'X'
        AND p~inact = @space
      INTO @DATA(lv_point).
    IF sy-subrc <> 0.
      WRITE: / 'Equipment', <ls_obj>-equnr, 'ohne Abrechnungszähler'.
      CONTINUE.
    ENDIF.

    TRY.
        <ls_obj>-menge = zcl_cs_meter_period=>usage( iv_point = lv_point
                                                     iv_von   = p_von
                                                     iv_bis   = p_bis ).
      CATCH zcx_cs_meter INTO lx_meter.
        lv_text = lx_meter->get_text( ).
        WRITE: / 'Equipment', <ls_obj>-equnr, lv_text.
    ENDTRY.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form PREISE_LESEN
*&---------------------------------------------------------------------*
* Preis je Zähleinheit: Kondition ZCPK im Vertrag
*----------------------------------------------------------------------*
FORM preise_lesen.
  SELECT * FROM konv INTO TABLE gt_konv
    FOR ALL ENTRIES IN gt_ctr
    WHERE knumv = gt_ctr-knumv
      AND kschl = 'ZCPK'.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form ABRECHNUNG_BERECHNEN
*&---------------------------------------------------------------------*
FORM abrechnung_berechnen.
  DATA ls_bill TYPE ty_bill.

  LOOP AT gt_ctr INTO DATA(ls_ctr).
    CLEAR ls_bill.
    MOVE-CORRESPONDING ls_ctr TO ls_bill.

*   Verbrauch aller Equipments der Position
    ls_bill-menge  = REDUCE f( INIT lv_sum = CONV f( 0 )
                               FOR ls_o IN gt_obj
                               WHERE ( vbeln = ls_ctr-vbeln AND posnr = ls_ctr-posnr )
                               NEXT lv_sum = lv_sum + ls_o-menge ).
    ls_bill-frei   = ls_ctr-zzfrei.
    ls_bill-abrech = COND #( WHEN ls_bill-menge > ls_bill-frei
                             THEN ls_bill-menge - ls_bill-frei
                             ELSE 0 ).

    READ TABLE gt_konv INTO DATA(ls_konv)
         WITH TABLE KEY knumv = ls_ctr-knumv
                        kposn = ls_ctr-posnr.
    IF sy-subrc <> 0.
      WRITE: / 'Vertrag', ls_ctr-vbeln, ls_ctr-posnr, 'ohne Preis ZCPK'.
      CONTINUE.
    ENDIF.

    CATCH SYSTEM-EXCEPTIONS arithmetic_errors = 4.
      ls_bill-preis  = ls_konv-kbetr / ls_konv-kpein.
      ls_bill-betrag = ls_bill-abrech * ls_bill-preis.
    ENDCATCH.
    IF sy-subrc = 4.
      WRITE: / 'Vertrag', ls_ctr-vbeln, ls_ctr-posnr, 'Preis nicht berechenbar'.
      CONTINUE.
    ENDIF.

    ls_bill-waerk = ls_konv-waers.
    APPEND ls_bill TO gt_bill.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form LISTE_AUSGEBEN
*&---------------------------------------------------------------------*
FORM liste_ausgeben.
  SET PF-STATUS 'LISTE'.
  LOOP AT gt_bill INTO gs_bill.
    WRITE: / gs_bill-vbeln, gs_bill-posnr, gs_bill-kunnr,
             gs_bill-menge, gs_bill-frei, gs_bill-abrech,
             gs_bill-betrag CURRENCY gs_bill-waerk, gs_bill-waerk.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FAKTURIEREN
*&---------------------------------------------------------------------*
* Je Position mit Betrag eine Lastschriftanforderung ZL2 zum Vertrag
*----------------------------------------------------------------------*
FORM fakturieren.
  DATA: ls_hdr   TYPE bapisdhd1,
        lt_itm   TYPE STANDARD TABLE OF bapisditm,
        lt_par   TYPE STANDARD TABLE OF bapiparnr,
        lt_ret   TYPE STANDARD TABLE OF bapiret2,
        lv_vbeln TYPE vbak-vbeln,
        lv_msg   TYPE bapi_msg,
        lv_anz   TYPE i.

  LOOP AT gt_bill INTO DATA(ls_bill).
    CHECK ls_bill-betrag > 0.

*   dieselbe Periode nicht zweimal abrechnen
    SELECT SINGLE vbeln_lr FROM zcs_zf_log
      WHERE vbeln = @ls_bill-vbeln
        AND posnr = @ls_bill-posnr
        AND von   = @p_von
      INTO @DATA(lv_done).
    IF sy-subrc = 0.
      WRITE: / ls_bill-vbeln, ls_bill-posnr, 'bereits abgerechnet mit', lv_done.
      CONTINUE.
    ENDIF.

    DATA(ls_ctr) = gt_ctr[ vbeln = ls_bill-vbeln posnr = ls_bill-posnr ].
    CLEAR: lv_vbeln, lt_ret.
    ls_hdr = VALUE #( doc_type   = 'ZL2'
                      sales_org  = ls_ctr-vkorg
                      distr_chan = ls_ctr-vtweg
                      division   = ls_ctr-spart
                      ref_doc    = ls_bill-vbeln
                      refdoc_cat = 'G'
                      purch_no_c = |Zähler { p_von DATE = USER }-{ p_bis DATE = USER }| ).
    lt_itm = VALUE #( ( itm_number = '000010'
                        material   = ls_bill-matnr
                        target_qty = ls_bill-abrech
                        ref_doc    = ls_bill-vbeln
                        ref_doc_it = ls_bill-posnr
                        ref_doc_ca = 'G' ) ).
    lt_par = VALUE #( ( partn_role = 'AG' partn_numb = ls_bill-kunnr ) ).

    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in = ls_hdr
      IMPORTING
        salesdocument   = lv_vbeln
      TABLES
        return          = lt_ret
        order_items_in  = lt_itm
        order_partners  = lt_par.

    IF lv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      lv_msg = VALUE #( lt_ret[ type = 'E' ]-message OPTIONAL ).
      WRITE: / ls_bill-vbeln, ls_bill-posnr, 'Fehler:', lv_msg.
      CONTINUE.
    ENDIF.

    INSERT zcs_zf_log FROM @( VALUE #( vbeln    = ls_bill-vbeln
                                       posnr    = ls_bill-posnr
                                       von      = p_von
                                       bis      = p_bis
                                       menge    = ls_bill-abrech
                                       vbeln_lr = lv_vbeln
                                       erdat    = sy-datum ) ).
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.
    lv_anz = lv_anz + 1.
    WRITE: / ls_bill-vbeln, ls_bill-posnr, 'Lastschriftanforderung', lv_vbeln.
  ENDLOOP.

  MESSAGE s703(zcs) WITH lv_anz.
ENDFORM.
