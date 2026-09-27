CLASS zcx_co_kalk DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Ablehnung einer Kalkulation durch eine Pruefregel.
*   MV_SCHWERE  E = Fehler, W = Warnung (Preis wird nicht uebernommen)
*   MV_TEXT     Klartext fuer das Protokoll
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    DATA: mv_schwere TYPE symsgty READ-ONLY,
          mv_text    TYPE string  READ-ONLY.

    METHODS constructor
      IMPORTING
        textid     LIKE textid OPTIONAL
        previous   LIKE previous OPTIONAL
        mv_schwere TYPE symsgty OPTIONAL
        mv_text    TYPE string OPTIONAL.
ENDCLASS.



CLASS zcx_co_kalk IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( textid = textid previous = previous ).
    me->mv_schwere = mv_schwere.
    me->mv_text    = mv_text.
  ENDMETHOD.

ENDCLASS.
