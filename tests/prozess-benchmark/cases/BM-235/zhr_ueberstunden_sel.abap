*&---------------------------------------------------------------------*
*&  Include           ZHR_UEBERSTUNDEN_SEL
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
PARAMETERS:     p_per   TYPE spmon OBLIGATORY.
SELECT-OPTIONS: s_pernr FOR catsdb-pernr,
                s_awart FOR catsdb-awart OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-b02.
PARAMETERS:     p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

* frueher: Pruefung Echtlauf im Dialog
*AT SELECTION-SCREEN.
*  IF p_test IS INITIAL AND sy-batch IS INITIAL.
*    MESSAGE w010.
*  ENDIF.
