FUNCTION z_idoc_input_zdeljit.
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
* JIT-Sequenzabrufe des OEM (VDA 4916 -> Konverter -> ZDELJIT) in die
* Abruftabelle ZJIT_ABRUF uebernehmen. Die Linienversorgung liest dort.
  DATA: ls_kopf  TYPE ze1jitk,
        ls_pos   TYPE ze1jitp,
        ls_abruf TYPE zjit_abruf,
        lt_abruf TYPE STANDARD TABLE OF zjit_abruf,
        lv_msgv1 TYPE symsgv,
        lv_msgno TYPE symsgno.

  READ TABLE idoc_contrl INDEX 1.
  IF idoc_contrl-mestyp <> 'ZDELJIT'.
    RAISE wrong_function_called.
  ENDIF.

  LOOP AT idoc_contrl.
    CLEAR: lt_abruf, lv_msgno, lv_msgv1.
    LOOP AT idoc_data WHERE docnum = idoc_contrl-docnum.
      CASE idoc_data-segnam.
        WHEN 'ZE1JITK'.
          ls_kopf = idoc_data-sdata.
        WHEN 'ZE1JITP'.
          ls_pos = idoc_data-sdata.
          CLEAR ls_abruf.
          SELECT SINGLE matnr FROM knmt INTO ls_abruf-matnr
            WHERE kunnr = ls_kopf-kunnr
              AND kdmat = ls_pos-kdmat.
          IF sy-subrc <> 0.
            lv_msgno = '110'.                    "Kundenmaterial unbekannt
            lv_msgv1 = ls_pos-kdmat.
            EXIT.
          ENDIF.
          CATCH SYSTEM-EXCEPTIONS conversion_errors = 1.
            ls_abruf-menge = ls_pos-menge.
          ENDCATCH.
          IF sy-subrc = 1.
            lv_msgno = '111'.                    "Menge nicht numerisch
            lv_msgv1 = ls_pos-menge.
            EXIT.
          ENDIF.
          ls_abruf-kunnr   = ls_kopf-kunnr.
          ls_abruf-abrufnr = ls_kopf-abrufnr.
          ls_abruf-seqnr   = ls_pos-seqnr.
          ls_abruf-lfdat   = ls_pos-lfdat.
          ls_abruf-lfuhr   = ls_pos-lfuhr.
          ls_abruf-docnum  = idoc_contrl-docnum.
          APPEND ls_abruf TO lt_abruf.
        WHEN OTHERS.
*         unbekannte Segmente ignorieren (Konverter liefert ZE1JITT Text)
      ENDCASE.
    ENDLOOP.

    CLEAR idoc_status.
    idoc_status-docnum = idoc_contrl-docnum.
    idoc_status-msgid  = 'ZJIT'.
    IF lv_msgno IS INITIAL.
      INSERT zjit_abruf FROM TABLE lt_abruf ACCEPTING DUPLICATE KEYS.
      idoc_status-status = '53'.
      idoc_status-msgty  = 'S'.
      idoc_status-msgno  = '100'.
      idoc_status-msgv1  = ls_kopf-abrufnr.
    ELSE.
      idoc_status-status = '51'.
      idoc_status-msgty  = 'E'.
      idoc_status-msgno  = lv_msgno.
      idoc_status-msgv1  = lv_msgv1.
      workflow_result    = 99999.
    ENDIF.
    APPEND idoc_status.
  ENDLOOP.

  IF workflow_result IS INITIAL.
    return_variables-wf_param = 'Processed_IDOCs'.
    LOOP AT idoc_contrl.
      return_variables-doc_number = idoc_contrl-docnum.
      APPEND return_variables.
    ENDLOOP.
  ENDIF.

ENDFUNCTION.
