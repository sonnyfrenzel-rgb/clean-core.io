*&---------------------------------------------------------------------*
*& Include ZSD_BONUS_RUN_TOP - Daten und Selektionsbild
*&---------------------------------------------------------------------*
TABLES: vbrk.
TYPE-POOLS: slis.

TYPES: BEGIN OF ty_umsatz,
         kunrg  TYPE vbrk-kunrg,
         waerk  TYPE vbrk-waerk,
         umsatz TYPE vbrp-netwr,
       END OF ty_umsatz,
       BEGIN OF ty_out,
         kunrg   TYPE vbrk-kunrg,
         waerk   TYPE vbrk-waerk,
         umsatz  TYPE vbrp-netwr,
         prozent TYPE zsd_bonus_proz,
         bonus   TYPE vbrp-netwr,
         vbeln   TYPE vbak-vbeln,
         status  TYPE char1,
         text    TYPE bapi_msg,
       END OF ty_out.

CONSTANTS: gc_auart_bonus TYPE auart VALUE 'ZG2',
           gc_augru_bonus TYPE augru VALUE 'Z30',
           gc_matnr_bonus TYPE matnr VALUE 'BONUS',
           gc_kschl_bonus TYPE kschl VALUE 'ZBON'.

DATA: gt_umsatz TYPE STANDARD TABLE OF ty_umsatz,
      gs_umsatz TYPE ty_umsatz,
      gt_out    TYPE STANDARD TABLE OF ty_out,
      go_calc   TYPE REF TO zcl_sd_bonus_calc,
      gx_bonus  TYPE REF TO zcx_sd_bonus.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS: p_vkorg TYPE vkorg OBLIGATORY DEFAULT '1000',
            p_vtweg TYPE vtweg OBLIGATORY DEFAULT '10',
            p_spart TYPE spart OBLIGATORY DEFAULT '00',
            p_gjahr TYPE gjahr OBLIGATORY.
SELECT-OPTIONS: s_kunrg FOR vbrk-kunrg.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_test AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.
