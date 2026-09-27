CLASS zcl_mm_infrec_price_handler DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Paket-Handler: Einkaufsinfosatz-Preise aus ZMM_PRICE_STG per ME12 (BDC)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES zif_par_package_handler.

    TYPES ty_t_stg TYPE STANDARD TABLE OF zmm_price_stg WITH EMPTY KEY.

  PRIVATE SECTION.
    CONSTANTS gc_max_change_pct TYPE p LENGTH 5 DECIMALS 2 VALUE '20.00'.

    METHODS update_price
      IMPORTING is_stg        TYPE zmm_price_stg
      EXPORTING ev_ok         TYPE abap_bool
                ev_message    TYPE bapi_msg.
ENDCLASS.



CLASS zcl_mm_infrec_price_handler IMPLEMENTATION.

  METHOD zif_par_package_handler~process.
    DATA: lt_stg TYPE ty_t_stg,
          lv_ok  TYPE abap_bool,
          lv_msg TYPE bapi_msg.

    rs_result-package_id = iv_package_id.

    CALL TRANSFORMATION id SOURCE XML iv_payload RESULT data = lt_stg.

    LOOP AT lt_stg INTO DATA(ls_stg).
*     Infosatz vorhanden?
      SELECT SINGLE infnr FROM eina INTO @DATA(lv_infnr)
        WHERE matnr = @ls_stg-matnr
          AND lifnr = @ls_stg-lifnr
          AND loekz = @space.
      IF sy-subrc <> 0.
        lv_ok  = abap_false.
        lv_msg = 'Kein Einkaufsinfosatz'.
      ELSEIF ls_stg-old_price > 0
         AND abs( ls_stg-new_price - ls_stg-old_price ) * 100 / ls_stg-old_price > gc_max_change_pct
         AND ls_stg-approved = abap_false.
*       grosse Preisaenderung nur mit Freigabe des Einkaufsleiters
        lv_ok  = abap_false.
        lv_msg = 'Preisaenderung > 20 % ohne Freigabe'.
      ELSE.
        update_price( EXPORTING is_stg     = ls_stg
                      IMPORTING ev_ok      = lv_ok
                                ev_message = lv_msg ).
      ENDIF.

      IF lv_ok = abap_true.
        UPDATE zmm_price_stg SET status = 'P' msgtxt = space
          WHERE guid = ls_stg-guid.
        rs_result-ok_count = rs_result-ok_count + 1.
      ELSE.
        UPDATE zmm_price_stg SET status = 'E' msgtxt = lv_msg
          WHERE guid = ls_stg-guid.
        rs_result-err_count = rs_result-err_count + 1.
      ENDIF.
    ENDLOOP.

    COMMIT WORK.
  ENDMETHOD.


  METHOD update_price.
    DATA: lt_bdc TYPE STANDARD TABLE OF bdcdata,
          lt_msg TYPE STANDARD TABLE OF bdcmsgcoll,
          lv_prc TYPE c LENGTH 15,
          lv_dat TYPE c LENGTH 10.

    WRITE is_stg-new_price TO lv_prc CURRENCY is_stg-waers NO-GROUPING LEFT-JUSTIFIED.
    WRITE is_stg-valid_from TO lv_dat DD/MM/YYYY.

    lt_bdc = VALUE #(
      ( program = 'SAPMM06I' dynpro = '0100' dynbegin = 'X' )
      ( fnam = 'EINA-LIFNR' fval = is_stg-lifnr )
      ( fnam = 'EINA-MATNR' fval = is_stg-matnr )
      ( fnam = 'EINE-EKORG' fval = is_stg-ekorg )
      ( fnam = 'EINE-WERKS' fval = is_stg-werks )
      ( fnam = 'RM06I-NORMB' fval = 'X' )
      ( fnam = 'BDC_OKCODE' fval = '=KO' )
      ( program = 'SAPMV13A' dynpro = '0201' dynbegin = 'X' )
      ( fnam = 'RV13A-DATAB' fval = lv_dat )
      ( fnam = 'KONP-KBETR(01)' fval = lv_prc )
      ( fnam = 'BDC_OKCODE' fval = '=SICH' ) ).

    CALL TRANSACTION 'ME12' USING lt_bdc
      MODE 'N'
      UPDATE 'S'
      MESSAGES INTO lt_msg.

    READ TABLE lt_msg INTO DATA(ls_msg) WITH KEY msgtyp = 'E'.
    IF sy-subrc = 0.
      ev_ok = abap_false.
      MESSAGE ID ls_msg-msgid TYPE 'S' NUMBER ls_msg-msgnr
        WITH ls_msg-msgv1 ls_msg-msgv2 ls_msg-msgv3 ls_msg-msgv4
        INTO ev_message.
    ELSE.
      ev_ok = abap_true.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
