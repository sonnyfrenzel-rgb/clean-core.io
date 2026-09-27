CLASS zcx_sd_auftrag DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_t100_message.
    INTERFACES if_t100_dyn_msg.

    CONSTANTS gc_msgid TYPE symsgid VALUE 'ZSD_ORDER'.

    DATA: mv_objekt TYPE string READ-ONLY,
          mv_grund  TYPE string READ-ONLY.

    METHODS constructor
      IMPORTING
        textid    LIKE if_t100_message=>t100key OPTIONAL
        previous  LIKE previous OPTIONAL
        mv_objekt TYPE string OPTIONAL
        mv_grund  TYPE string OPTIONAL.

    "! Erzeugt die Ausnahme zu Nachricht ZSD_ORDER/iv_msgno
    CLASS-METHODS neu
      IMPORTING iv_msgno        TYPE symsgno
                iv_objekt       TYPE any
                iv_grund        TYPE any OPTIONAL
      RETURNING VALUE(rx_fehler) TYPE REF TO zcx_sd_auftrag.
ENDCLASS.



CLASS zcx_sd_auftrag IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    me->mv_objekt = mv_objekt.
    me->mv_grund  = mv_grund.
    CLEAR me->textid.
    IF textid IS INITIAL.
      if_t100_message~t100key = if_t100_message=>default_textid.
    ELSE.
      if_t100_message~t100key = textid.
    ENDIF.
  ENDMETHOD.


  METHOD neu.
    rx_fehler = NEW zcx_sd_auftrag(
      textid    = VALUE #( msgid = gc_msgid msgno = iv_msgno
                           attr1 = 'MV_OBJEKT' attr2 = 'MV_GRUND' )
      mv_objekt = CONV #( iv_objekt )
      mv_grund  = CONV #( iv_grund ) ).
  ENDMETHOD.

ENDCLASS.
