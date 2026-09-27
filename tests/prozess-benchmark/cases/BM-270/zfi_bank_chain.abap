REPORT zfi_bank_chain.
*----------------------------------------------------------------------*
* Nachtkette elektronischer Kontoauszug:
*   1 Import (RFEBKA00)  ->  2 Ausgleich Z  ->  3 Mail an Treasury
* Schritt 2 nur bei erfolgreichem Schritt 1, Mail immer.
*----------------------------------------------------------------------*
PARAMETERS: p_date TYPE sy-datum DEFAULT sy-datum,
            p_time TYPE sy-uzeit DEFAULT '220000',
            p_mail AS CHECKBOX DEFAULT 'X'.

DATA: go_chain TYPE REF TO zcl_fi_job_chain,
      gx_chain TYPE REF TO zcx_fi_job_chain.

START-OF-SELECTION.
  AUTHORITY-CHECK OBJECT 'S_BTCH_JOB'
    ID 'JOBACTION' FIELD 'RELE'
    ID 'JOBGROUP'  FIELD '*'.
  IF sy-subrc <> 0.
    MESSAGE e030(zfi).                 "Keine Berechtigung Jobs freizugeben
  ENDIF.

* Kette schon eingeplant oder aktiv?
  SELECT COUNT(*) FROM tbtco
    WHERE jobname LIKE 'ZFI_EBS_%'
      AND status IN ('P', 'S', 'Y', 'R').
  IF sy-dbcnt > 0.
    MESSAGE i031(zfi).
    RETURN.
  ENDIF.

  go_chain = NEW #( iv_start_date = p_date
                    iv_start_time = p_time ).
  TRY.
      go_chain->add_step( iv_jobname = 'ZFI_EBS_1_IMPORT'
                          iv_report  = 'RFEBKA00'
                          iv_variant = 'ZNIGHT' ).
      go_chain->add_step( iv_jobname   = 'ZFI_EBS_2_CLEAR'
                          iv_report    = 'ZFI_EBS_CLEARING'
                          iv_variant   = 'ZNIGHT'
                          iv_checkstat = abap_true ).
      IF p_mail = abap_true.
        go_chain->add_step( iv_jobname   = 'ZFI_EBS_3_MAIL'
                            iv_report    = 'ZFI_EBS_MAIL'
                            iv_variant   = 'ZNIGHT'
                            iv_checkstat = abap_false ).
      ENDIF.
    CATCH zcx_fi_job_chain INTO gx_chain.
      go_chain->cancel( ).
      MESSAGE gx_chain->get_text( ) TYPE 'I'.
      RETURN.
  ENDTRY.

  LOOP AT go_chain->get_steps( ) INTO DATA(ls_step).
    WRITE: / ls_step-jobname, ls_step-jobcount, 'eingeplant'(001).
  ENDLOOP.
