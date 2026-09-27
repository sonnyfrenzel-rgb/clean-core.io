*&---------------------------------------------------------------------*
*& Include ZMM_PO_APPROVAL_C01 - Zustandsklassen Bestellfreigabe
*&---------------------------------------------------------------------*
CLASS lcx_approval DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_text TYPE string OPTIONAL.
ENDCLASS.

CLASS lcx_approval IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_text = iv_text.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_approval DEFINITION DEFERRED.

INTERFACE lif_state.
  METHODS handle
    IMPORTING io_ctx TYPE REF TO lcl_approval
    RAISING   lcx_approval.
ENDINTERFACE.

CLASS lcl_approval DEFINITION.
  PUBLIC SECTION.
    EVENTS released EXPORTING VALUE(ev_ebeln) TYPE ebeln.
    DATA: ms_ekko  TYPE ty_ekko,
          mv_netwr TYPE netwr,
          mo_state TYPE REF TO lif_state.
    CLASS-METHODS create
      IMPORTING is_ekko        TYPE ty_ekko
      RETURNING VALUE(ro_appr) TYPE REF TO lcl_approval.
    METHODS run RAISING lcx_approval.
    METHODS notify_released.
ENDCLASS.

CLASS lcl_state_budget DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_state.
ENDCLASS.

CLASS lcl_state_release DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_state.
ENDCLASS.

CLASS lcl_state_reject DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_state.
ENDCLASS.

CLASS lcl_log DEFINITION.
  PUBLIC SECTION.
    METHODS on_released FOR EVENT released OF lcl_approval
      IMPORTING ev_ebeln.
ENDCLASS.

CLASS lcl_approval IMPLEMENTATION.
  METHOD create.
    ro_appr = NEW lcl_approval( ).
    ro_appr->ms_ekko = is_ekko.
    SELECT SUM( netwr ) FROM ekpo INTO ro_appr->mv_netwr
      WHERE ebeln = is_ekko-ebeln
        AND loekz = space.
*   Kleinbestellungen ohne Budgetpruefung direkt freigeben
    IF ro_appr->mv_netwr <= gc_auto_limit.
      ro_appr->mo_state = NEW lcl_state_release( ).
    ELSE.
      ro_appr->mo_state = NEW lcl_state_budget( ).
    ENDIF.
  ENDMETHOD.

  METHOD run.
    WHILE mo_state IS BOUND.
      mo_state->handle( me ).
    ENDWHILE.
  ENDMETHOD.

  METHOD notify_released.
    RAISE EVENT released EXPORTING ev_ebeln = ms_ekko-ebeln.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_state_budget IMPLEMENTATION.
  METHOD lif_state~handle.
    DATA lv_rest TYPE netwr.
    SELECT SINGLE budget_rest FROM zmm_budget INTO lv_rest
      WHERE ekgrp = io_ctx->ms_ekko-ekgrp
        AND gjahr = sy-datum(4).
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_approval
        EXPORTING iv_text = |Kein Budget fuer Einkaeufergruppe { io_ctx->ms_ekko-ekgrp }|.
    ENDIF.
    IF lv_rest >= io_ctx->mv_netwr.
*     Budget vormerken, Commit erfolgt mit der Freigabe
      UPDATE zmm_budget SET budget_rest = budget_rest - io_ctx->mv_netwr
        WHERE ekgrp = io_ctx->ms_ekko-ekgrp
          AND gjahr = sy-datum(4).
      io_ctx->mo_state = NEW lcl_state_release( ).
    ELSE.
      io_ctx->mo_state = NEW lcl_state_reject( ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_state_release IMPLEMENTATION.
  METHOD lif_state~handle.
    DATA lt_return TYPE STANDARD TABLE OF bapireturn.
    CALL FUNCTION 'BAPI_PO_RELEASE'
      EXPORTING
        purchaseorder = io_ctx->ms_ekko-ebeln
        po_rel_code   = gc_rel_code
        no_commit     = abap_true
      TABLES
        return        = lt_return
      EXCEPTIONS
        OTHERS        = 1.
    IF sy-subrc <> 0 OR line_exists( lt_return[ type = 'E' ] ).
      RAISE EXCEPTION TYPE lcx_approval
        EXPORTING iv_text = |Freigabe { io_ctx->ms_ekko-ebeln } fehlgeschlagen|.
    ENDIF.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    io_ctx->notify_released( ).
    CLEAR io_ctx->mo_state.                    " Endzustand
  ENDMETHOD.
ENDCLASS.

CLASS lcl_state_reject IMPLEMENTATION.
  METHOD lif_state~handle.
    DATA ls_rej TYPE zmm_po_reject.
    ls_rej-ebeln = io_ctx->ms_ekko-ebeln.
    ls_rej-netwr = io_ctx->mv_netwr.
    ls_rej-grund = 'BUDGET'.
    ls_rej-datum = sy-datum.
    MODIFY zmm_po_reject FROM ls_rej.
    CLEAR io_ctx->mo_state.                    " Endzustand
  ENDMETHOD.
ENDCLASS.

CLASS lcl_log IMPLEMENTATION.
  METHOD on_released.
    DATA lv_key TYPE swo_typeid.
    lv_key = ev_ebeln.
*   Workflow-Ereignis fuer Benachrichtigung des Bestellers
    CALL FUNCTION 'SWE_EVENT_CREATE'
      EXPORTING
        objtype           = 'BUS2012'
        objkey            = lv_key
        event             = 'ZAUTORELEASED'
      EXCEPTIONS
        objtype_not_found = 1
        OTHERS            = 2.
    gv_cnt_rel = gv_cnt_rel + 1.
    WRITE: / ev_ebeln, 'freigegeben'(010).
  ENDMETHOD.
ENDCLASS.
