FUNCTION z_idoc_input_zgrconf.
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
* Eingang Wareneingangsbestaetigung Logistikdienstleister (ZGRCONF01)
* Prozesscode ZGRC, Nachrichtentyp ZGRCONF
*----------------------------------------------------------------------
  DATA: ls_edidc    TYPE edidc,
        ls_edidd    TYPE edidd,
        ls_hdr      TYPE e1zgr_hdr,
        lt_itm      TYPE zcl_mm_gr_poster=>tt_itm,
        lo_poster   TYPE REF TO zcl_mm_gr_poster,
        lo_notifier TYPE REF TO zcl_mm_gr_notifier,
        lx_gr       TYPE REF TO zcx_mm_gr,
        lv_mblnr    TYPE mblnr.

  lo_notifier = NEW zcl_mm_gr_notifier( ).
  workflow_result = '0'.

  LOOP AT idoc_contrl INTO ls_edidc.
    READ TABLE idoc_data INTO ls_edidd
      WITH KEY docnum = ls_edidc-docnum
               segnam = 'E1ZGR_HDR'.
    IF sy-subrc <> 0.
      PERFORM set_status TABLES idoc_status
                         USING  ls_edidc-docnum '51' 'Kopfsegment E1ZGR_HDR fehlt'.
      workflow_result = '99999'.
      CONTINUE.
    ENDIF.
    ls_hdr = ls_edidd-sdata.

    lt_itm = VALUE #( FOR ls_d IN idoc_data
                      WHERE ( docnum = ls_edidc-docnum AND segnam = 'E1ZGR_ITM' )
                      ( CONV #( ls_d-sdata ) ) ).

    lo_poster = NEW zcl_mm_gr_poster( ).
    SET HANDLER lo_notifier->on_posted lo_notifier->on_failed FOR lo_poster.

    TRY.
        lv_mblnr = lo_poster->post( iv_docnum = ls_edidc-docnum
                                    is_hdr    = ls_hdr
                                    it_itm    = lt_itm ).
        PERFORM set_status TABLES idoc_status
                           USING  ls_edidc-docnum '53' lv_mblnr.
      CATCH zcx_mm_gr INTO lx_gr.
        PERFORM set_status TABLES idoc_status
                           USING  ls_edidc-docnum '51' 'Wareneingang nicht gebucht'.
        workflow_result = '99999'.
    ENDTRY.

    APPEND VALUE #( wf_param = 'Processed_IDOCs'
                    doc_number = ls_edidc-docnum ) TO return_variables.
  ENDLOOP.

* kein COMMIT WORK - erfolgt durch die ALE-Schicht
  in_update_task        = space.
  call_transaction_done = space.
ENDFUNCTION.
