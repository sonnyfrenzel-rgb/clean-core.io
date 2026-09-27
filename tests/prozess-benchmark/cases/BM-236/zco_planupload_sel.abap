*&---------------------------------------------------------------------*
*&  Include           ZCO_PLANUPLOAD_SEL
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
PARAMETERS: p_kokrs TYPE kokrs OBLIGATORY DEFAULT '1000',
            p_gjahr TYPE gjahr OBLIGATORY,
            p_versn TYPE versn OBLIGATORY DEFAULT '001'.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-b02.
PARAMETERS: p_file  TYPE localfile OBLIGATORY
                    DEFAULT '/usr/sap/trans/data/planung/kosten.csv',
            p_errf  TYPE localfile
                    DEFAULT '/usr/sap/trans/data/planung/kosten_fehler.csv'.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE text-b03.
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X',
            p_alles AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b3.
