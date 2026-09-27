CLASS zcl_zsd_auftrag_mpc_ext DEFINITION
  PUBLIC
  INHERITING FROM zcl_zsd_auftrag_mpc
  CREATE PUBLIC.

  PUBLIC SECTION.
*   Tiefe Struktur fuer Deep Insert Auftrag -> Positionen
*   Navigationseigenschaft im SEGW: ToItems (Auftrag 1:n Position)
    TYPES: BEGIN OF ts_deep_auftrag.
             INCLUDE TYPE ts_auftrag.
    TYPES:   toitems TYPE tt_position,
           END OF ts_deep_auftrag.

    METHODS define REDEFINITION.
ENDCLASS.



CLASS zcl_zsd_auftrag_mpc_ext IMPLEMENTATION.

  METHOD define.
    DATA lo_entity_type TYPE REF TO /iwbep/if_mgw_odata_entity_typ.

    super->define( ).

    lo_entity_type = model->get_entity_type( iv_entity_name = 'Auftrag' ).
    lo_entity_type->bind_structure( iv_structure_name  = 'ZCL_ZSD_AUFTRAG_MPC_EXT=>TS_DEEP_AUFTRAG'
                                    iv_bind_conversions = abap_true ).
  ENDMETHOD.

ENDCLASS.
