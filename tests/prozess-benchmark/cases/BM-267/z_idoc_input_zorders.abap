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
* Eingang Kundenauftraege (Nachrichtentyp ZORDERS, Basistyp ORDERS05)
* Segmente werden ueber Mapper-Klassen (ZIF_SD_SEG_MAPPER) abgebildet,
* nicht relevante Segmente liefern keinen Mapper.
* 2016-05 PH  Umstellung von IDOC_INPUT_ORDERS-Kopie auf Mapper-Klassen

  DATA: lo_mapper TYPE REF TO zif_sd_seg_mapper,
        lx_map    TYPE REF TO zcx_sd_idoc_map,
        ls_order  TYPE zsd_s_idoc_order,
        lt_return TYPE STANDARD TABLE OF bapiret2,
        ls_return TYPE bapiret2,
        lv_vbeln  TYPE vbeln_va,
        lv_error  TYPE abap_bool.

  LOOP AT idoc_contrl.
    CLEAR: ls_order, lt_return, lv_vbeln, lv_error.

    TRY.
        LOOP AT idoc_data WHERE docnum = idoc_contrl-docnum.
          lo_mapper = zcl_sd_seg_map_factory=>get_mapper( idoc_data-segnam ).
          IF lo_mapper IS NOT BOUND.
            CONTINUE.                    "z. B. E1EDK14, E1EDK03 - nicht relevant
          ENDIF.
          lo_mapper->map( EXPORTING is_edidd = idoc_data
                          CHANGING  cs_order = ls_order ).
        ENDLOOP.
      CATCH zcx_sd_idoc_map INTO lx_map.
        lv_error = abap_true.
        CLEAR idoc_status.
        idoc_status-docnum = idoc_contrl-docnum.
        idoc_status-status = '51'.
        idoc_status-msgty  = 'E'.
        idoc_status-msgid  = 'ZSD'.
        idoc_status-msgno  = '100'.
        idoc_status-msgv1  = lx_map->get_text( ).
        APPEND idoc_status.
    ENDTRY.
    IF lv_error = abap_true.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
      EXPORTING
        order_header_in    = ls_order-header
      IMPORTING
        salesdocument      = lv_vbeln
      TABLES
        return             = lt_return
        order_items_in     = ls_order-items
        order_partners     = ls_order-partners
        order_schedules_in = ls_order-schedules.

    READ TABLE lt_return INTO ls_return WITH KEY type = 'E'.
    IF sy-subrc = 0 OR lv_vbeln IS INITIAL.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      CLEAR idoc_status.
      idoc_status-docnum = idoc_contrl-docnum.
      idoc_status-status = '51'.
      idoc_status-msgty  = ls_return-type.
      idoc_status-msgid  = ls_return-id.
      idoc_status-msgno  = ls_return-number.
      idoc_status-msgv1  = ls_return-message_v1.
      idoc_status-msgv2  = ls_return-message_v2.
      APPEND idoc_status.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = 'X'.
      CLEAR idoc_status.
      idoc_status-docnum = idoc_contrl-docnum.
      idoc_status-status = '53'.
      idoc_status-msgty  = 'S'.
      idoc_status-msgid  = 'ZSD'.
      idoc_status-msgno  = '101'.
      idoc_status-msgv1  = lv_vbeln.
      APPEND idoc_status.
      return_variables-wf_param   = 'Processed_IDOCs'.
      return_variables-doc_number = idoc_contrl-docnum.
      APPEND return_variables.
      return_variables-wf_param   = 'Appl_Objects'.
      return_variables-doc_number = lv_vbeln.
      APPEND return_variables.
    ENDIF.
  ENDLOOP.

  workflow_result = '0'.
  IF line_exists( idoc_status[ status = '51' ] ).
    workflow_result = '99999'.
  ENDIF.
*  in_update_task = 'X'.   "nie aktiv gewesen

ENDFUNCTION.
