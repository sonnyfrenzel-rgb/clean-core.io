*----------------------------------------------------------------------*
* Ausnahmeklasse der Lieferantenbewertung
* Meldungsklasse ZMM_LB: 001 keine Einteilungen, 002 Bewertung fehlt,
*                        010 gesichert, 011 eskaliert, 020 Sichern fehlgeschlagen
*----------------------------------------------------------------------*
CLASS zcx_mm_lb DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_t100_message.

    CONSTANTS:
      BEGIN OF speichern_fehler,
        msgid TYPE symsgid VALUE 'ZMM_LB',
        msgno TYPE symsgno VALUE '020',
        attr1 TYPE scx_attrname VALUE 'LIFNR',
        attr2 TYPE scx_attrname VALUE '',
        attr3 TYPE scx_attrname VALUE '',
        attr4 TYPE scx_attrname VALUE '',
      END OF speichern_fehler.

    DATA lifnr TYPE lifnr READ-ONLY.

    METHODS constructor
      IMPORTING
        textid   LIKE if_t100_message=>t100key OPTIONAL
        previous LIKE previous OPTIONAL
        lifnr    TYPE lifnr OPTIONAL.
ENDCLASS.



CLASS zcx_mm_lb IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    me->lifnr = lifnr.
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = if_t100_message=>default_textid.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.
  ENDMETHOD.

ENDCLASS.
