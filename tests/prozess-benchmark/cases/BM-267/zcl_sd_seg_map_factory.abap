CLASS zcl_sd_seg_map_factory DEFINITION
  PUBLIC
  FINAL
  CREATE PRIVATE.

  PUBLIC SECTION.
    CLASS-METHODS get_mapper
      IMPORTING iv_segnam        TYPE edilsegtyp
      RETURNING VALUE(ro_mapper) TYPE REF TO zif_sd_seg_mapper.
ENDCLASS.



CLASS zcl_sd_seg_map_factory IMPLEMENTATION.

  METHOD get_mapper.
*   Kein Mapper = Segment wird ignoriert
    CASE iv_segnam.
      WHEN 'E1EDK01' OR 'E1EDKA1'.
        ro_mapper = NEW zcl_sd_map_header( ).
      WHEN 'E1EDP01' OR 'E1EDP19'.
        ro_mapper = NEW zcl_sd_map_item( ).
*     WHEN 'E1EDK02'.                    "Bestellnummer - geplant, nie umgesetzt
*       ro_mapper = NEW zcl_sd_map_ref( ).
      WHEN OTHERS.
        CLEAR ro_mapper.
    ENDCASE.
  ENDMETHOD.

ENDCLASS.
