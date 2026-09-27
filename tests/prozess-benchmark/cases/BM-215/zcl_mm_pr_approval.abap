CLASS zcl_mm_pr_approval DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Freigabeprozess Bestellanforderung (Zustandsmodell)
* Zustaende: OPEN (Stufe 1) -> LEVEL2 (Stufe 2) -> RELEASED | REJECTED
* Zustandsklassen lokal (siehe Local Implementations / CCIMP)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CONSTANTS gc_rel_code TYPE frgco VALUE 'ZA'.

    EVENTS state_changed
      EXPORTING VALUE(ev_banfn)     TYPE banfn
                VALUE(ev_state)     TYPE char10
                VALUE(ev_recipient) TYPE syuname.

    DATA ms_appr TYPE zmm_pr_appr READ-ONLY.

    CLASS-METHODS exists
      IMPORTING iv_banfn         TYPE banfn
      RETURNING VALUE(rv_exists) TYPE abap_bool.
    CLASS-METHODS load
      IMPORTING iv_banfn       TYPE banfn
      RETURNING VALUE(ro_appr) TYPE REF TO zcl_mm_pr_approval
      RAISING   zcx_mm_pr_approval.

    METHODS constructor
      IMPORTING iv_banfn TYPE banfn.
    METHODS start
      IMPORTING iv_total TYPE bapicurext
      RAISING   zcx_mm_pr_approval.
    METHODS decide
      IMPORTING iv_decision TYPE char1
                iv_comment  TYPE string OPTIONAL
      RAISING   zcx_mm_pr_approval.
    METHODS transition
      IMPORTING iv_state TYPE char10
      RAISING   zcx_mm_pr_approval.

  PRIVATE SECTION.
    DATA: mo_state     TYPE REF TO lif_pr_state,
          mv_requester TYPE syuname,
          mv_werks     TYPE werks_d.

    METHODS save
      IMPORTING iv_decision TYPE char1
                iv_comment  TYPE string.
ENDCLASS.



CLASS zcl_mm_pr_approval IMPLEMENTATION.

  METHOD exists.
    SELECT SINGLE @abap_true FROM zmm_pr_appr
      WHERE banfn = @iv_banfn
      INTO @rv_exists.
  ENDMETHOD.


  METHOD load.
    DATA ls_appr TYPE zmm_pr_appr.
    SELECT SINGLE * FROM zmm_pr_appr INTO ls_appr
      WHERE banfn = iv_banfn.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mm_pr_approval
        EXPORTING
          textid = zcx_mm_pr_approval=>no_process
          banfn  = iv_banfn.
    ENDIF.
    ro_appr = NEW zcl_mm_pr_approval( iv_banfn ).
    ro_appr->ms_appr = ls_appr.
*   Zustandsobjekt wiederherstellen - ohne Folgeaktionen
    CASE ls_appr-state.
      WHEN 'OPEN'.
        ro_appr->mo_state = NEW lcl_state_open( ).
      WHEN 'LEVEL2'.
        ro_appr->mo_state = NEW lcl_state_level2( ).
      WHEN OTHERS.
        ro_appr->mo_state = NEW lcl_state_final( ).
    ENDCASE.
  ENDMETHOD.


  METHOD constructor.
    ms_appr-banfn = iv_banfn.
*   Anforderer und Werk aus der Banf (irgendeine Position)
    SELECT SINGLE ernam werks FROM eban INTO (mv_requester, mv_werks)
      WHERE banfn = iv_banfn.
  ENDMETHOD.


  METHOD start.
    DATA ls_matrix TYPE zmm_pr_matrix.

*   Wertmatrix je Werk: Anzahl Stufen und Genehmiger
    SELECT SINGLE * FROM zmm_pr_matrix INTO ls_matrix
      WHERE werks      =  mv_werks
        AND value_from <= iv_total
        AND value_to   >= iv_total.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE zcx_mm_pr_approval
        EXPORTING
          textid = zcx_mm_pr_approval=>no_matrix
          banfn  = ms_appr-banfn.
    ENDIF.

    ms_appr-total     = iv_total.
    ms_appr-levels    = ls_matrix-levels.
    ms_appr-approver  = ls_matrix-approver1.
    ms_appr-approver2 = ls_matrix-approver2.
    ms_appr-requester = mv_requester.
    ms_appr-erdat     = sy-datum.
    INSERT zmm_pr_appr FROM ms_appr.

    transition( 'OPEN' ).
  ENDMETHOD.


  METHOD decide.
    IF ms_appr-approver <> sy-uname.
      RAISE EXCEPTION TYPE zcx_mm_pr_approval
        EXPORTING
          textid = zcx_mm_pr_approval=>not_approver
          banfn  = ms_appr-banfn.
    ENDIF.
    mo_state->on_decision( io_ctx      = me
                           iv_decision = iv_decision ).
    save( iv_decision = iv_decision
          iv_comment  = iv_comment ).
  ENDMETHOD.


  METHOD transition.
    DATA: lt_return    TYPE STANDARD TABLE OF bapireturn,
          lv_recipient TYPE syuname.

    ms_appr-state = iv_state.
    CASE iv_state.
      WHEN 'OPEN'.
        mo_state = NEW lcl_state_open( ).
        lv_recipient = ms_appr-approver.
      WHEN 'LEVEL2'.
        mo_state = NEW lcl_state_level2( ).
        ms_appr-approver = ms_appr-approver2.
        lv_recipient = ms_appr-approver.
      WHEN 'RELEASED'.
*       Freigabe im Standard setzen, damit die Banf bestellt werden kann
        CALL FUNCTION 'BAPI_REQUISITION_RELEASE_GEN'
          EXPORTING
            number   = ms_appr-banfn
            rel_code = gc_rel_code
          TABLES
            return   = lt_return.
        IF line_exists( lt_return[ type = 'E' ] ).
          RAISE EXCEPTION TYPE zcx_mm_pr_approval
            EXPORTING
              textid = zcx_mm_pr_approval=>release_failed
              banfn  = ms_appr-banfn.
        ENDIF.
        mo_state = NEW lcl_state_final( ).
        lv_recipient = ms_appr-requester.
      WHEN 'REJECTED'.
        mo_state = NEW lcl_state_final( ).
        lv_recipient = ms_appr-requester.
    ENDCASE.

    RAISE EVENT state_changed
      EXPORTING
        ev_banfn     = ms_appr-banfn
        ev_state     = iv_state
        ev_recipient = lv_recipient.
  ENDMETHOD.


  METHOD save.
    DATA ls_hist TYPE zmm_pr_hist.
    UPDATE zmm_pr_appr FROM ms_appr.
    ls_hist-banfn    = ms_appr-banfn.
    ls_hist-uname    = sy-uname.
    ls_hist-datum    = sy-datum.
    ls_hist-uzeit    = sy-uzeit.
    ls_hist-decision = iv_decision.
    ls_hist-state    = ms_appr-state.
    ls_hist-comment  = iv_comment.
    INSERT zmm_pr_hist FROM ls_hist.
  ENDMETHOD.

ENDCLASS.
