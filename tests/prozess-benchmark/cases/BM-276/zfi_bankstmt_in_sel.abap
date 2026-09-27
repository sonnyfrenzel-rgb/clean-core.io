*&---------------------------------------------------------------------*
*&  Include  ZFI_BANKSTMT_IN_SEL
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_dir    TYPE eps2filnam LOWER CASE DEFAULT '/interface/fi/bank/in/',
            p_arcdir TYPE eps2filnam LOWER CASE DEFAULT '/interface/fi/bank/archive/',
            p_errdir TYPE eps2filnam LOWER CASE DEFAULT '/interface/fi/bank/error/',
            p_bukrs  TYPE bukrs OBLIGATORY DEFAULT '1000'.
SELECTION-SCREEN END OF BLOCK b1.
