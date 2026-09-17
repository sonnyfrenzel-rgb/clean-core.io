CLASS lhc_order DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS set_status FOR DETERMINE ON MODIFY
      IMPORTING keys FOR order~set_status.
ENDCLASS.

CLASS lhc_order IMPLEMENTATION.
  METHOD set_status.
    READ ENTITIES OF zi_order IN LOCAL MODE
      ENTITY order
        FIELDS ( net_amount ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_orders).
    MODIFY ENTITIES OF zi_order IN LOCAL MODE
      ENTITY order
        UPDATE FIELDS ( status )
        WITH VALUE #( FOR ls_order IN lt_orders
                      ( %tky   = ls_order-%tky
                        status = COND #( WHEN ls_order-net_amount > 10000
                                         THEN 'M' ELSE 'A' ) ) )
      REPORTED DATA(lt_reported).
    reported = CORRESPONDING #( DEEP lt_reported ).
  ENDMETHOD.
ENDCLASS.
