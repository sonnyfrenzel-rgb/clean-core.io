*&---------------------------------------------------------------------*
*&  Include           ZFI_USTVA_SEL
*&---------------------------------------------------------------------*
* Selektionsbild UStVA
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-001.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY MEMORY ID buk,
            p_gjahr TYPE gjahr OBLIGATORY,
            p_monat TYPE monat OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-002.
PARAMETERS: p_toler TYPE wrbtr DEFAULT '1.00',
            p_sovz  TYPE wrbtr,
            p_korr  AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE text-003.
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X',
            p_datei TYPE char128 LOWER CASE
                    DEFAULT '/usr/sap/interface/ustva/'.
SELECTION-SCREEN END OF BLOCK b3.

* text-001 Meldezeitraum
* text-002 Abstimmung / Sondervorauszahlung / Berichtigung
* text-003 Ablauf
