FUNCTION-POOL zco_leistung MESSAGE-ID zco_lv.
*----------------------------------------------------------------------*
* Funktionsgruppe ZCO_LEISTUNG
* Verrechnung gemessener IT-Leistungen (Ticketsystem -> Z-Tabelle)
* auf empfangende Kostenstellen, monatlich per Job ZCO_LV_MONAT
*----------------------------------------------------------------------*
TYPES: BEGIN OF gty_leist,
         lfdnr     TYPE numc10,
         kokrs     TYPE kokrs,
         gjahr     TYPE gjahr,
         perio     TYPE poper,
         skostl    TYPE kostl,
         lstar     TYPE lstar,
         ekostl    TYPE kostl,
         menge     TYPE menge_d,
         meinh     TYPE meins,
         status    TYPE c LENGTH 1,
       END OF gty_leist.

DATA: gt_leist   TYPE STANDARD TABLE OF gty_leist,
      gt_return  TYPE STANDARD TABLE OF bapiret2,
      gt_items   TYPE STANDARD TABLE OF bapiaaitm,
      gs_header  TYPE bapidochdrp.

CONSTANTS: gc_offen      TYPE c LENGTH 1 VALUE ' ',
           gc_verrechnet TYPE c LENGTH 1 VALUE 'V',
           gc_fehler     TYPE c LENGTH 1 VALUE 'F'.
