*----------------------------------------------------------------------*
* Include LZMM_KITF01
*----------------------------------------------------------------------*
FORM log_result USING iv_matnr TYPE matnr
                      iv_msgty TYPE msgty
                      iv_text  TYPE csequence.
  APPEND VALUE #( matnr = iv_matnr msgty = iv_msgty text = iv_text ) TO gt_result.
ENDFORM.

FORM post_reservation USING    it_comp  TYPE tt_comp
                               iv_aufnr TYPE aufnr
                      CHANGING cv_rsnum TYPE rsnum
                      RAISING  lcx_kit.
  DATA: ls_head   TYPE bapi2093_res_head,
        lt_items  TYPE STANDARD TABLE OF bapi2093_res_item,
        lt_return TYPE STANDARD TABLE OF bapiret2.

* Umlagerungsreservierung 311 ins Produktionsversorgungslager
  ls_head-res_date   = sy-datum.
  ls_head-created_by = sy-uname.
  ls_head-move_type  = gc_bwart.
  ls_head-plant      = VALUE #( it_comp[ 1 ]-werks OPTIONAL ).
  ls_head-move_stloc = gc_psa_lgort.

  lt_items = VALUE #( FOR c IN it_comp WHERE ( alloc > 0 )
                      ( material  = c-matnr
                        plant     = c-werks
                        stge_loc  = c-lgort
                        batch     = c-charg
                        entry_qnt = c-alloc
                        entry_uom = c-meins
                        req_date  = sy-datum
                        item_text = |Kit { iv_aufnr }| ) ).

  CALL FUNCTION 'BAPI_RESERVATION_CREATE1'
    EXPORTING
      reservationheader = ls_head
    IMPORTING
      reservation       = cv_rsnum
    TABLES
      reservationitems  = lt_items
      return            = lt_return.

  IF cv_rsnum IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    RAISE EXCEPTION TYPE lcx_kit
      EXPORTING iv_text = VALUE #( lt_return[ type = 'E' ]-message
                                   DEFAULT 'Reservierung nicht angelegt' ).
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  PERFORM log_result USING space 'S' |Reservierung { cv_rsnum } angelegt|.
ENDFORM.
