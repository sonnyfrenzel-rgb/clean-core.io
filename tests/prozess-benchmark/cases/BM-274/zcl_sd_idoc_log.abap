CLASS zcl_sd_idoc_log DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Anwendungsprotokoll (Objekt ZSD_IDOC) + IDoc-Statussatz je IDoc
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING iv_docnum TYPE edi_docnum.
    METHODS add_text
      IMPORTING iv_text TYPE csequence.
    METHODS add_exception
      IMPORTING ix_error TYPE REF TO cx_root.
    METHODS set_status
      IMPORTING iv_status TYPE edi_status
                iv_vbeln  TYPE vbeln_vl OPTIONAL.
    METHODS save
      CHANGING ct_status TYPE t_idoc_status.

  PRIVATE SECTION.
    DATA: mv_docnum  TYPE edi_docnum,
          mv_handle  TYPE balloghndl,
          mv_lasttxt TYPE bapi_msg,
          ms_status  TYPE bdidocstat.
ENDCLASS.



CLASS zcl_sd_idoc_log IMPLEMENTATION.

  METHOD constructor.
    DATA ls_log TYPE bal_s_log.

    mv_docnum = iv_docnum.
    ls_log-object    = 'ZSD_IDOC'.
    ls_log-subobject = 'SHPCONF'.
    ls_log-extnumber = |{ iv_docnum ALPHA = OUT }|.
    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING
        i_s_log      = ls_log
      IMPORTING
        e_log_handle = mv_handle
      EXCEPTIONS
        OTHERS       = 1.
    IF sy-subrc <> 0.
*     ohne Protokoll weiterarbeiten - IDoc-Status reicht fuer den Support
      CLEAR mv_handle.
    ENDIF.
  ENDMETHOD.


  METHOD add_text.
    mv_lasttxt = iv_text.
    CHECK mv_handle IS NOT INITIAL.
    CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'
      EXPORTING
        i_log_handle = mv_handle
        i_msgty      = 'E'
        i_text       = iv_text
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.


  METHOD add_exception.
    add_text( ix_error->get_text( ) ).
  ENDMETHOD.


  METHOD set_status.
    CLEAR ms_status.
    ms_status-docnum = mv_docnum.
    ms_status-status = iv_status.
    ms_status-msgid  = 'ZSD'.
    IF iv_status = '53'.
      ms_status-msgty = 'S'.
      ms_status-msgno = '300'.
      ms_status-msgv1 = iv_vbeln.
    ELSE.
      ms_status-msgty = 'E'.
      ms_status-msgno = '301'.
      ms_status-msgv1 = mv_lasttxt(50).
      ms_status-msgv2 = mv_lasttxt+50(50).
    ENDIF.
  ENDMETHOD.


  METHOD save.
    DATA lt_handle TYPE bal_t_logh.

    APPEND ms_status TO ct_status.
    IF mv_handle IS INITIAL.
      RETURN.
    ENDIF.
    INSERT mv_handle INTO TABLE lt_handle.
    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING
        i_t_log_handle = lt_handle
      EXCEPTIONS
        OTHERS         = 1.
  ENDMETHOD.

ENDCLASS.
