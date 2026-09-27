FUNCTION z_ehs_unfall_anlegen.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_UNFALL) TYPE  ZEHS_S_UNFALL
*"  EXPORTING
*"     VALUE(EV_UNFALLNR) TYPE  ZEHS_UNFALLNR
*"     VALUE(ES_RETURN) TYPE  BAPIRET2
*"----------------------------------------------------------------------
* RFC-Baustein: Unfallmeldung aus dem Mitarbeiterportal anlegen
* 2021-03 LMA  Erstellung (Ablösung Papierformular Unfallbuch)
*----------------------------------------------------------------------
  DATA: lo_unfall  TYPE REF TO zcl_ehs_unfall,
        lo_handler TYPE REF TO zcl_ehs_unfall_handler,
        lx_unfall  TYPE REF TO zcx_ehs_unfall.

  AUTHORITY-CHECK OBJECT 'Z_EHS_UNF'
    ID 'WERKS' FIELD is_unfall-werks
    ID 'ACTVT' FIELD '01'.
  IF sy-subrc <> 0.
    es_return = VALUE #( type = 'E' id = 'ZEHS' number = '001'
                         message_v1 = is_unfall-werks ).
    RETURN.
  ENDIF.

  lo_handler = NEW #( ).
  TRY.
      lo_unfall = NEW #( is_unfall ).
      SET HANDLER lo_handler->on_gemeldet FOR lo_unfall.
      ev_unfallnr = lo_unfall->erfassen( ).
      COMMIT WORK.
      es_return = VALUE #( type = 'S' id = 'ZEHS' number = '000'
                           message_v1 = ev_unfallnr ).
    CATCH zcx_ehs_unfall INTO lx_unfall.
      ROLLBACK WORK.
      CLEAR ev_unfallnr.
      es_return = VALUE #( type = 'E' id = 'ZEHS' number = '002'
                           message = lx_unfall->get_text( ) ).
  ENDTRY.
ENDFUNCTION.
