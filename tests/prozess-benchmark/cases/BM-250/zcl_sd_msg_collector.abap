CLASS zcl_sd_msg_collector DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    METHODS constructor
      IMPORTING io_container TYPE REF TO /iwbep/if_message_container.
    METHODS add_bapiret
      IMPORTING it_return TYPE bapiret2_t.
    METHODS add_text
      IMPORTING iv_type TYPE symsgty
                iv_text TYPE string.
    METHODS raise_if_errors
      RAISING /iwbep/cx_mgw_busi_exception.
    METHODS save_log.

  PRIVATE SECTION.
    DATA: mo_container TYPE REF TO /iwbep/if_message_container,
          mv_log       TYPE balloghndl,
          mv_error     TYPE abap_bool.
ENDCLASS.



CLASS zcl_sd_msg_collector IMPLEMENTATION.

  METHOD constructor.
    mo_container = io_container.
    CALL FUNCTION 'BAL_LOG_CREATE'
      EXPORTING
        i_s_log      = VALUE bal_s_log( object    = 'ZSD'
                                        subobject = 'PREISFREIGABE'
                                        aluser    = sy-uname
                                        alprog    = sy-repid )
      IMPORTING
        e_log_handle = mv_log
      EXCEPTIONS
        OTHERS       = 1.
  ENDMETHOD.


  METHOD add_bapiret.
    mo_container->add_messages_from_bapi(
      it_bapi_messages         = it_return
      iv_determine_leading_msg = /iwbep/if_message_container=>gcs_leading_msg_search_option-first ).

    LOOP AT it_return INTO DATA(ls_ret).
      IF ls_ret-type CA 'EA'.
        mv_error = abap_true.
      ENDIF.
      CALL FUNCTION 'BAL_LOG_MSG_ADD'
        EXPORTING
          i_log_handle = mv_log
          i_s_msg      = VALUE bal_s_msg( msgty = ls_ret-type   msgid = ls_ret-id
                                          msgno = ls_ret-number msgv1 = ls_ret-message_v1
                                          msgv2 = ls_ret-message_v2 msgv3 = ls_ret-message_v3
                                          msgv4 = ls_ret-message_v4 )
        EXCEPTIONS
          OTHERS       = 1.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_text.
    mo_container->add_message_text_only( iv_msg_type = iv_type
                                         iv_msg_text = CONV #( iv_text ) ).
    IF iv_type CA 'EA'.
      mv_error = abap_true.
    ENDIF.
*    IF mv_log IS NOT INITIAL.                       "FreeText im Protokoll
*      CALL FUNCTION 'BAL_LOG_MSG_ADD_FREE_TEXT'      "abgeschaltet 2023-04,
*        EXPORTING                                    "Texte zu lang
*          i_log_handle = mv_log
*          i_msgty      = iv_type
*          i_text       = CONV char200( iv_text ).
*    ENDIF.
  ENDMETHOD.


  METHOD raise_if_errors.
    CHECK mv_error = abap_true.
*   Protokoll trotzdem sichern - wird mit dem Rollback des Changesets verworfen (!)
    save_log( ).
    RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
      EXPORTING
        message_container = mo_container.
  ENDMETHOD.


  METHOD save_log.
    CALL FUNCTION 'BAL_DB_SAVE'
      EXPORTING
        i_t_log_handle   = VALUE bal_t_logh( ( mv_log ) )
        i_in_update_task = abap_true
      EXCEPTIONS
        OTHERS           = 1.
  ENDMETHOD.

ENDCLASS.
