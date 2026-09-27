CLASS zcl_sd_delivery_builder DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: tt_vbeln TYPE STANDARD TABLE OF vbeln_va WITH DEFAULT KEY,
           tt_r_vbeln TYPE RANGE OF vbeln_va,
           tt_r_vkorg TYPE RANGE OF vkorg.

    METHODS select_due
      IMPORTING it_vbeln         TYPE tt_r_vbeln
                it_vkorg         TYPE tt_r_vkorg
                iv_ledat         TYPE ledat
      RETURNING VALUE(rt_vbeln)  TYPE tt_vbeln.

    METHODS create_for_order
      IMPORTING iv_vbeln TYPE vbeln_va
                io_log   TYPE REF TO zcl_sd_app_log
                iv_test  TYPE abap_bool
      RAISING   zcx_sd_delivery.
ENDCLASS.



CLASS zcl_sd_delivery_builder IMPLEMENTATION.

  METHOD select_due.
*   offene Auftraege mit bestaetigter, faelliger Einteilung
    SELECT DISTINCT k~vbeln
      FROM vbak AS k
      INNER JOIN vbup AS u ON u~vbeln = k~vbeln
      INNER JOIN vbep AS e ON e~vbeln = u~vbeln
                          AND e~posnr = u~posnr
      INTO TABLE rt_vbeln
      WHERE k~vbeln IN it_vbeln
        AND k~vkorg IN it_vkorg
        AND k~lifsk = space
        AND u~lfsta IN ('A', 'B')
        AND e~edatu <= iv_ledat
        AND e~bmeng > 0.
  ENDMETHOD.


  METHOD create_for_order.
    DATA: lt_items  TYPE STANDARD TABLE OF bapidlvreftosalesorder,
          lt_return TYPE STANDARD TABLE OF bapiret2,
          lv_deliv  TYPE vbeln_vl,
          lv_cmgst  TYPE cmgst.

*   Kreditstatus Kopf (VBUK) - gesperrte Auftraege nicht beliefern
    SELECT SINGLE cmgst FROM vbuk INTO lv_cmgst
      WHERE vbeln = iv_vbeln.
    IF lv_cmgst CA 'BC'.
      RAISE EXCEPTION TYPE zcx_sd_delivery
        EXPORTING
          textid = zcx_sd_delivery=>credit_block
          vbeln  = iv_vbeln.
    ENDIF.

*   alle nicht abgesagten Positionen als Referenz
    SELECT vbeln AS ref_doc, posnr AS ref_item
      FROM vbap
      WHERE vbeln = @iv_vbeln
        AND abgru = @space
      INTO CORRESPONDING FIELDS OF TABLE @lt_items.

    CALL FUNCTION 'BAPI_OUTB_DELIVERY_CREATE_SLS'
      EXPORTING
        due_date          = sy-datum
      IMPORTING
        delivery          = lv_deliv
      TABLES
        sales_order_items = lt_items
        return            = lt_return.

    io_log->add_bapiret( lt_return ).

    IF lv_deliv IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE zcx_sd_delivery
        EXPORTING
          textid = zcx_sd_delivery=>not_created
          vbeln  = iv_vbeln.
    ENDIF.

*   Testmodus: Lieferung verwerfen
    IF iv_test = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RETURN.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDMETHOD.

ENDCLASS.
