FUNCTION z_idoc_input_zmatmas.
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
*"  EXCEPTIONS
*"      WRONG_FUNCTION_CALLED
*"----------------------------------------------------------------------
* Eingang Materialstamm ZMATMAS
* - ein IDoc = ein Material
* - Serialisierung: das jüngste IDoc je Material gewinnt
* - Fehler: Status 51, Nachbearbeitung über BD87
*----------------------------------------------------------------------
  workflow_result       = '0'.
  application_variable  = space.
  in_update_task        = space.
  call_transaction_done = space.

  LOOP AT idoc_contrl INTO gs_edidc.
    IF gs_edidc-mestyp <> 'ZMATMAS'.
      RAISE wrong_function_called.
    ENDIF.
    CLEAR: gv_error, gv_skip, gs_err.

    PERFORM parse_segments TABLES idoc_data
                           USING  gs_edidc-docnum.

    PERFORM check_serialization USING    gs_edidc
                                CHANGING gv_skip.
    IF gv_skip = 'X'.
      PERFORM add_status TABLES idoc_status
                         USING  gs_edidc-docnum gc_status_skip.
      CONTINUE.
    ENDIF.

    PERFORM validate CHANGING gv_error.
    IF gv_error IS INITIAL.
      PERFORM post_material CHANGING gv_error.
    ENDIF.

    IF gv_error IS INITIAL.
      PERFORM update_serialization USING gs_edidc.
      PERFORM add_status TABLES idoc_status
                         USING  gs_edidc-docnum gc_status_ok.
      return_variables-wf_param = 'Processed_IDOCs'.
    ELSE.
      PERFORM add_status TABLES idoc_status
                         USING  gs_edidc-docnum gc_status_err.
      workflow_result = '99999'.
      return_variables-wf_param = 'Error_IDOCs'.
    ENDIF.
    return_variables-doc_number = gs_edidc-docnum.
    APPEND return_variables.
  ENDLOOP.
ENDFUNCTION.
