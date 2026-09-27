CLASS zcl_mm_pr_notifier DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.

*----------------------------------------------------------------------*
* Benachrichtigung zum Banf-Freigabeprozess (SAPoffice-Mail)
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    CLASS-METHODS on_state_changed
      FOR EVENT state_changed OF zcl_mm_pr_approval
      IMPORTING ev_banfn ev_state ev_recipient.

  PRIVATE SECTION.
    CLASS-METHODS send_mail
      IMPORTING iv_user    TYPE syuname
                iv_subject TYPE so_obj_des
                iv_banfn   TYPE banfn.
ENDCLASS.



CLASS zcl_mm_pr_notifier IMPLEMENTATION.

  METHOD on_state_changed.
    CASE ev_state.
      WHEN 'OPEN' OR 'LEVEL2'.
        send_mail( iv_user    = ev_recipient
                   iv_subject = |Banf { ev_banfn } zur Freigabe|
                   iv_banfn   = ev_banfn ).
      WHEN 'RELEASED'.
        send_mail( iv_user    = ev_recipient
                   iv_subject = |Banf { ev_banfn } freigegeben|
                   iv_banfn   = ev_banfn ).
      WHEN 'REJECTED'.
        send_mail( iv_user    = ev_recipient
                   iv_subject = |Banf { ev_banfn } abgelehnt|
                   iv_banfn   = ev_banfn ).
    ENDCASE.
  ENDMETHOD.


  METHOD send_mail.
    DATA: ls_doc  TYPE sodocchgi1,
          lt_rec  TYPE STANDARD TABLE OF somlreci1,
          lt_body TYPE STANDARD TABLE OF solisti1.

    ls_doc-obj_descr = iv_subject.
    ls_doc-obj_langu = sy-langu.
    APPEND VALUE #( line = |Bestellanforderung { iv_banfn }, Transaktion ME53N| ) TO lt_body.
    APPEND VALUE #( receiver = iv_user rec_type = 'B' ) TO lt_rec.

*   alter SAPoffice-Baustein, Versand mit dem naechsten COMMIT WORK
    CALL FUNCTION 'SO_NEW_DOCUMENT_SEND_API1'
      EXPORTING
        document_data              = ls_doc
        document_type              = 'RAW'
      TABLES
        object_content             = lt_body
        receivers                  = lt_rec
      EXCEPTIONS
        too_many_receivers         = 1
        document_not_sent          = 2
        document_type_not_exist    = 3
        operation_no_authorization = 4
        parameter_error            = 5
        x_error                    = 6
        enqueue_error              = 7
        OTHERS                     = 8.
*   Fehler beim Mailversand bewusst ignoriert (Ticket 2231)
  ENDMETHOD.

ENDCLASS.
