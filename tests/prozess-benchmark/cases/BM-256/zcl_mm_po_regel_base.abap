CLASS zcl_mm_po_regel_base DEFINITION
  PUBLIC
  ABSTRACT
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES: BEGIN OF ty_bestellung,
             purchaseorder          TYPE ebeln,
             purchasingorganization TYPE ekorg,
             supplier               TYPE lifnr,
             companycode            TYPE bukrs,
             purchaseordertype      TYPE esart,
             purchaseorderdate      TYPE d,
             documentcurrency       TYPE waers,
           END OF ty_bestellung,
           tt_regel TYPE STANDARD TABLE OF REF TO zcl_mm_po_regel_base WITH EMPTY KEY.

    EVENTS verstoss
      EXPORTING
        VALUE(iv_ebeln)   TYPE ebeln
        VALUE(iv_text)    TYPE string
        VALUE(iv_schwere) TYPE symsgty.

    "! Fabrik: alle in ZMM_PO_REGEL aktiv geschalteten Regeln
    CLASS-METHODS alle_regeln
      RETURNING VALUE(rt_regel) TYPE tt_regel.

    "! Schablonenmethode - nicht redefinierbar
    METHODS pruefe FINAL
      IMPORTING is_bestellung TYPE ty_bestellung
                io_protokoll  TYPE REF TO zcl_mm_po_protokoll.

  PROTECTED SECTION.
    DATA: ms_bestellung TYPE ty_bestellung,
          mo_protokoll  TYPE REF TO zcl_mm_po_protokoll.

    METHODS ist_relevant
      RETURNING VALUE(rv_relevant) TYPE abap_bool.
    METHODS pruefe_intern ABSTRACT.
    METHODS melde
      IMPORTING iv_schwere TYPE symsgty
                iv_text    TYPE string.
ENDCLASS.



CLASS zcl_mm_po_regel_base IMPLEMENTATION.

  METHOD alle_regeln.
    DATA lo_regel TYPE REF TO zcl_mm_po_regel_base.

    SELECT klasse FROM zmm_po_regel
      WHERE aktiv = @abap_true
      ORDER BY reihenfolge
      INTO TABLE @DATA(lt_klasse).

    LOOP AT lt_klasse INTO DATA(ls_klasse).
      TRY.
          CREATE OBJECT lo_regel TYPE (ls_klasse-klasse).
          APPEND lo_regel TO rt_regel.
        CATCH cx_sy_create_object_error.
*         falsch gepflegte Regel wird still uebergangen
          CONTINUE.
      ENDTRY.
    ENDLOOP.
  ENDMETHOD.


  METHOD pruefe.
    ms_bestellung = is_bestellung.
    mo_protokoll  = io_protokoll.

    IF ist_relevant( ) = abap_false.
      RETURN.
    ENDIF.

    pruefe_intern( ).
  ENDMETHOD.


  METHOD ist_relevant.
*   Standard: jede Regel gilt fuer jede Bestellung
    rv_relevant = abap_true.
  ENDMETHOD.


  METHOD melde.
    mo_protokoll->hinzufuegen( iv_schwere = iv_schwere
                               iv_text    = iv_text ).
    RAISE EVENT verstoss
      EXPORTING
        iv_ebeln   = ms_bestellung-purchaseorder
        iv_text    = iv_text
        iv_schwere = iv_schwere.
  ENDMETHOD.

ENDCLASS.
