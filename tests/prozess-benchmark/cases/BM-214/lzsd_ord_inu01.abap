FUNCTION z_idoc_input_zorders.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(INPUT_METHOD) LIKE  BDWFAP_PAR-INPUTMETHD
*"     VALUE(MASS_PROCESSING) LIKE  BDWFAP_PAR-MASS_PROC
*"  EXPORTING
*"     VALUE(WORKFLOW_RESULT) LIKE  BDWF_PARAM-RESULT
*"     VALUE(APPLICATION_VARIABLE) LIKE  BDWF_PARAM-APPL_VAR
*"     VALUE(IN_UPDATE_TASK) LIKE  BDWFAP_PAR-UPDATETASK
*"     VALUE(CALL_TRANSACTION_DONE) LIKE  BDWFAP_PAR-CALLTRANS
*"  TABLES
*"      IDOC_CONTRL STRUCTURE  EDIDC
*"      IDOC_DATA STRUCTURE  EDIDD
*"      IDOC_STATUS STRUCTURE  BDIDOCSTAT
*"      RETURN_VARIABLES STRUCTURE  BDWFRETVAR
*"      SERIALIZATION_INFO STRUCTURE  BDI_SER
*"----------------------------------------------------------------------
  DATA: lo_mapper  TYPE REF TO lcl_order_mapper,
        lo_handler TYPE REF TO lif_order_handler,
        lx_order   TYPE REF TO lcx_order_in,
        ls_order   TYPE ty_order,
        lv_vbeln   TYPE vbeln_va,
        lt_edidd   TYPE edidd_tt.

  CLEAR gt_status.
  workflow_result = '0'.
  lt_edidd = idoc_data[].
  lo_mapper = NEW lcl_order_mapper( ).

  LOOP AT idoc_contrl.
    CLEAR: ls_order, lv_vbeln.
    TRY.
        ls_order = lo_mapper->map( iv_docnum = idoc_contrl-docnum
                                   iv_sndprn = idoc_contrl-sndprn
                                   it_edidd  = lt_edidd ).
        PERFORM check_duplicate USING ls_order.
        lo_handler = lcl_handler_factory=>get( ls_order ).
        lv_vbeln = lo_handler->process( CHANGING cs_order = ls_order ).
        PERFORM set_status USING idoc_contrl-docnum '53' lv_vbeln.
        APPEND VALUE #( wf_param   = 'Appl_Objects'
                        doc_number = lv_vbeln ) TO return_variables.
      CATCH lcx_order_in INTO lx_order.
        PERFORM set_status USING idoc_contrl-docnum '51' lx_order->mv_text.
        workflow_result = '99999'.
        APPEND VALUE #( wf_param   = 'Error_IDOCs'
                        doc_number = idoc_contrl-docnum ) TO return_variables.
    ENDTRY.
  ENDLOOP.

  idoc_status[] = gt_status.
  in_update_task        = space.
  call_transaction_done = space.
ENDFUNCTION.
