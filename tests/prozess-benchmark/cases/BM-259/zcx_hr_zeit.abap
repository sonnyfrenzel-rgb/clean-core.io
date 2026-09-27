CLASS zcx_hr_zeit DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_t100_message.

    CONSTANTS:
      BEGIN OF keine_auswahl,
        msgid TYPE symsgid VALUE 'ZHR_CATS', msgno TYPE symsgno VALUE '001',
        attr1 TYPE scx_attrname VALUE '', attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '', attr4 TYPE scx_attrname VALUE '',
      END OF keine_auswahl,
      BEGIN OF keine_berechtigung,
        msgid TYPE symsgid VALUE 'ZHR_CATS', msgno TYPE symsgno VALUE '002',
        attr1 TYPE scx_attrname VALUE '', attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '', attr4 TYPE scx_attrname VALUE '',
      END OF keine_berechtigung,
      BEGIN OF fremder_mitarbeiter,
        msgid TYPE symsgid VALUE 'ZHR_CATS', msgno TYPE symsgno VALUE '003',
        attr1 TYPE scx_attrname VALUE 'PERNR', attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '', attr4 TYPE scx_attrname VALUE '',
      END OF fremder_mitarbeiter,
      BEGIN OF nicht_offen,
        msgid TYPE symsgid VALUE 'ZHR_CATS', msgno TYPE symsgno VALUE '004',
        attr1 TYPE scx_attrname VALUE 'PERNR', attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '', attr4 TYPE scx_attrname VALUE '',
      END OF nicht_offen,
      BEGIN OF gesperrt,
        msgid TYPE symsgid VALUE 'ZHR_CATS', msgno TYPE symsgno VALUE '005',
        attr1 TYPE scx_attrname VALUE 'PERNR', attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '', attr4 TYPE scx_attrname VALUE '',
      END OF gesperrt,
      BEGIN OF stunden_ungueltig,
        msgid TYPE symsgid VALUE 'ZHR_CATS', msgno TYPE symsgno VALUE '006',
        attr1 TYPE scx_attrname VALUE 'PERNR', attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '', attr4 TYPE scx_attrname VALUE '',
      END OF stunden_ungueltig.

    DATA pernr TYPE pernr_d READ-ONLY.

    METHODS constructor
      IMPORTING
        textid   LIKE if_t100_message=>t100key OPTIONAL
        previous LIKE previous OPTIONAL
        pernr    TYPE pernr_d OPTIONAL.
ENDCLASS.



CLASS zcx_hr_zeit IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    me->pernr = pernr.
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = if_t100_message=>default_textid.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
