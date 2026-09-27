CLASS zcl_sd_billing_run DEFINITION
  PUBLIC
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_due,
             vbeln TYPE vbeln_vl,
             vkorg TYPE vkorg,
           END OF ty_due,
           tt_due     TYPE STANDARD TABLE OF ty_due WITH DEFAULT KEY,
           tt_vbeln   TYPE STANDARD TABLE OF vbeln_vf WITH DEFAULT KEY,
           tt_r_vkorg TYPE RANGE OF vkorg,
           tt_r_wadat TYPE RANGE OF wadat_ist.

    METHODS constructor
      IMPORTING it_vkorg TYPE tt_r_vkorg
                iv_kind  TYPE char1 DEFAULT 'N'
      RAISING   zcx_sd_billing.
    METHODS run
      IMPORTING it_wadat        TYPE tt_r_wadat
      RETURNING VALUE(rv_count) TYPE i
      RAISING   zcx_sd_billing.

  PROTECTED SECTION.
    TYPES: BEGIN OF ty_cfg,
             vkorg TYPE vkorg,
             fkart TYPE fkart,
           END OF ty_cfg.
    DATA: mt_cfg   TYPE SORTED TABLE OF ty_cfg WITH UNIQUE KEY vkorg,
          mt_vkorg TYPE tt_r_vkorg.

    METHODS select_due
      IMPORTING it_wadat      TYPE tt_r_wadat
      RETURNING VALUE(rt_due) TYPE tt_due.
    METHODS create_billing
      IMPORTING it_due            TYPE tt_due
      RETURNING VALUE(rt_created) TYPE tt_vbeln
      RAISING   zcx_sd_billing.
    METHODS post_process
      IMPORTING it_created TYPE tt_vbeln.
ENDCLASS.



CLASS zcl_sd_billing_run IMPLEMENTATION.

  METHOD constructor.
    mt_vkorg = it_vkorg.
*   Fakturaart je Verkaufsorganisation und Art (N normal, I Intercompany)
    SELECT vkorg fkart FROM zsd_bill_cfg
      INTO TABLE mt_cfg
      WHERE vkorg IN it_vkorg
        AND kind  = iv_kind.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_sd_billing
        EXPORTING
          textid = zcx_sd_billing=>no_config.
    ENDIF.
  ENDMETHOD.


  METHOD run.
    DATA(lt_due) = select_due( it_wadat ).
    IF lt_due IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lt_created) = create_billing( lt_due ).
    post_process( lt_created ).
    rv_count = lines( lt_created ).
  ENDMETHOD.


  METHOD select_due.
*   WA gebucht, Faktura offen (Status aus VBUK)
    SELECT l~vbeln, l~vkorg
      FROM likp AS l
      INNER JOIN vbuk AS u ON u~vbeln = l~vbeln
      WHERE l~vkorg     IN @mt_vkorg
        AND l~wadat_ist IN @it_wadat
        AND u~wbstk     = 'C'
        AND u~fkstk     IN ('A', 'B')
      INTO TABLE @rt_due.
  ENDMETHOD.


  METHOD create_billing.
    DATA: lt_in      TYPE STANDARD TABLE OF bapivbrk,
          lt_return  TYPE STANDARD TABLE OF bapiret1,
          lt_success TYPE STANDARD TABLE OF bapivbrksuccess.

    LOOP AT it_due INTO DATA(ls_due).
      READ TABLE mt_cfg INTO DATA(ls_cfg)
        WITH TABLE KEY vkorg = ls_due-vkorg.
      IF sy-subrc <> 0.
        CONTINUE.                       " VkOrg ohne Fakturaart
      ENDIF.
      APPEND VALUE #( ref_doc    = ls_due-vbeln
                      ref_doc_ca = 'J'
                      ordbilltyp = ls_cfg-fkart
                      salesorg   = ls_due-vkorg
                      bill_date  = sy-datum ) TO lt_in.
    ENDLOOP.

    CALL FUNCTION 'BAPI_BILLINGDOC_CREATEMULTIPLE'
      TABLES
        billingdatain = lt_in
        return        = lt_return
        success       = lt_success.

    IF line_exists( lt_return[ type = 'E' ] ) AND lt_success IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE zcx_sd_billing
        EXPORTING
          textid = zcx_sd_billing=>nothing_billed.
    ENDIF.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    rt_created = VALUE #( FOR ls_s IN lt_success ( ls_s-bill_doc ) ).
  ENDMETHOD.


  METHOD post_process.
*   Hook fuer Unterklassen - Standardlauf ohne Nachbearbeitung
  ENDMETHOD.

ENDCLASS.
