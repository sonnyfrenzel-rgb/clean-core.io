*&---------------------------------------------------------------------*
*&  Include           ZFI_ABGRENZUNG_SEL
*&---------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE text-b01.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_budat TYPE budat OBLIGATORY,
            p_stodt TYPE stodt OBLIGATORY,
            p_stgrd TYPE stgrd DEFAULT '05'.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE text-b02.
PARAMETERS: p_mode  TYPE ctu_mode DEFAULT 'N',
            p_sess  AS CHECKBOX DEFAULT 'X',
            p_group TYPE apqi-groupid DEFAULT 'ZABGRENZ'.
SELECTION-SCREEN END OF BLOCK b2.

AT SELECTION-SCREEN.
* Storno muss nach dem Buchungsdatum liegen
  IF p_stodt <= p_budat.
    MESSAGE e010.
  ENDIF.
* IF p_mode NA 'ANE'.
*   MESSAGE e011.
* ENDIF.
