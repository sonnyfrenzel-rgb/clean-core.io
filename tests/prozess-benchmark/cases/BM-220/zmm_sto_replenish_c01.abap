*&---------------------------------------------------------------------*
*& Include ZMM_STO_REPLENISH_C01
*&---------------------------------------------------------------------*
CLASS lcx_sto DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_text TYPE string.
ENDCLASS.

CLASS lcx_sto IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_text = iv_text.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Bedarfsermittlung
*----------------------------------------------------------------------*
CLASS lcl_need_calculator DEFINITION FINAL.
  PUBLIC SECTION.
    TYPES tt_r_werks TYPE RANGE OF werks_d.
    CLASS-METHODS calculate
      IMPORTING it_werks       TYPE tt_r_werks
                iv_supply      TYPE reswk
      RETURNING VALUE(rt_need) TYPE tt_need.
ENDCLASS.

CLASS lcl_need_calculator IMPLEMENTATION.
  METHOD calculate.
    DATA: lv_stock TYPE labst,
          lv_open  TYPE menge_d,
          lv_need  TYPE menge_d.

*   Filialmaterialien mit Dispomerkmal Z1 (Nachschub aus Zentrallager)
    SELECT m~werks, m~matnr, m~eisbe, m~bstrf, a~meins
      FROM marc AS m
      INNER JOIN mara AS a ON a~matnr = m~matnr
      WHERE m~werks IN @it_werks
        AND m~dismm = 'Z1'
        AND m~eisbe > 0
        AND m~lvorm = @space
      INTO TABLE @DATA(lt_marc).

    LOOP AT lt_marc INTO DATA(ls_marc).
*     frei verwendbarer Filialbestand ueber alle Lagerorte
      SELECT SUM( labst ) FROM mard
        WHERE matnr = @ls_marc-matnr
          AND werks = @ls_marc-werks
        INTO @lv_stock.
*     offene UB-Mengen aus dem Zentrallager
      SELECT SUM( e~menge - e~wemng ) FROM eket AS e
        INNER JOIN ekpo AS p ON p~ebeln = e~ebeln AND p~ebelp = e~ebelp
        INNER JOIN ekko AS k ON k~ebeln = p~ebeln
        WHERE k~bsart = 'UB'
          AND k~reswk = @iv_supply
          AND p~matnr = @ls_marc-matnr
          AND p~werks = @ls_marc-werks
          AND p~elikz = @space
          AND p~loekz = @space
        INTO @lv_open.
      lv_need = 2 * ls_marc-eisbe - lv_stock - lv_open.
      IF lv_need > 0.
*       auf Rundungswert (Palette) aufrunden
        IF ls_marc-bstrf > 0.
          lv_need = ceil( lv_need / ls_marc-bstrf ) * ls_marc-bstrf.
        ENDIF.
        APPEND VALUE #( werks = ls_marc-werks matnr = ls_marc-matnr
                        menge = lv_need meins = ls_marc-meins ) TO rt_need.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Parallele UB-Anlage (aRFC)
*----------------------------------------------------------------------*
CLASS lcl_task_manager DEFINITION FINAL.
  PUBLIC SECTION.
    DATA: mv_sent    TYPE i,
          mv_done    TYPE i,
          mt_created TYPE STANDARD TABLE OF ty_sto.
    METHODS submit
      IMPORTING iv_werks  TYPE werks_d
                iv_supply TYPE reswk
                it_items  TYPE zmm_sto_item_t.
ENDCLASS.

CLASS lcl_task_manager IMPLEMENTATION.
  METHOD submit.
    DATA: lv_task  TYPE char32,
          lv_ebeln TYPE ebeln,
          lt_ret   TYPE bapiret2_t.

    lv_task = |STO_{ iv_werks }|.
    CALL FUNCTION 'Z_MM_STO_CREATE_RFC'
      STARTING NEW TASK lv_task
      DESTINATION IN GROUP DEFAULT
      PERFORMING on_sto_done ON END OF TASK
      EXPORTING
        iv_werks              = iv_werks
        iv_supply             = iv_supply
        it_items              = it_items
      EXCEPTIONS
        communication_failure = 1
        system_failure        = 2
        resource_failure      = 3.
    IF sy-subrc <> 0.
*     keine freien Dialog-Workprozesse: synchron im eigenen Prozess
      CALL FUNCTION 'Z_MM_STO_CREATE_RFC'
        EXPORTING
          iv_werks  = iv_werks
          iv_supply = iv_supply
          it_items  = it_items
        IMPORTING
          ev_ebeln  = lv_ebeln
          et_return = lt_ret.
      IF lv_ebeln IS NOT INITIAL.
        APPEND VALUE #( ebeln = lv_ebeln werks = iv_werks ) TO mt_created.
      ENDIF.
      RETURN.
    ENDIF.
    mv_sent = mv_sent + 1.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Auslieferung zur UB + Meldung an EWM
*----------------------------------------------------------------------*
CLASS lcl_delivery_creator DEFINITION FINAL.
  PUBLIC SECTION.
    EVENTS delivery_created
      EXPORTING VALUE(ev_ebeln) TYPE ebeln
                VALUE(ev_vbeln) TYPE vbeln_vl
                VALUE(ev_ewm)   TYPE abap_bool.
    METHODS constructor IMPORTING iv_dest TYPE rfcdest.
    METHODS create_for_sto
      IMPORTING is_sto TYPE ty_sto
      RAISING   lcx_sto.
  PRIVATE SECTION.
    DATA mv_dest TYPE rfcdest.
ENDCLASS.

CLASS lcl_delivery_creator IMPLEMENTATION.
  METHOD constructor.
    mv_dest = iv_dest.
  ENDMETHOD.

  METHOD create_for_sto.
    DATA: lt_ref    TYPE STANDARD TABLE OF bapidlvreftosto,
          lt_return TYPE STANDARD TABLE OF bapiret2,
          lv_vbeln  TYPE vbeln_vl,
          lv_msg    TYPE c LENGTH 200,
          lv_ewm    TYPE abap_bool VALUE abap_true.

    APPEND VALUE #( ref_doc = is_sto-ebeln ) TO lt_ref.
    CALL FUNCTION 'BAPI_OUTB_DELIVERY_CREATE_STO'
      EXPORTING
        due_date          = sy-datum
      IMPORTING
        delivery          = lv_vbeln
      TABLES
        stock_trans_items = lt_ref
        return            = lt_return.
    IF lv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      RAISE EXCEPTION TYPE lcx_sto
        EXPORTING iv_text = |Keine Auslieferung zu UB { is_sto-ebeln }|.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

*   Lieferankuendigung an EWM Zentrallager (synchron)
    CALL FUNCTION 'Z_EWM_DLV_NOTIFY'
      DESTINATION mv_dest
      EXPORTING
        iv_vbeln              = lv_vbeln
        iv_werks              = is_sto-werks
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        OTHERS                = 3.
    IF sy-subrc <> 0.
*     Wiederholung durch Job ZMM_EWM_RETRY
      INSERT zmm_ewm_retry FROM @( VALUE #( vbeln = lv_vbeln
                                            dest  = mv_dest
                                            msg   = lv_msg
                                            erdat = sy-datum ) ).
      lv_ewm = abap_false.
    ENDIF.

    RAISE EVENT delivery_created
      EXPORTING
        ev_ebeln = is_sto-ebeln
        ev_vbeln = lv_vbeln
        ev_ewm   = lv_ewm.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Protokoll
*----------------------------------------------------------------------*
CLASS lcl_protocol DEFINITION FINAL.
  PUBLIC SECTION.
    CLASS-METHODS on_delivery_created
      FOR EVENT delivery_created OF lcl_delivery_creator
      IMPORTING ev_ebeln ev_vbeln ev_ewm.
ENDCLASS.

CLASS lcl_protocol IMPLEMENTATION.
  METHOD on_delivery_created.
    gv_deliv = gv_deliv + 1.
    IF ev_ewm = abap_false.
      gv_retry = gv_retry + 1.
    ENDIF.
    INSERT zmm_sto_log FROM @( VALUE #( ebeln = ev_ebeln
                                        vbeln = ev_vbeln
                                        ewm   = ev_ewm
                                        datum = sy-datum
                                        uname = sy-uname ) ).
  ENDMETHOD.
ENDCLASS.
