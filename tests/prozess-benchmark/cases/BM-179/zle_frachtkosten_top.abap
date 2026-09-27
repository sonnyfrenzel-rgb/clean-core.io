*&---------------------------------------------------------------------*
*& Include ZLE_FRACHTKOSTEN_TOP
*&---------------------------------------------------------------------*
TABLES: vttk.

TYPES: BEGIN OF ty_tr,
         tdlnr      TYPE vttk-tdlnr,
         tknum      TYPE vttk-tknum,
         shtyp      TYPE vttk-shtyp,
         route      TYPE vttk-route,
         dtabf      TYPE vttk-dtabf,
         gewicht_kg TYPE p LENGTH 13 DECIMALS 3,
         fracht     TYPE p LENGTH 13 DECIMALS 2,
         fknum      TYPE vfkk-fknum,
         fehler     TYPE char60,
       END OF ty_tr.

DATA: gt_tr    TYPE STANDARD TABLE OF ty_tr,
      gt_bdc   TYPE STANDARD TABLE OF bdcdata,
      gv_fknum TYPE vfkk-fknum.

* Batch-Input-Hilfen
DEFINE bdc_dynpro.
  APPEND VALUE #( program = &1 dynpro = &2 dynbegin = 'X' ) TO gt_bdc.
END-OF-DEFINITION.
DEFINE bdc_field.
  APPEND VALUE #( fnam = &1 fval = &2 ) TO gt_bdc.
END-OF-DEFINITION.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_tdlnr FOR vttk-tdlnr,
                s_shtyp FOR vttk-shtyp,
                s_datum FOR vttk-dtabf OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.
SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_fkart TYPE vfkk-fkart DEFAULT 'ZFK1' OBLIGATORY,
            p_mode  TYPE ctu_params-dismode DEFAULT 'N',
            p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.
