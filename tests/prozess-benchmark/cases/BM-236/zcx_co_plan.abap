CLASS zcx_co_plan DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_t100_message.

    CONSTANTS:
      BEGIN OF version_unbekannt,
        msgid TYPE symsgid VALUE 'ZCO_PU',
        msgno TYPE symsgno VALUE '020',
        attr1 TYPE scx_attrname VALUE 'MV_V1',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF version_unbekannt,
      BEGIN OF periode_ungueltig,
        msgid TYPE symsgid VALUE 'ZCO_PU',
        msgno TYPE symsgno VALUE '021',
        attr1 TYPE scx_attrname VALUE 'MV_V1',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF periode_ungueltig,
      BEGIN OF kostl_ungueltig,
        msgid TYPE symsgid VALUE 'ZCO_PU',
        msgno TYPE symsgno VALUE '022',
        attr1 TYPE scx_attrname VALUE 'MV_V1',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF kostl_ungueltig,
      BEGIN OF kstar_ungueltig,
        msgid TYPE symsgid VALUE 'ZCO_PU',
        msgno TYPE symsgno VALUE '023',
        attr1 TYPE scx_attrname VALUE 'MV_V1',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF kstar_ungueltig,
      BEGIN OF kstar_nicht_primaer,
        msgid TYPE symsgid VALUE 'ZCO_PU',
        msgno TYPE symsgno VALUE '024',
        attr1 TYPE scx_attrname VALUE 'MV_V1',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF kstar_nicht_primaer.

    DATA mv_v1 TYPE string READ-ONLY.

    METHODS constructor
      IMPORTING
        textid   LIKE if_t100_message=>t100key OPTIONAL
        previous LIKE previous OPTIONAL
        mv_v1    TYPE any OPTIONAL.
ENDCLASS.



CLASS zcx_co_plan IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    me->mv_v1 = mv_v1.
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = if_t100_message=>default_textid.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
