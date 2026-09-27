*&---------------------------------------------------------------------*
*& Include ZSD_CREDIT_RELEASE_C01 - Kreditfall mit Zustandsklassen
*&---------------------------------------------------------------------*
CLASS lcx_credit DEFINITION INHERITING FROM cx_static_check.
  PUBLIC SECTION.
    DATA mv_text TYPE string READ-ONLY.
    METHODS constructor IMPORTING iv_text TYPE string.
ENDCLASS.

CLASS lcx_credit IMPLEMENTATION.
  METHOD constructor.
    super->constructor( ).
    mv_text = iv_text.
  ENDMETHOD.
ENDCLASS.

INTERFACE lif_credit_state.
  METHODS handle
    IMPORTING io_case   TYPE REF TO lcl_credit_case
              iv_action TYPE char3
    RAISING   lcx_credit.
ENDINTERFACE.

CLASS lcl_credit_case DEFINITION FINAL.
  PUBLIC SECTION.
    DATA: ms_vbak   TYPE vbak READ-ONLY,
          mv_reason TYPE char60.
    CLASS-METHODS load
      IMPORTING iv_vbeln       TYPE vbeln_va
      RETURNING VALUE(ro_case) TYPE REF TO lcl_credit_case
      RAISING   lcx_credit.
    METHODS execute
      IMPORTING iv_action TYPE char3
      RAISING   lcx_credit.
    METHODS get_display
      RETURNING VALUE(rs_disp) TYPE ty_disp.
    METHODS log
      IMPORTING iv_action TYPE char3.
  PRIVATE SECTION.
    DATA: mo_state TYPE REF TO lif_credit_state,
          mv_state TYPE char10.
ENDCLASS.

CLASS lcl_state_blocked DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_credit_state.
ENDCLASS.

CLASS lcl_state_rejected DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_credit_state.
ENDCLASS.

CLASS lcl_state_released DEFINITION FINAL.
  PUBLIC SECTION.
    INTERFACES lif_credit_state.
ENDCLASS.

CLASS lcl_credit_case IMPLEMENTATION.
  METHOD load.
    DATA ls_vbak TYPE vbak.
    SELECT SINGLE * FROM vbak INTO ls_vbak
      WHERE vbeln = iv_vbeln.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_credit
        EXPORTING iv_text = |Auftrag { iv_vbeln } existiert nicht|.
    ENDIF.
    ro_case = NEW lcl_credit_case( ).
    ro_case->ms_vbak = ls_vbak.

*   Gesamtstatus Kreditpruefung aus VBUK
    SELECT SINGLE cmgst FROM vbuk INTO @DATA(lv_cmgst)
      WHERE vbeln = @iv_vbeln.
    CASE lv_cmgst.
      WHEN 'B' OR 'C'.
        IF ls_vbak-lifsk = gc_rej_block.
          ro_case->mo_state = NEW lcl_state_rejected( ).
          ro_case->mv_state = 'ABGELEHNT'.
        ELSE.
          ro_case->mo_state = NEW lcl_state_blocked( ).
          ro_case->mv_state = 'GESPERRT'.
        ENDIF.
      WHEN OTHERS.
        ro_case->mo_state = NEW lcl_state_released( ).
        ro_case->mv_state = 'FREI'.
    ENDCASE.
  ENDMETHOD.

  METHOD execute.
    mo_state->handle( io_case   = me
                      iv_action = iv_action ).
  ENDMETHOD.

  METHOD get_display.
    rs_disp = VALUE #( vbeln = ms_vbak-vbeln kunnr = ms_vbak-kunnr
                       netwr = ms_vbak-netwr waerk = ms_vbak-waerk
                       state = mv_state ).
*   Kreditlimit und Obligo (klassisches SD-Kreditmanagement)
    SELECT SINGLE klimk, skfor, ssobl, sauft FROM knkk
      WHERE kunnr = @ms_vbak-kunnr
        AND kkber = @gc_kkber
      INTO @DATA(ls_knkk).
*   Wert aller kreditgesperrten Auftraege des Kunden
    SELECT SUM( k~netwr ) FROM vbak AS k
      INNER JOIN vbuk AS u ON u~vbeln = k~vbeln
      WHERE k~kunnr = @ms_vbak-kunnr
        AND u~cmgst IN ('B', 'C')
      INTO @rs_disp-blocked.
    rs_disp-klimk = ls_knkk-klimk.
    rs_disp-expos = ls_knkk-skfor + ls_knkk-ssobl + ls_knkk-sauft.
    rs_disp-free  = ls_knkk-klimk - rs_disp-expos.
  ENDMETHOD.

  METHOD log.
    DATA ls_log TYPE zsd_cred_log.
    ls_log-vbeln  = ms_vbak-vbeln.
    ls_log-action = iv_action.
    ls_log-reason = mv_reason.
    ls_log-uname  = sy-uname.
    ls_log-datum  = sy-datum.
    ls_log-uzeit  = sy-uzeit.
    INSERT zsd_cred_log FROM ls_log.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Zustand GESPERRT: freigeben oder ablehnen
*----------------------------------------------------------------------*
CLASS lcl_state_blocked IMPLEMENTATION.
  METHOD lif_credit_state~handle.
    DATA: ls_hdr    TYPE bapisdh1,
          ls_hdrx   TYPE bapisdh1x,
          lt_return TYPE STANDARD TABLE OF bapiret2.

    CASE iv_action.
      WHEN 'REL'.
        CALL FUNCTION 'SD_ORDER_CREDIT_RELEASE'
          EXPORTING
            vbeln         = io_case->ms_vbak-vbeln
          EXCEPTIONS
            error_message = 1
            OTHERS        = 2.
        IF sy-subrc <> 0.
          RAISE EXCEPTION TYPE lcx_credit
            EXPORTING iv_text = |Freigabe { io_case->ms_vbak-vbeln } fehlgeschlagen|.
        ENDIF.
        io_case->log( 'REL' ).
      WHEN 'REJ'.
*       Ablehnung = Liefersperre ZK, Auftrag bleibt kreditgesperrt
        ls_hdr-dlv_block  = gc_rej_block.
        ls_hdrx-updateflag = 'U'.
        ls_hdrx-dlv_block  = abap_true.
        CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
          EXPORTING
            salesdocument    = io_case->ms_vbak-vbeln
            order_header_in  = ls_hdr
            order_header_inx = ls_hdrx
          TABLES
            return           = lt_return.
        IF line_exists( lt_return[ type = 'E' ] ).
          RAISE EXCEPTION TYPE lcx_credit
            EXPORTING iv_text = |Liefersperre { io_case->ms_vbak-vbeln } nicht gesetzt|.
        ENDIF.
        io_case->log( 'REJ' ).
    ENDCASE.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Zustand ABGELEHNT: nur nachtraegliche Freigabe
*----------------------------------------------------------------------*
CLASS lcl_state_rejected IMPLEMENTATION.
  METHOD lif_credit_state~handle.
    DATA: ls_hdr    TYPE bapisdh1,
          ls_hdrx   TYPE bapisdh1x,
          lt_return TYPE STANDARD TABLE OF bapiret2.

    IF iv_action <> 'REL'.
      RAISE EXCEPTION TYPE lcx_credit
        EXPORTING iv_text = 'Auftrag ist bereits abgelehnt'.
    ENDIF.
*   Liefersperre ZK entfernen, dann Kreditfreigabe
    ls_hdrx-updateflag = 'U'.
    ls_hdrx-dlv_block  = abap_true.
    CALL FUNCTION 'BAPI_SALESORDER_CHANGE'
      EXPORTING
        salesdocument    = io_case->ms_vbak-vbeln
        order_header_in  = ls_hdr
        order_header_inx = ls_hdrx
      TABLES
        return           = lt_return.
    CALL FUNCTION 'SD_ORDER_CREDIT_RELEASE'
      EXPORTING
        vbeln         = io_case->ms_vbak-vbeln
      EXCEPTIONS
        error_message = 1
        OTHERS        = 2.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_credit
        EXPORTING iv_text = |Freigabe { io_case->ms_vbak-vbeln } fehlgeschlagen|.
    ENDIF.
    io_case->log( 'REL' ).
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
* Zustand FREI: keine Aktion moeglich
*----------------------------------------------------------------------*
CLASS lcl_state_released IMPLEMENTATION.
  METHOD lif_credit_state~handle.
    RAISE EXCEPTION TYPE lcx_credit
      EXPORTING iv_text = 'Auftrag ist nicht kreditgesperrt'.
  ENDMETHOD.
ENDCLASS.
