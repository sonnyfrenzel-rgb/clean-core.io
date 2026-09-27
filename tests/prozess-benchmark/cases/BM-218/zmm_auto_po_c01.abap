*&---------------------------------------------------------------------*
*& Include ZMM_AUTO_PO_C01 - Bezugsquellenfindung und Bestellaufbau
*&---------------------------------------------------------------------*
CLASS lcx_no_source DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_text TYPE string.
ENDCLASS.

CLASS lcx_no_source IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_text = iv_text.
  ENDMETHOD.
ENDCLASS.

INTERFACE lif_source_strategy.
  METHODS find
    IMPORTING is_eban       TYPE ty_eban
    RETURNING VALUE(rs_src) TYPE ty_src.
ENDINTERFACE.

*----------------------------------------------------------------------*
* 1. gueltiger Mengen-/Wertkontrakt
*----------------------------------------------------------------------*
CLASS lcl_src_contract DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_source_strategy.
ENDCLASS.

CLASS lcl_src_contract IMPLEMENTATION.
  METHOD lif_source_strategy~find.
    SELECT SINGLE k~ebeln, p~ebelp, k~lifnr, k~ekorg, p~netpr
      FROM ekko AS k
      INNER JOIN ekpo AS p ON p~ebeln = k~ebeln
      WHERE k~bstyp = 'K'
        AND k~kdatb <= @sy-datum
        AND k~kdate >= @sy-datum
        AND k~loekz = @space
        AND p~loekz = @space
        AND p~matnr = @is_eban-matnr
        AND p~werks = @is_eban-werks
      INTO @DATA(ls_k).
    IF sy-subrc = 0.
      rs_src = VALUE #( lifnr = ls_k-lifnr ekorg = ls_k-ekorg
                        konnr = ls_k-ebeln ktpnr = ls_k-ebelp
                        netpr = ls_k-netpr quelle = 'KONTRAKT' ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* 2. Quotierung: Lieferant mit der niedrigsten Quotenzahl
*----------------------------------------------------------------------*
CLASS lcl_src_quota DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_source_strategy.
ENDCLASS.

CLASS lcl_src_quota IMPLEMENTATION.
  METHOD lif_source_strategy~find.
    DATA: lv_qunum  TYPE qunum,
          lv_lifnr  TYPE lifnr,
          lv_ekorg  TYPE ekorg,
          lv_quote  TYPE quote,
          lv_qubmg  TYPE menge_d,
          lv_qusom  TYPE menge_d,
          lv_rating TYPE p LENGTH 15 DECIMALS 5,
          lv_best   TYPE p LENGTH 15 DECIMALS 5 VALUE '999999999'.

    SELECT SINGLE qunum FROM equk INTO lv_qunum
      WHERE matnr = is_eban-matnr
        AND werks = is_eban-werks
        AND vdatu <= is_eban-lfdat
        AND bdatu >= is_eban-lfdat.
    IF sy-subrc <> 0.
      RETURN.
    ENDIF.

    SELECT lifnr ekorg quote qusom qubmg FROM equp
      INTO (lv_lifnr, lv_ekorg, lv_quote, lv_qusom, lv_qubmg)
      WHERE qunum = lv_qunum
        AND quote > 0.
*     Quotenzahl = (zugeordnete Menge + Basismenge) / Quote
      lv_rating = ( lv_qusom + lv_qubmg ) / lv_quote.
      IF lv_rating < lv_best.
        lv_best = lv_rating.
        rs_src = VALUE #( lifnr = lv_lifnr ekorg = lv_ekorg quelle = 'QUOTE' ).
      ENDIF.
    ENDSELECT.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* 3. Orderbuch (fester Lieferant), sonst beliebiger Infosatz
*----------------------------------------------------------------------*
CLASS lcl_src_inforec DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_source_strategy.
ENDCLASS.

CLASS lcl_src_inforec IMPLEMENTATION.
  METHOD lif_source_strategy~find.
    DATA lv_fixed TYPE lifnr.

    SELECT SINGLE lifnr FROM eord INTO lv_fixed
      WHERE matnr = is_eban-matnr
        AND werks = is_eban-werks
        AND vdatu <= sy-datum
        AND bdatu >= sy-datum
        AND flifn = abap_true
        AND notkz = space.
    IF sy-subrc = 0.
      SELECT SINGLE a~infnr, a~lifnr, e~ekorg, e~netpr
        FROM eina AS a
        INNER JOIN eine AS e ON e~infnr = a~infnr
        WHERE a~matnr = @is_eban-matnr
          AND a~lifnr = @lv_fixed
          AND a~loekz = @space
          AND e~werks = @is_eban-werks
        INTO @DATA(ls_inf).
    ELSE.
*     kein Orderbuch: erster gueltiger Infosatz (Altlogik, keine Preisoptimierung)
      SELECT SINGLE a~infnr, a~lifnr, e~ekorg, e~netpr
        FROM eina AS a
        INNER JOIN eine AS e ON e~infnr = a~infnr
        WHERE a~matnr = @is_eban-matnr
          AND a~loekz = @space
          AND e~werks = @is_eban-werks
        INTO @ls_inf.
    ENDIF.
    IF sy-subrc = 0.
      rs_src = VALUE #( lifnr = ls_inf-lifnr ekorg = ls_inf-ekorg
                        infnr = ls_inf-infnr netpr = ls_inf-netpr
                        quelle = 'INFOSATZ' ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Findung: Strategien in fester Reihenfolge, erster Treffer gewinnt
*----------------------------------------------------------------------*
CLASS lcl_source_determination DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS constructor.
    METHODS determine
      IMPORTING is_eban       TYPE ty_eban
      RETURNING VALUE(rs_src) TYPE ty_src
      RAISING   lcx_no_source.
  PRIVATE SECTION.
    DATA mt_strategies TYPE STANDARD TABLE OF REF TO lif_source_strategy.
ENDCLASS.

CLASS lcl_source_determination IMPLEMENTATION.
  METHOD constructor.
    mt_strategies = VALUE #( ( NEW lcl_src_contract( ) )
                             ( NEW lcl_src_quota( ) )
                             ( NEW lcl_src_inforec( ) ) ).
  ENDMETHOD.

  METHOD determine.
    LOOP AT mt_strategies INTO DATA(lo_strategy).
      rs_src = lo_strategy->find( is_eban ).
      IF rs_src-lifnr IS NOT INITIAL.
        RETURN.
      ENDIF.
    ENDLOOP.
    RAISE EXCEPTION TYPE lcx_no_source
      EXPORTING iv_text = |Keine Bezugsquelle fuer { is_eban-matnr } / { is_eban-werks }|.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Bestellaufbau: je Lieferant und Einkaufsorganisation eine Bestellung
*----------------------------------------------------------------------*
CLASS lcl_po_builder DEFINITION FINAL.
  PUBLIC SECTION.
    EVENTS po_created
      EXPORTING VALUE(ev_ebeln) TYPE ebeln
                VALUE(ev_lifnr) TYPE lifnr
                VALUE(ev_count) TYPE i.
    METHODS add_item
      IMPORTING is_eban TYPE ty_eban
                is_src  TYPE ty_src
      RAISING   lcx_no_source.
    METHODS create_all
      IMPORTING iv_test TYPE abap_bool.
  PRIVATE SECTION.
    TYPES: BEGIN OF ty_item,
             lifnr TYPE lifnr,
             ekorg TYPE ekorg,
             eban  TYPE ty_eban,
             src   TYPE ty_src,
           END OF ty_item.
    DATA mt_items TYPE STANDARD TABLE OF ty_item.
ENDCLASS.

CLASS lcl_po_builder IMPLEMENTATION.
  METHOD add_item.
*   Einkaufssperre des Lieferanten je EkOrg
    SELECT SINGLE sperm FROM lfm1 INTO @DATA(lv_sperm)
      WHERE lifnr = @is_src-lifnr
        AND ekorg = @is_src-ekorg.
    IF lv_sperm IS NOT INITIAL.
      RAISE EXCEPTION TYPE lcx_no_source
        EXPORTING iv_text = |Lieferant { is_src-lifnr } fuer Einkauf gesperrt|.
    ENDIF.
    APPEND VALUE #( lifnr = is_src-lifnr ekorg = is_src-ekorg
                    eban = is_eban src = is_src ) TO mt_items.
  ENDMETHOD.

  METHOD create_all.
    DATA: ls_head   TYPE bapimepoheader,
          ls_headx  TYPE bapimepoheaderx,
          lt_item   TYPE STANDARD TABLE OF bapimepoitem,
          lt_itemx  TYPE STANDARD TABLE OF bapimepoitemx,
          lt_return TYPE STANDARD TABLE OF bapiret2,
          lv_ebeln  TYPE ebeln,
          lv_count  TYPE i.

    LOOP AT mt_items INTO DATA(ls_first)
         GROUP BY ( lifnr = ls_first-lifnr ekorg = ls_first-ekorg
                    ekgrp = ls_first-eban-ekgrp )
         INTO DATA(lg).
      CLEAR: lv_ebeln, lt_return.
      ls_head  = VALUE #( comp_code = '1000' doc_type = 'NB' vendor = lg-lifnr
                          purch_org = lg-ekorg pur_group = lg-ekgrp ).
      ls_headx = VALUE #( comp_code = 'X' doc_type = 'X' vendor = 'X'
                          purch_org = 'X' pur_group = 'X' ).
      lt_item  = VALUE #( FOR m IN GROUP lg INDEX INTO i
                          ( po_item = i * 10 material = m-eban-matnr plant = m-eban-werks
                            stge_loc = m-eban-lgort quantity = m-eban-menge
                            preq_no = m-eban-banfn preq_item = m-eban-bnfpo
                            agreement = m-src-konnr agmt_item = m-src-ktpnr
                            info_rec = m-src-infnr ) ).
      lt_itemx = VALUE #( FOR m IN GROUP lg INDEX INTO i
                          ( po_item = i * 10 po_itemx = 'X' material = 'X' plant = 'X'
                            stge_loc = 'X' quantity = 'X' preq_no = 'X' preq_item = 'X'
                            agreement = 'X' agmt_item = 'X' info_rec = 'X' ) ).

      CALL FUNCTION 'BAPI_PO_CREATE1'
        EXPORTING
          poheader         = ls_head
          poheaderx        = ls_headx
          testrun          = iv_test
        IMPORTING
          exppurchaseorder = lv_ebeln
        TABLES
          return           = lt_return
          poitem           = lt_item
          poitemx          = lt_itemx.

      IF line_exists( lt_return[ type = 'E' ] ).
        CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
        LOOP AT GROUP lg INTO DATA(ls_member).
          PERFORM mark_error USING ls_member-eban 'BAPI_PO_CREATE1 fehlerhaft'.
        ENDLOOP.
        CONTINUE.
      ENDIF.

      IF iv_test = abap_false.
        CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
          EXPORTING
            wait = abap_true.
        lv_count = lines( lt_item ).
        RAISE EVENT po_created
          EXPORTING
            ev_ebeln = lv_ebeln
            ev_lifnr = lg-lifnr
            ev_count = lv_count.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Protokoll (statischer Ereignisbehandler)
*----------------------------------------------------------------------*
CLASS lcl_protocol DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS on_po_created FOR EVENT po_created OF lcl_po_builder
      IMPORTING ev_ebeln ev_lifnr ev_count.
ENDCLASS.

CLASS lcl_protocol IMPLEMENTATION.
  METHOD on_po_created.
    DATA ls_log TYPE zmm_autopo_log.
    ls_log-runid = gv_runid.
    ls_log-ebeln = ev_ebeln.
    ls_log-lifnr = ev_lifnr.
    ls_log-anzpo = ev_count.
    ls_log-uname = sy-uname.
    INSERT zmm_autopo_log FROM ls_log.
  ENDMETHOD.
ENDCLASS.
