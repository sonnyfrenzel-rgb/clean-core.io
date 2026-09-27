*&---------------------------------------------------------------------*
*&  Include           ZFI_PERIODENABSCHLUSS_SEL
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY MEMORY ID buk,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_monat TYPE monat OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-b02.
PARAMETERS: p_streng AS CHECKBOX DEFAULT ' ',
            p_toler  TYPE dmbtr DEFAULT '1000.00'.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE text-b03.
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X',
            p_force AS CHECKBOX DEFAULT ' '.
SELECTION-SCREEN END OF BLOCK b3.
