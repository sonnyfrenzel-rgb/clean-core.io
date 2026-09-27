CLASS lhc_retourepos DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS validate_menge FOR VALIDATE ON SAVE
      IMPORTING keys FOR retourepos~validateMenge.
ENDCLASS.

CLASS lhc_retourepos IMPLEMENTATION.
  METHOD validate_menge.
    " Retourenmenge darf die fakturierte Menge nicht uebersteigen (Ticket SD-4711)
    READ ENTITIES OF zi_retoure IN LOCAL MODE
      ENTITY retourepos
        FIELDS ( RetMenge FaktMenge Mengeneinheit ) WITH CORRESPONDING #( keys )
      RESULT DATA(lt_pos).

    LOOP AT lt_pos INTO DATA(ls_pos).
      IF ls_pos-RetMenge <= 0 OR ls_pos-RetMenge > ls_pos-FaktMenge.
        APPEND VALUE #( %tky = ls_pos-%tky ) TO failed-retourepos.
        APPEND VALUE #( %tky        = ls_pos-%tky
                        %state_area = 'VALIDATE_MENGE'
                        %msg        = new_message( id       = 'ZSD_RET'
                                                   number   = '012'
                                                   severity = if_abap_behv_message=>severity-error
                                                   v1       = ls_pos-RetMenge
                                                   v2       = ls_pos-FaktMenge )
                        %element-RetMenge = if_abap_behv=>mk-on ) TO reported-retourepos.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.
ENDCLASS.
