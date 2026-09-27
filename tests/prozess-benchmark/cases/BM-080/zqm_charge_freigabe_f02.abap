*&---------------------------------------------------------------------*
*& Include ZQM_CHARGE_FREIGABE_F02 - Buchungen und Benachrichtigung
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Verwendungsentscheid setzen (mit Bestandsbuchung laut VE-Code)
*&---------------------------------------------------------------------*
FORM ve_setzen USING    is_los   TYPE ty_los
                        iv_vcode TYPE qvcode
               CHANGING cv_ok    TYPE abap_bool
                        cv_text  TYPE string.
  DATA: ls_ud     TYPE bapi2045ud,
        ls_ret    TYPE bapireturn1,
        ls_stock  TYPE bapi2045d_il2.

  cv_ok = abap_false.

  ls_ud-ud_selected_set     = gc_auswahl.
  ls_ud-ud_plant            = is_los-werk.
  ls_ud-ud_code_group       = gc_auswahl.
  ls_ud-ud_code             = iv_vcode.
  ls_ud-ud_recorded_by_user = sy-uname.
  ls_ud-ud_stock_posting    = abap_true.

  CALL FUNCTION 'BAPI_INSPLOT_SETUSAGEDECISION'
    EXPORTING
      number     = is_los-prueflos
      ud_data    = ls_ud
      language   = sy-langu
    IMPORTING
      return     = ls_ret
      stock_data = ls_stock.

  IF ls_ret-type CA 'EA'.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    cv_text = |VE { iv_vcode } nicht gesetzt: { ls_ret-message }|.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  cv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Chargenmerkmal Z_FREIGABE (FREI / GESPERRT) und Freigabedatum
*&---------------------------------------------------------------------*
FORM klassifizierung USING    is_los    TYPE ty_los
                              iv_entsch TYPE char1
                     CHANGING cv_ok     TYPE abap_bool.
  DATA: lv_objkey TYPE bapi1003_key-object,
        lt_num    TYPE STANDARD TABLE OF bapi1003_alloc_values_num,
        lt_char   TYPE STANDARD TABLE OF bapi1003_alloc_values_char,
        lt_curr   TYPE STANDARD TABLE OF bapi1003_alloc_values_curr,
        lt_return TYPE STANDARD TABLE OF bapiret2.

  cv_ok = abap_false.

* Objektschluessel MCH1: Material 18-stellig + Charge
  lv_objkey      = is_los-matnr.
  lv_objkey+18   = is_los-charg.

  CALL FUNCTION 'BAPI_OBJCL_GETDETAIL'
    EXPORTING
      objectkey       = lv_objkey
      objecttable     = 'MCH1'
      classnum        = gc_klasse
      classtype       = '023'
    TABLES
      allocvaluesnum  = lt_num
      allocvalueschar = lt_char
      allocvaluescurr = lt_curr
      return          = lt_return.

  DELETE lt_char WHERE charact = gc_merkmal.
  APPEND VALUE #( charact    = gc_merkmal
                  value_char = COND #( WHEN iv_entsch = gc_annahme THEN 'FREI'
                                       ELSE 'GESPERRT' ) ) TO lt_char.
  DELETE lt_num WHERE charact = 'Z_FREIGABEDATUM'.
  APPEND VALUE #( charact    = 'Z_FREIGABEDATUM'
                  value_from = CONV #( sy-datum ) ) TO lt_num.

  CLEAR lt_return.
  CALL FUNCTION 'BAPI_OBJCL_CHANGE'
    EXPORTING
      objectkey          = lv_objkey
      objecttable        = 'MCH1'
      classnum           = gc_klasse
      classtype          = '023'
    TABLES
      allocvaluesnumnew  = lt_num
      allocvaluescharnew = lt_char
      allocvaluescurrnew = lt_curr
      return             = lt_return.

  IF line_exists( lt_return[ type = 'E' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  cv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Zurueckgewiesene Charge auf "nicht frei" setzen
*&---------------------------------------------------------------------*
FORM charge_sperren USING is_los TYPE ty_los.
  DATA: ls_att    TYPE bapibatchatt,
        ls_attx   TYPE bapibatchattx,
        lt_return TYPE STANDARD TABLE OF bapiret2.

  ls_att-restricted  = abap_true.
  ls_attx-restricted = abap_true.

  CALL FUNCTION 'BAPI_BATCH_CHANGE'
    EXPORTING
      material         = is_los-matnr
      batch            = is_los-charg
      plant            = is_los-werk
      batchattributes  = ls_att
      batchattributesx = ls_attx
    TABLES
      return           = lt_return.

  IF line_exists( lt_return[ type = 'E' ] ).
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Mail an QS-Verteiler
*&---------------------------------------------------------------------*
FORM mail_senden USING is_los  TYPE ty_los
                       iv_text TYPE string.
  DATA: lo_send  TYPE REF TO cl_bcs,
        lo_doc   TYPE REF TO cl_document_bcs,
        lo_dli   TYPE REF TO cl_distributionlist_bcs,
        lt_body  TYPE bcsy_text,
        lv_subj  TYPE so_obj_des.

  lv_subj = |Charge { is_los-charg } zurueckgewiesen (Los { is_los-prueflos })|.
  APPEND VALUE #( line = |Material: { is_los-matnr } { is_los-ktextmat }| ) TO lt_body.
  APPEND VALUE #( line = |Grund: { iv_text }| ) TO lt_body.
  APPEND VALUE #( line = |Losmenge: { is_los-losmenge }| ) TO lt_body.

  TRY.
      lo_send = cl_bcs=>create_persistent( ).
      lo_doc  = cl_document_bcs=>create_document( i_type    = 'RAW'
                                                   i_text    = lt_body
                                                   i_subject = lv_subj ).
      lo_send->set_document( lo_doc ).
      lo_dli = cl_distributionlist_bcs=>getu_persistent( i_dliname = p_dli
                                                         i_private = space ).
      lo_send->add_recipient( lo_dli ).
      lo_send->send( ).
      COMMIT WORK.
    CATCH cx_bcs.
*     Mail ist Zusatz - Freigabeprozess nicht abbrechen
  ENDTRY.
ENDFORM.

*&---------------------------------------------------------------------*
*& GMP-Protokoll fortschreiben
*&---------------------------------------------------------------------*
FORM protokoll_schreiben USING is_prot TYPE ty_prot.
  DATA ls_log TYPE zqm_freigabe_log.

  ls_log-prueflos = is_prot-prueflos.
  ls_log-matnr    = is_prot-matnr.
  ls_log-charg    = is_prot-charg.
  ls_log-entsch   = is_prot-entsch.
  ls_log-vcode    = is_prot-vcode.
  ls_log-text     = is_prot-text.
  ls_log-uname    = sy-uname.
  ls_log-datum    = sy-datum.
  ls_log-uzeit    = sy-uzeit.
  INSERT zqm_freigabe_log FROM ls_log.
  COMMIT WORK.
ENDFORM.
