*&---------------------------------------------------------------------*
*& Include ZMM_ABC_TOP - Globale Daten und Selektionsbild
*&---------------------------------------------------------------------*
TABLES: t001w.

TYPES: BEGIN OF ty_ausgabe,
         werks  TYPE werks_d,
         anz_a  TYPE i,
         anz_b  TYPE i,
         anz_c  TYPE i,
         wert_a TYPE dmbtr,
         status TYPE char10,
       END OF ty_ausgabe.

DATA: go_runner  TYPE REF TO zcl_mm_abc_runner,
      gt_werke   TYPE zcl_mm_abc_runner=>tt_werk,
      gt_ausgabe TYPE STANDARD TABLE OF ty_ausgabe WITH EMPTY KEY.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  SELECT-OPTIONS: s_werks FOR t001w-werks OBLIGATORY.
  PARAMETERS:     p_von TYPE d,
                  p_bis TYPE d.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  PARAMETERS: p_grza TYPE p LENGTH 3 DECIMALS 0 DEFAULT 80,   "kumulierter Wertanteil A in %
              p_grzb TYPE p LENGTH 3 DECIMALS 0 DEFAULT 95,   "kumulierter Wertanteil A+B in %
              p_marc AS CHECKBOX DEFAULT abap_false,          "ABC-Kennzeichen im Materialstamm
              p_par  AS CHECKBOX DEFAULT abap_true.           "parallel je Werk
SELECTION-SCREEN END OF BLOCK b2.
