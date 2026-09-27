*"* use this source file for any type of declarations (class
*"* definitions, interfaces or type declarations) you need for
*"* components in the private section
*----------------------------------------------------------------------*
* Zustandsschnittstelle Banf-Freigabe
*----------------------------------------------------------------------*
INTERFACE lif_pr_state.
  METHODS on_decision
    IMPORTING io_ctx      TYPE REF TO zcl_mm_pr_approval
              iv_decision TYPE char1
    RAISING   zcx_mm_pr_approval.
ENDINTERFACE.

CLASS lcl_state_open DEFINITION DEFERRED.
CLASS lcl_state_level2 DEFINITION DEFERRED.
CLASS lcl_state_final DEFINITION DEFERRED.
