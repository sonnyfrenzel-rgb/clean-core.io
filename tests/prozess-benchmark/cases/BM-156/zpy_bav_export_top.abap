*&---------------------------------------------------------------------*
*& Include ZPY_BAV_EXPORT_TOP
*&---------------------------------------------------------------------*
NODES: peras.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_pabrj TYPE pabrj OBLIGATORY,
            p_pabrp TYPE pabrp OBLIGATORY,
            p_abkrs TYPE abkrs OBLIGATORY DEFAULT 'D1',
            p_trag  TYPE char3 OBLIGATORY DEFAULT 'A01'.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_file  TYPE string LOWER CASE,
            p_test  AS CHECKBOX DEFAULT 'X',
            p_rerun AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b2.

TYPES: BEGIN OF ty_lgart,
         traeger TYPE char3,
         lgart   TYPE lgart,
         art     TYPE char2,     "AG = Arbeitgeber, AN = Entgeltumwandl.
       END OF ty_lgart,
       BEGIN OF ty_record,
         pernr   TYPE pernr_d,
         vertrag TYPE char20,
         fpper   TYPE fpper,
         satzart TYPE char1,     "L = laufend, R = Rueckrechnungsdiff.
         ag      TYPE maxbt,
         an      TYPE maxbt,
         ytd     TYPE maxbt,
       END OF ty_record.

DATA: gt_lgart     TYPE SORTED TABLE OF ty_lgart WITH UNIQUE KEY lgart,
      gt_rgdir     TYPE STANDARD TABLE OF pc261,
      gv_inper     TYPE iperi,
      gv_last      TYPE iperi,
      gv_log       TYPE balloghndl,
      gv_count_ee  TYPE i,
      gv_count_rec TYPE i,
      gv_sum_ag    TYPE maxbt,
      gv_sum_an    TYPE maxbt,
      gv_line      TYPE string,
      gv_prog      TYPE progname,
      gv_file_open TYPE abap_bool.

* Satz aufbauen: Feld anhaengen mit Trenner
DEFINE add_field.
  IF gv_line IS INITIAL.
    gv_line = &1.
  ELSE.
    CONCATENATE gv_line &1 INTO gv_line SEPARATED BY ';'.
  ENDIF.
END-OF-DEFINITION.
