CLASS zcl_im_mm_pr_approval DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* BAdI ME_PROCESS_REQ_CUST, Implementierung ZMM_PR_APPROVAL
* Startet beim Sichern einer Banf den Z-Freigabeprozess (Wertmatrix)
* 2018-04 AHO  Ersterstellung, ersetzt Freigabestrategie 01/02
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES if_badi_interface.
    INTERFACES if_ex_me_process_req_cust.
ENDCLASS.



CLASS zcl_im_mm_pr_approval IMPLEMENTATION.

  METHOD if_ex_me_process_req_cust~post.
    DATA: lt_items TYPE mmpur_requisition_items,
          ls_data  TYPE mereq_item,
          lv_total TYPE bapicurext,
          lx_appr  TYPE REF TO zcx_mm_pr_approval.

*   Gesamtwert der Banf aus den Positionen
    lt_items = im_header->get_items( ).
    LOOP AT lt_items INTO DATA(ls_item).
      ls_data = ls_item-item->get_data( ).
      lv_total = lv_total + ls_data-preis * ls_data-menge / ls_data-peinh.
    ENDLOOP.

    CHECK lv_total > 0.

*   Aenderung einer Banf im laufenden Prozess startet keinen neuen
    IF zcl_mm_pr_approval=>exists( im_banfn ) = abap_true.
      RETURN.
    ENDIF.

    SET HANDLER zcl_mm_pr_notifier=>on_state_changed FOR ALL INSTANCES.
    TRY.
        NEW zcl_mm_pr_approval( im_banfn )->start( lv_total ).
      CATCH zcx_mm_pr_approval INTO lx_appr.
*       kein Abbruch des Sicherns - Banf bleibt ohne Z-Freigabe
        MESSAGE lx_appr TYPE 'S'.
    ENDTRY.
  ENDMETHOD.

  METHOD if_ex_me_process_req_cust~open.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~process_header.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~process_item.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~check.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~close.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~initialize.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~fieldselection_header.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~fieldselection_header_refkeys.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~fieldselection_item.
  ENDMETHOD.
  METHOD if_ex_me_process_req_cust~fieldselection_item_refkeys.
  ENDMETHOD.

ENDCLASS.
