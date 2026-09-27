FUNCTION-POOL zsd_rma.                      "MESSAGE-ID zsd_rma
*----------------------------------------------------------------------*
* Funktionsgruppe ZSD_RMA - Retourenanlage aus dem Kundenportal (RFC)
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_rma_item,
         matnr TYPE matnr,
         menge TYPE kwmeng,
         augru TYPE augru,
       END OF ty_rma_item,
       tt_rma_item TYPE zsd_rma_item_t.        " DDIC-Tabellentyp (Zeile wie TY_RMA_ITEM)

CONSTANTS: gc_auart TYPE auart VALUE 'RE',
           gc_max_days_default TYPE i VALUE 30.

DATA: gs_vbrk       TYPE vbrk,
      gt_bapi_items TYPE STANDARD TABLE OF bapisditm,
      gt_return     TYPE bapiret2_t.

INCLUDE lzsd_rmac01.                        " Validator-Klassen
