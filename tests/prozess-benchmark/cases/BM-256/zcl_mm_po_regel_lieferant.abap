CLASS zcl_mm_po_regel_lieferant DEFINITION
  PUBLIC
  INHERITING FROM zcl_mm_po_regel_base
  FINAL
  CREATE PUBLIC.

*----------------------------------------------------------------------*
* Regel LIEFERANT: gesperrte Lieferanten und fehlende Einkaufsorg.-Daten
* Gilt nicht fuer Umlagerungsbestellungen (Art UB) - dort ist der
* "Lieferant" ein Werk.
*----------------------------------------------------------------------*
  PROTECTED SECTION.
    METHODS ist_relevant  REDEFINITION.
    METHODS pruefe_intern REDEFINITION.
ENDCLASS.



CLASS zcl_mm_po_regel_lieferant IMPLEMENTATION.

  METHOD ist_relevant.
    rv_relevant = xsdbool( ms_bestellung-purchaseordertype <> 'UB' ).
  ENDMETHOD.


  METHOD pruefe_intern.
    SELECT SINGLE supplier, postingisblocked, purchasingisblocked
      FROM i_supplier
      WHERE supplier = @ms_bestellung-supplier
      INTO @DATA(ls_lief).
    IF sy-subrc <> 0.
      melde( iv_schwere = 'E'
             iv_text    = |Lieferant { ms_bestellung-supplier } existiert nicht| ).
      RETURN.
    ENDIF.

    IF ls_lief-purchasingisblocked = abap_true.
      melde( iv_schwere = 'E'
             iv_text    = |Lieferant { ms_bestellung-supplier } zentral fuer Einkauf gesperrt| ).
    ELSEIF ls_lief-postingisblocked = abap_true.
*     Buchungssperre stoert die Bestellung nicht, aber spaeter die Rechnung
      melde( iv_schwere = 'W'
             iv_text    = |Lieferant { ms_bestellung-supplier } fuer Buchungen gesperrt| ).
    ENDIF.

    SELECT SINGLE purchasingisblockedforsupplier
      FROM i_supplierpurchasingorg
      WHERE supplier               = @ms_bestellung-supplier
        AND purchasingorganization = @ms_bestellung-purchasingorganization
      INTO @DATA(lv_ekorg_sperre).
    IF sy-subrc <> 0.
      melde( iv_schwere = 'E'
             iv_text    = |Lieferant nicht in Einkaufsorg. { ms_bestellung-purchasingorganization } angelegt| ).
    ELSEIF lv_ekorg_sperre = abap_true.
      melde( iv_schwere = 'E'
             iv_text    = |Lieferant in Einkaufsorg. { ms_bestellung-purchasingorganization } gesperrt| ).
    ENDIF.
  ENDMETHOD.

ENDCLASS.
