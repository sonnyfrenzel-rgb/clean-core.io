*"* use this source file for the definition and implementation of
*"* local helper classes, interface definitions and type
*"* declarations
*----------------------------------------------------------------------*
* Zustandsklassen Banf-Freigabe (lokal zu ZCL_MM_PR_APPROVAL)
* (LIF_PR_STATE ist in den Local Definitions/CCDEF deklariert)
*----------------------------------------------------------------------*
CLASS lcl_state_open DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_pr_state.
ENDCLASS.

CLASS lcl_state_open IMPLEMENTATION.
  METHOD lif_pr_state~on_decision.
    IF iv_decision = 'A'.
*     zweistufig ab Wertgrenze laut Matrix
      IF io_ctx->ms_appr-levels > 1.
        io_ctx->transition( 'LEVEL2' ).
      ELSE.
        io_ctx->transition( 'RELEASED' ).
      ENDIF.
    ELSE.
      io_ctx->transition( 'REJECTED' ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_state_level2 DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_pr_state.
ENDCLASS.

CLASS lcl_state_level2 IMPLEMENTATION.
  METHOD lif_pr_state~on_decision.
    IF iv_decision = 'A'.
      io_ctx->transition( 'RELEASED' ).
    ELSE.
      io_ctx->transition( 'REJECTED' ).
    ENDIF.
  ENDMETHOD.
ENDCLASS.

CLASS lcl_state_final DEFINITION.
  PUBLIC SECTION.
    INTERFACES lif_pr_state.
ENDCLASS.

CLASS lcl_state_final IMPLEMENTATION.
  METHOD lif_pr_state~on_decision.
*   freigegeben oder abgelehnt - keine Entscheidung mehr moeglich
    RAISE EXCEPTION TYPE zcx_mm_pr_approval
      EXPORTING
        textid = zcx_mm_pr_approval=>already_closed
        banfn  = io_ctx->ms_appr-banfn.
  ENDMETHOD.
ENDCLASS.
