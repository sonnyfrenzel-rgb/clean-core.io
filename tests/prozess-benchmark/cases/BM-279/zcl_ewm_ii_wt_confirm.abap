CLASS zcl_ewm_ii_wt_confirm DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Inbound-Proxy (asynchron): Quittierungen von Lageraufgaben aus dem
* Staplerleitsystem. Fehler werden NICHT als Fault gemeldet (sonst haengt
* die Queue im PI), sondern in die Fehlerqueue ZEWM_WTQ gestellt.
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    INTERFACES zii_ewm_wt_confirm_in.
ENDCLASS.



CLASS zcl_ewm_ii_wt_confirm IMPLEMENTATION.

  METHOD zii_ewm_wt_confirm_in~confirm.
    DATA: lo_proc  TYPE REF TO zcl_ewm_wt_processor,
          lo_queue TYPE REF TO zcl_ewm_wt_queue,
          lx_temp  TYPE REF TO zcx_ewm_wt_temp,
          lx_wt    TYPE REF TO zcx_ewm_wt,
          ls_conf  TYPE zcl_ewm_wt_processor=>ty_conf.

    lo_proc  = NEW #( ).
    lo_queue = NEW #( ).

    LOOP AT input-wt_confirmation-item INTO DATA(ls_item).
      ls_conf-lgnum = input-wt_confirmation-warehouse.
      ls_conf-tanum = ls_item-warehouse_task.
      ls_conf-qty   = ls_item-confirmed_quantity.
      ls_conf-uom   = ls_item-unit.
      ls_conf-nlpla = ls_item-destination_bin.
      ls_conf-user  = ls_item-operator.

      TRY.
          lo_proc->process( ls_conf ).
        CATCH zcx_ewm_wt_temp INTO lx_temp.
          lo_queue->enqueue( is_conf      = ls_conf
                             iv_text      = lx_temp->get_text( )
                             iv_temporary = abap_true ).
        CATCH zcx_ewm_wt INTO lx_wt.
          lo_queue->enqueue( is_conf      = ls_conf
                             iv_text      = lx_wt->get_text( )
                             iv_temporary = abap_false ).
      ENDTRY.
    ENDLOOP.
*   Queue-Eintraege werden mit dem COMMIT des Proxy-Rahmens festgeschrieben
  ENDMETHOD.

ENDCLASS.
