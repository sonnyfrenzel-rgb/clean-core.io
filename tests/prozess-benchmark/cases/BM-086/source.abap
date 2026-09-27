FUNCTION z_idoc_input_zcredlim.
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
* Kreditlimits von Auskunftei (Nachrichtentyp ZCREDLIM)
* 2009 TS  Erstversion
* 2013 KL  negative Limits abweisen
  DATA: ls_edidc  TYPE edidc,
        ls_edidd  TYPE edidd,
        ls_e1head TYPE ze1credhd,
        ls_e1item TYPE ze1credit,
        ls_knkk   TYPE knkk,
        lv_error  TYPE c LENGTH 1,
        ls_status TYPE bdidocstat,
        ls_retvar TYPE bdwfretvar.

  workflow_result = '0'.
  in_update_task = space.
  call_transaction_done = space.

  LOOP AT idoc_contrl INTO ls_edidc.
    IF ls_edidc-mestyp <> 'ZCREDLIM'.
      RAISE wrong_function_called.
    ENDIF.
    CLEAR: lv_error, ls_e1head.

    LOOP AT idoc_data INTO ls_edidd WHERE docnum = ls_edidc-docnum.
      CASE ls_edidd-segnam.
        WHEN 'ZE1CREDHD'.
          ls_e1head = ls_edidd-sdata.
        WHEN 'ZE1CREDIT'.
          ls_e1item = ls_edidd-sdata.
          SELECT SINGLE * FROM knkk INTO ls_knkk
            WHERE kunnr = ls_e1head-kunnr
              AND kkber = ls_e1item-kkber.
          IF sy-subrc <> 0.
            lv_error = 'X'.
            EXIT.
          ENDIF.
          IF ls_e1item-klimk < 0.
            lv_error = 'X'.
            EXIT.
          ENDIF.
          ls_knkk-klimk = ls_e1item-klimk.
          ls_knkk-dtrev = sy-datum.        "Datum letzte interne Prüfung
          ls_knkk-aenam = sy-uname.
          ls_knkk-aedat = sy-datum.
          UPDATE knkk FROM ls_knkk.
*        WHEN 'ZE1CREDRK'.   "Risikoklasse - nie produktiv gegangen
*          PERFORM set_risk_class USING ls_edidd-sdata.
      ENDCASE.
    ENDLOOP.

    CLEAR ls_status.
    ls_status-docnum = ls_edidc-docnum.
    IF lv_error IS INITIAL.
      ls_status-status = '53'.
      ls_status-msgty  = 'S'.
      ls_status-msgid  = 'ZSD_IF'.
      ls_status-msgno  = '010'.
    ELSE.
      ls_status-status = '51'.
      ls_status-msgty  = 'E'.
      ls_status-msgid  = 'ZSD_IF'.
      ls_status-msgno  = '011'.
      ls_status-msgv1  = ls_e1head-kunnr.
      workflow_result  = '99999'.
    ENDIF.
    APPEND ls_status TO idoc_status.
    ls_retvar-wf_param = 'Processed_IDOCs'.
    ls_retvar-doc_number = ls_edidc-docnum.
    APPEND ls_retvar TO return_variables.
  ENDLOOP.
ENDFUNCTION.
