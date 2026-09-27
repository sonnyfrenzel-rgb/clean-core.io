*----------------------------------------------------------------------*
* Include ZMM_NIEDERSTWERT_SEL - Selektionsbild
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS: p_bukrs TYPE t001-bukrs OBLIGATORY MEMORY ID buk,
            p_stich TYPE sy-datum OBLIGATORY.
SELECT-OPTIONS: s_mtart FOR mara-mtart DEFAULT 'ROH',
                s_matnr FOR mara-matnr.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_schw  TYPE p LENGTH 5 DECIMALS 2 DEFAULT '5.00',
            p_minw  TYPE salk3 DEFAULT '100.00'.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-b03.
PARAMETERS: p_test AS CHECKBOX DEFAULT 'X',
            p_mode TYPE ctu_mode DEFAULT 'N'.
SELECTION-SCREEN END OF BLOCK b3.
