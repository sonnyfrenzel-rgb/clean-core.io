CLASS zcl_gm_sponsor_billing DEFINITION PUBLIC FINAL CREATE PUBLIC.
*----------------------------------------------------------------------*
* Grants Management - kostenbasierte Abrechnung an den Sponsor
* Förderfähig = Ist-Ausgaben der Förderung bis Stichtag abzüglich
* nicht förderfähiger Sponsored Classes (ZGM_UNALLOW je Fördertyp),
* abzüglich bereits abgerechneter Beträge (ZGM_BILLED).
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_result,
             grant_nbr TYPE gm_grant_nbr,
             betrag    TYPE zgm_betrag,
             vbeln     TYPE vbeln_va,
             text      TYPE bapi_msg,
           END OF ty_result,
           tt_result      TYPE STANDARD TABLE OF ty_result WITH EMPTY KEY,
           tt_grant_range TYPE RANGE OF gm_grant_nbr.

    METHODS constructor
      IMPORTING iv_bukrs TYPE bukrs
                iv_bis   TYPE datum
                iv_test  TYPE abap_bool.
    METHODS run
      IMPORTING it_grant         TYPE tt_grant_range
      RETURNING VALUE(rt_result) TYPE tt_result
      RAISING   zcx_gm_billing.

  PRIVATE SECTION.
    DATA: mv_bukrs TYPE bukrs,
          mv_bis   TYPE datum,
          mv_test  TYPE abap_bool.

    METHODS bill_grant
      IMPORTING is_grant         TYPE gmgr
      RETURNING VALUE(rs_result) TYPE ty_result.
    METHODS create_request
      IMPORTING is_grant        TYPE gmgr
                iv_kunnr        TYPE kunnr
                iv_betrag       TYPE zgm_betrag
      RETURNING VALUE(rv_vbeln) TYPE vbeln_va
      RAISING   zcx_gm_locked
                zcx_gm_billing.
ENDCLASS.

CLASS zcl_gm_sponsor_billing IMPLEMENTATION.

  METHOD constructor.
    mv_bukrs = iv_bukrs.
    mv_bis   = iv_bis.
    mv_test  = iv_test.
  ENDMETHOD.

  METHOD run.
*   nur Förderungen mit kostenbasierter Abrechnungsregel (Kundenfeld)
    SELECT * FROM gmgr
      WHERE grant_nbr   IN @it_grant
        AND bukrs       =  @mv_bukrs
        AND zz_billrule =  'KB'
        AND valid_to    >= @mv_bis
      INTO TABLE @DATA(lt_grant).
    IF lt_grant IS INITIAL.
      RAISE EXCEPTION TYPE zcx_gm_billing
        EXPORTING textid = zcx_gm_billing=>no_grants.
    ENDIF.

    LOOP AT lt_grant INTO DATA(ls_grant).
      APPEND bill_grant( ls_grant ) TO rt_result.
    ENDLOOP.
  ENDMETHOD.

  METHOD bill_grant.
    DATA: lv_ausgaben TYPE zgm_betrag,
          lv_try      TYPE i.

    rs_result-grant_nbr = is_grant-grant_nbr.

    SELECT sponsored_class FROM zgm_unallow
      WHERE grant_type = @is_grant-grant_type
      INTO TABLE @DATA(lt_unallow).

    SELECT rsponsored_class, SUM( hsl ) AS betrag
      FROM gmia
      WHERE rgrant_nbr = @is_grant-grant_nbr
        AND budat     <= @mv_bis
      GROUP BY rsponsored_class
      INTO TABLE @DATA(lt_kosten).

    LOOP AT lt_kosten INTO DATA(ls_k).
      IF line_exists( lt_unallow[ table_line = ls_k-rsponsored_class ] ).
        CONTINUE.
      ENDIF.
      lv_ausgaben = lv_ausgaben + ls_k-betrag.
    ENDLOOP.

    SELECT SUM( betrag ) FROM zgm_billed
      WHERE grant_nbr = @is_grant-grant_nbr
      INTO @DATA(lv_abgerechnet).

    rs_result-betrag = lv_ausgaben - lv_abgerechnet.
    IF rs_result-betrag <= 0.
      rs_result-text = 'Nichts abzurechnen'.
      RETURN.
    ENDIF.
    IF mv_test = abap_true.
      rs_result-text = 'Testlauf - keine Anforderung'.
      RETURN.
    ENDIF.

    SELECT SINGLE customer FROM gmsponsor
      WHERE sponsor = @is_grant-sponsor
      INTO @DATA(lv_kunnr).

    TRY.
        lv_try = lv_try + 1.
        rs_result-vbeln = create_request( is_grant  = is_grant
                                          iv_kunnr  = lv_kunnr
                                          iv_betrag = rs_result-betrag ).
        INSERT zgm_billed FROM @( VALUE zgm_billed( grant_nbr = is_grant-grant_nbr
                                                    billed_to = mv_bis
                                                    vbeln     = rs_result-vbeln
                                                    betrag    = rs_result-betrag ) ).
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        rs_result-text = 'Lastschriftanforderung angelegt'.
      CATCH zcx_gm_locked.
        IF lv_try < 3.
          WAIT UP TO 2 SECONDS.
          RETRY.
        ENDIF.
        rs_result-text = 'Sponsor gesperrt - nächster Lauf'.
      CATCH zcx_gm_billing INTO DATA(lx_bill).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        rs_result-text = lx_bill->get_text( ).
    ENDTRY.
  ENDMETHOD.

  METHOD create_request.
    DATA: lt_items   TYPE STANDARD TABLE OF bapisditm,
          lt_partner TYPE STANDARD TABLE OF bapiparnr,
          lt_cond    TYPE STANDARD TABLE OF bapicond,
          lt_ret     TYPE STANDARD TABLE OF bapiret2.

    DATA(ls_header) = VALUE bapisdhd1( doc_type   = 'ZGMA'
                                       sales_org  = '1000'
                                       distr_chan = '10'
                                       division   = '00'
                                       purch_no_c = is_grant-grant_nbr
                                       ord_reason = 'GM1' ).
    lt_items   = VALUE #( ( itm_number = '000010' material = 'GM-ABRECHNUNG' target_qty = 1 ) ).
    lt_partner = VALUE #( ( partn_role = 'AG' partn_numb = iv_kunnr ) ).
    lt_cond    = VALUE #( ( itm_number = '000010' cond_type = 'ZGM0'
                            cond_value = iv_betrag currency = 'EUR' ) ).

    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in     = ls_header
      IMPORTING
        salesdocument       = rv_vbeln
      TABLES
        return              = lt_ret
        order_items_in      = lt_items
        order_partners      = lt_partner
        order_conditions_in = lt_cond.

*   V1 042: Kunde/Beleg wird gerade bearbeitet
    IF line_exists( lt_ret[ type = 'E' id = 'V1' number = '042' ] ).
      RAISE EXCEPTION TYPE zcx_gm_locked.
    ENDIF.
    IF rv_vbeln IS INITIAL.
      RAISE EXCEPTION TYPE zcx_gm_billing
        EXPORTING textid = zcx_gm_billing=>create_failed.
    ENDIF.
  ENDMETHOD.
ENDCLASS.
