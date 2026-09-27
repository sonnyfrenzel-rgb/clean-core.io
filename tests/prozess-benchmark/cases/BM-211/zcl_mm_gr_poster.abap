CLASS zcl_mm_gr_poster DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES tt_itm TYPE STANDARD TABLE OF e1zgr_itm WITH DEFAULT KEY.

    EVENTS posted
      EXPORTING VALUE(ev_docnum) TYPE edi_docnum
                VALUE(ev_mblnr)  TYPE mblnr.
    EVENTS failed
      EXPORTING VALUE(ev_docnum) TYPE edi_docnum
                VALUE(ev_code)   TYPE char4
                VALUE(ev_ebeln)  TYPE ebeln.

    METHODS post
      IMPORTING iv_docnum       TYPE edi_docnum
                is_hdr          TYPE e1zgr_hdr
                it_itm          TYPE tt_itm
      RETURNING VALUE(rv_mblnr) TYPE mblnr
      RAISING   zcx_mm_gr.

  PRIVATE SECTION.
    METHODS fail
      IMPORTING iv_docnum TYPE edi_docnum
                iv_code   TYPE char4
                iv_ebeln  TYPE ebeln
      RAISING   zcx_mm_gr.
ENDCLASS.



CLASS zcl_mm_gr_poster IMPLEMENTATION.

  METHOD post.
    DATA: ls_head     TYPE bapi2017_gm_head_01,
          lt_items    TYPE STANDARD TABLE OF bapi2017_gm_item_create,
          lt_return   TYPE STANDARD TABLE OF bapiret2,
          lv_received TYPE menge_d,
          lv_open     TYPE menge_d.

    SELECT SINGLE ebeln, loekz, frgke FROM ekko
      WHERE ebeln = @is_hdr-ebeln
      INTO @DATA(ls_ekko).
    IF sy-subrc <> 0 OR ls_ekko-loekz IS NOT INITIAL.
      fail( iv_docnum = iv_docnum iv_code = 'NOPO' iv_ebeln = is_hdr-ebeln ).
    ENDIF.
*   gesperrte (nicht freigegebene) Bestellung
    IF ls_ekko-frgke = 'B'.
      fail( iv_docnum = iv_docnum iv_code = 'BLCK' iv_ebeln = is_hdr-ebeln ).
    ENDIF.

    LOOP AT it_itm INTO DATA(ls_itm).
      SELECT SINGLE matnr, werks, lgort, menge, meins, uebto FROM ekpo
        WHERE ebeln = @is_hdr-ebeln
          AND ebelp = @ls_itm-ebelp
        INTO @DATA(ls_ekpo).
*     bisher gebuchte WE-Menge (Vorgang 1, Soll)
      SELECT SUM( menge ) FROM ekbe
        WHERE ebeln = @is_hdr-ebeln
          AND ebelp = @ls_itm-ebelp
          AND vgabe = '1'
          AND shkzg = 'S'
        INTO @lv_received.
      lv_open = ls_ekpo-menge * ( 100 + ls_ekpo-uebto ) / 100 - lv_received.
      IF ls_itm-menge > lv_open.
        fail( iv_docnum = iv_docnum iv_code = 'OVER' iv_ebeln = is_hdr-ebeln ).
      ENDIF.
      APPEND VALUE #( material  = ls_ekpo-matnr
                      plant     = ls_ekpo-werks
                      stge_loc  = ls_ekpo-lgort
                      move_type = '101'
                      mvt_ind   = 'B'
                      po_number = is_hdr-ebeln
                      po_item   = ls_itm-ebelp
                      entry_qnt = ls_itm-menge
                      entry_uom = ls_ekpo-meins ) TO lt_items.
    ENDLOOP.

    ls_head-pstng_date = is_hdr-budat.
    ls_head-doc_date   = sy-datum.
    ls_head-ref_doc_no = is_hdr-lifex.

    CALL FUNCTION 'BAPI_GOODSMVT_CREATE'
      EXPORTING
        goodsmvt_header  = ls_head
        goodsmvt_code    = '01'
      IMPORTING
        materialdocument = rv_mblnr
      TABLES
        goodsmvt_item    = lt_items
        return           = lt_return.
    IF rv_mblnr IS INITIAL.
      fail( iv_docnum = iv_docnum iv_code = 'BAPI' iv_ebeln = is_hdr-ebeln ).
    ENDIF.

    RAISE EVENT posted EXPORTING ev_docnum = iv_docnum ev_mblnr = rv_mblnr.
  ENDMETHOD.


  METHOD fail.
    RAISE EVENT failed
      EXPORTING ev_docnum = iv_docnum
                ev_code   = iv_code
                ev_ebeln  = iv_ebeln.
    RAISE EXCEPTION TYPE zcx_mm_gr
      EXPORTING
        code = iv_code.
  ENDMETHOD.

ENDCLASS.
