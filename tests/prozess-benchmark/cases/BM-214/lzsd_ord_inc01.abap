*----------------------------------------------------------------------*
* Include LZSD_ORD_INC01 - Mapper, Auftragshandler, Fabrik
*----------------------------------------------------------------------*
CLASS lcx_order_in DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_text TYPE string.
ENDCLASS.

CLASS lcx_order_in IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_text = iv_text.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Mapper: IDoc-Segmente -> Auftragsstruktur
*----------------------------------------------------------------------*
CLASS lcl_order_mapper DEFINITION.
  PUBLIC SECTION.
    METHODS map
      IMPORTING iv_docnum       TYPE edi_docnum
                iv_sndprn       TYPE edi_sndprn
                it_edidd        TYPE edidd_tt
      RETURNING VALUE(rs_order) TYPE ty_order
      RAISING   lcx_order_in.
ENDCLASS.

CLASS lcl_order_mapper IMPLEMENTATION.
  METHOD map.
    DATA: ls_k01  TYPE e1edk01,
          ls_p01  TYPE e1edp01,
          ls_p19  TYPE e1edp19,
          ls_item TYPE ty_item,
          lt_ka1  TYPE STANDARD TABLE OF e1edka1,
          lt_k02  TYPE STANDARD TABLE OF e1edk02,
          lt_k03  TYPE STANDARD TABLE OF e1edk03.

    rs_order-docnum = iv_docnum.
    rs_order-sndprn = iv_sndprn.

    READ TABLE it_edidd INTO DATA(ls_d)
      WITH KEY docnum = iv_docnum
               segnam = 'E1EDK01'.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = 'Kopfsegment E1EDK01 fehlt'.
    ENDIF.
    ls_k01 = ls_d-sdata.
    rs_order-bsart = ls_k01-bsart.

    lt_ka1 = VALUE #( FOR d IN it_edidd
                      WHERE ( docnum = iv_docnum AND segnam = 'E1EDKA1' )
                      ( CONV #( d-sdata ) ) ).
    lt_k02 = VALUE #( FOR d IN it_edidd
                      WHERE ( docnum = iv_docnum AND segnam = 'E1EDK02' )
                      ( CONV #( d-sdata ) ) ).
    lt_k03 = VALUE #( FOR d IN it_edidd
                      WHERE ( docnum = iv_docnum AND segnam = 'E1EDK03' )
                      ( CONV #( d-sdata ) ) ).

    rs_order-kunag = VALUE #( lt_ka1[ parvw = 'AG' ]-partn OPTIONAL ).
    rs_order-kunwe = VALUE #( lt_ka1[ parvw = 'WE' ]-partn DEFAULT rs_order-kunag ).
    rs_order-bstkd = VALUE #( lt_k02[ qualf = '001' ]-belnr OPTIONAL ).
    rs_order-bstdk = VALUE #( lt_k02[ qualf = '001' ]-datum OPTIONAL ).
    rs_order-vdatu = VALUE #( lt_k03[ iddat = '002' ]-datum OPTIONAL ).
*   Vertriebsbereich fest je Partner (Pflege ueber Partnervereinbarung)
    rs_order-vkorg = '1000'.
    rs_order-vtweg = '20'.
    rs_order-spart = '00'.

    IF rs_order-kunag IS INITIAL.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = 'Auftraggeber (AG) fehlt'.
    ENDIF.

    LOOP AT it_edidd INTO ls_d WHERE docnum = iv_docnum
                                 AND segnam = 'E1EDP01'.
      ls_p01 = ls_d-sdata.
      CLEAR ls_item.
      ls_item-posex = ls_p01-posex.
      ls_item-menge = ls_p01-menge.
      ls_item-vrkme = ls_p01-menee.
*     Kundenmaterial aus Untersegment E1EDP19
      DATA(ls_d19) = VALUE edidd( it_edidd[ docnum = iv_docnum
                                            segnam = 'E1EDP19'
                                            psgnum = ls_d-segnum ] OPTIONAL ).
      ls_p19 = ls_d19-sdata.
      ls_item-kdmat = ls_p19-idtnr.
      ls_item-matnr = zcl_sd_cust_mat_map=>to_material( iv_kunnr = rs_order-kunag
                                                        iv_vkorg = rs_order-vkorg
                                                        iv_vtweg = rs_order-vtweg
                                                        iv_kdmat = ls_item-kdmat ).
      IF ls_item-matnr IS INITIAL.
        RAISE EXCEPTION TYPE lcx_order_in
          EXPORTING iv_text = |Kundenmaterial { ls_item-kdmat } unbekannt|.
      ENDIF.
      APPEND ls_item TO rs_order-items.
    ENDLOOP.

    IF rs_order-items IS INITIAL.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = 'Keine Positionen im IDoc'.
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Handler
*----------------------------------------------------------------------*
INTERFACE lif_order_handler.
  METHODS process
    CHANGING  cs_order        TYPE ty_order
    RETURNING VALUE(rv_vbeln) TYPE vbeln_va
    RAISING   lcx_order_in.
ENDINTERFACE.

CLASS lcl_handler_standard DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_order_handler.
  PROTECTED SECTION.
    METHODS check
      IMPORTING is_order TYPE ty_order
      RAISING   lcx_order_in.
    METHODS enrich
      CHANGING cs_order TYPE ty_order.
    METHODS create
      IMPORTING is_order        TYPE ty_order
      RETURNING VALUE(rv_vbeln) TYPE vbeln_va
      RAISING   lcx_order_in.
ENDCLASS.

CLASS lcl_handler_rush DEFINITION INHERITING FROM lcl_handler_standard.
  PROTECTED SECTION.
    METHODS check REDEFINITION.
    METHODS enrich REDEFINITION.
ENDCLASS.

CLASS lcl_handler_consignment DEFINITION INHERITING FROM lcl_handler_standard.
  PROTECTED SECTION.
    METHODS check REDEFINITION.
    METHODS enrich REDEFINITION.
  PRIVATE SECTION.
    DATA mv_consi_werks TYPE werks_d.
ENDCLASS.

CLASS lcl_handler_standard IMPLEMENTATION.
  METHOD lif_order_handler~process.
    check( cs_order ).
    enrich( CHANGING cs_order = cs_order ).
    rv_vbeln = create( cs_order ).
  ENDMETHOD.

  METHOD check.
*   Auftragssperre des Kunden im Vertriebsbereich
    SELECT SINGLE aufsd FROM knvv INTO @DATA(lv_aufsd)
      WHERE kunnr = @is_order-kunag
        AND vkorg = @is_order-vkorg
        AND vtweg = @is_order-vtweg
        AND spart = @is_order-spart.
    IF sy-subrc <> 0 OR lv_aufsd IS NOT INITIAL.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = |Kunde { is_order-kunag } gesperrt oder nicht angelegt|.
    ENDIF.
*   vertriebsspezifischer Materialstatus
    LOOP AT is_order-items INTO DATA(ls_item).
      SELECT SINGLE vmsta FROM mvke INTO @DATA(lv_vmsta)
        WHERE matnr = @ls_item-matnr
          AND vkorg = @is_order-vkorg
          AND vtweg = @is_order-vtweg.
      IF lv_vmsta IS NOT INITIAL.
        RAISE EXCEPTION TYPE lcx_order_in
          EXPORTING iv_text = |Material { ls_item-matnr } fuer Verkauf gesperrt|.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD enrich.
    cs_order-auart = gc_auart_std.
    IF cs_order-vdatu IS INITIAL.
      cs_order-vdatu = sy-datum + 2.            " Standardlieferzeit 2 Tage
    ENDIF.
*   Auslieferwerk je Warenempfaenger, sonst aus Materialstamm
    LOOP AT cs_order-items ASSIGNING FIELD-SYMBOL(<ls_item>).
      SELECT SINGLE werks FROM zsd_plant_det INTO <ls_item>-werks
        WHERE kunwe = cs_order-kunwe
          AND matnr = <ls_item>-matnr.
      IF sy-subrc <> 0.
        SELECT SINGLE dwerk FROM mvke INTO <ls_item>-werks
          WHERE matnr = <ls_item>-matnr
            AND vkorg = cs_order-vkorg
            AND vtweg = cs_order-vtweg.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD create.
    DATA: ls_header  TYPE bapisdhd1,
          lt_items   TYPE STANDARD TABLE OF bapisditm,
          lt_partner TYPE STANDARD TABLE OF bapiparnr,
          lt_sched   TYPE STANDARD TABLE OF bapischdl,
          lt_return  TYPE STANDARD TABLE OF bapiret2.

    ls_header = VALUE #( doc_type   = is_order-auart
                         sales_org  = is_order-vkorg
                         distr_chan = is_order-vtweg
                         division   = is_order-spart
                         purch_no_c = is_order-bstkd
                         purch_date = is_order-bstdk
                         req_date_h = is_order-vdatu
                         ship_cond  = is_order-vsbed ).
    lt_partner = VALUE #( ( partn_role = 'AG' partn_numb = is_order-kunag )
                          ( partn_role = 'WE' partn_numb = is_order-kunwe ) ).
    lt_items = VALUE #( FOR i IN is_order-items INDEX INTO idx
                        ( itm_number = idx * 10
                          material   = i-matnr
                          plant      = i-werks
                          cust_mat35 = i-kdmat
                          po_itm_no  = i-posex ) ).
    lt_sched = VALUE #( FOR i IN is_order-items INDEX INTO idx
                        ( itm_number = idx * 10
                          req_qty    = i-menge
                          req_date   = is_order-vdatu ) ).

    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in    = ls_header
      IMPORTING
        salesdocument      = rv_vbeln
      TABLES
        return             = lt_return
        order_items_in     = lt_items
        order_partners     = lt_partner
        order_schedules_in = lt_sched.

    IF rv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = VALUE #( lt_return[ type = 'E' ]-message
                                     DEFAULT 'Auftrag nicht angelegt' ).
    ENDIF.
*   Commit im Baustein (Altstand, ALE-Commit reicht fuer BAPI-Folgebelege nicht)
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_handler_rush IMPLEMENTATION.
  METHOD check.
    super->check( is_order ).
*   Eilauftraege nur bis Annahmeschluss
    IF sy-uzeit > gc_cutoff.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = 'Eilauftrag nach Annahmeschluss 14:00'.
    ENDIF.
  ENDMETHOD.

  METHOD enrich.
    super->enrich( CHANGING cs_order = cs_order ).
    cs_order-vsbed = '01'.                     " Versand sofort
    cs_order-vdatu = sy-datum.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_handler_consignment IMPLEMENTATION.
  METHOD check.
*   keine Kundensperrpruefung - Auffuellung laeuft ueber Konsignationsvertrag
    SELECT SINGLE werks FROM zsd_consi_agr INTO mv_consi_werks
      WHERE kunnr = is_order-kunag
        AND datbi >= sy-datum.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_order_in
        EXPORTING iv_text = |Kein gueltiger Konsignationsvertrag fuer { is_order-kunag }|.
    ENDIF.
  ENDMETHOD.

  METHOD enrich.
    cs_order-auart = gc_auart_kb.
    MODIFY cs_order-items FROM VALUE #( werks = mv_consi_werks )
      TRANSPORTING werks WHERE werks <> mv_consi_werks.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Fabrik: Handler je Partner und Bestellart
*----------------------------------------------------------------------*
CLASS lcl_handler_factory DEFINITION.
  PUBLIC SECTION.
    CLASS-METHODS get
      IMPORTING is_order          TYPE ty_order
      RETURNING VALUE(ro_handler) TYPE REF TO lif_order_handler.
ENDCLASS.

CLASS lcl_handler_factory IMPLEMENTATION.
  METHOD get.
    DATA lv_handler TYPE char10.
    SELECT SINGLE handler FROM zsd_ord_typemap INTO lv_handler
      WHERE sndprn = is_order-sndprn
        AND bsart  = is_order-bsart.
    CASE lv_handler.
      WHEN 'RUSH'.
        ro_handler = NEW lcl_handler_rush( ).
      WHEN 'CONSI'.
        ro_handler = NEW lcl_handler_consignment( ).
      WHEN OTHERS.
        ro_handler = NEW lcl_handler_standard( ).
    ENDCASE.
  ENDMETHOD.
ENDCLASS.
