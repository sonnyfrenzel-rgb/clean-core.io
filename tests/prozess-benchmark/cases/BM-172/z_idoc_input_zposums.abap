FUNCTION z_idoc_input_zposums.
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
* POS-Tagesumsaetze je Filiale verdichten und in ZPOS_UMSATZ fortschreiben
* (Ersatz fuer WPUUMS-Standardverarbeitung, Projekt Kasse neu 2014)

  LOOP AT idoc_contrl.
    CLEAR: gs_kopf, gt_pos, gt_sum, gt_fehl.
    gv_docnum = idoc_contrl-docnum.

    PERFORM segmente_lesen TABLES idoc_data USING idoc_contrl-docnum.
    IF gs_kopf-filiale IS INITIAL.
      status_setzen idoc_contrl-docnum '51' 'E' '001' space.
      CONTINUE.
    ENDIF.

*   Filiale/Tag sperren - Kasse schickt Nachlieferungen parallel
    CALL FUNCTION 'ENQUEUE_EZPOS_FIL'
      EXPORTING
        filiale        = gs_kopf-filiale
        datum          = gs_kopf-datum
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      status_setzen idoc_contrl-docnum '51' 'E' '002' gs_kopf-filiale.
      CONTINUE.
    ENDIF.

    PERFORM artikel_ermitteln.
    PERFORM verdichten.

    IF gt_fehl IS NOT INITIAL.
      INSERT zpos_fehler FROM TABLE gt_fehl ACCEPTING DUPLICATE KEYS.
    ENDIF.

    IF gt_sum IS INITIAL.
      status_setzen idoc_contrl-docnum '51' 'E' '003' gs_kopf-filiale.
    ELSE.
      CALL FUNCTION 'Z_POS_UMSATZ_VERBUCHEN' IN UPDATE TASK
        EXPORTING
          is_kopf = gs_kopf
        TABLES
          it_sum  = gt_sum.
      IF gt_fehl IS INITIAL.
        status_setzen idoc_contrl-docnum '53' 'S' '010' gs_kopf-filiale.
      ELSE.
*       53 trotz unbekannter EAN - Fehler stehen in ZPOS_FEHLER (Clearing)
        status_setzen idoc_contrl-docnum '53' 'W' '011' gs_kopf-filiale.
      ENDIF.
    ENDIF.

    CALL FUNCTION 'DEQUEUE_EZPOS_FIL'
      EXPORTING
        filiale = gs_kopf-filiale
        datum   = gs_kopf-datum.
  ENDLOOP.

  in_update_task = 'X'.

ENDFUNCTION.
