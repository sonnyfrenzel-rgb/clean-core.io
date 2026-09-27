*&---------------------------------------------------------------------*
*& Include ZPP_MES_FILE_TOP
*&---------------------------------------------------------------------*
PARAMETERS: p_werks TYPE werks_d OBLIGATORY,
            p_exp   AS CHECKBOX DEFAULT 'X',
            p_imp   AS CHECKBOX DEFAULT 'X',
            p_pfad  TYPE string LOWER CASE DEFAULT '/interface/mes/',
            p_tage  TYPE i DEFAULT 2.

TYPES: BEGIN OF ty_log,
         msgty TYPE symsgty,
         text  TYPE c LENGTH 200,
       END OF ty_log.

TYPES: BEGIN OF ty_auf,
         aufnr TYPE aufnr,
         objnr TYPE j_objnr,
         aufpl TYPE co_aufpl,
         gstrp TYPE co_gstrp,
         gltrp TYPE co_gltrp,
         matnr TYPE matnr,
         psmng TYPE co_psmng,
         amein TYPE co_amein,
       END OF ty_auf.

TYPES: BEGIN OF ty_satz,
         typ   TYPE c LENGTH 1,
         mesid TYPE c LENGTH 20,
         aufnr TYPE aufnr,
         vornr TYPE vornr,
         menge TYPE c LENGTH 17,
         aus   TYPE c LENGTH 17,
         meinh TYPE meins,
         lgort TYPE lgort_d,
         charg TYPE charg_d,
         endrm TYPE c LENGTH 1,
       END OF ty_satz.

DATA: gt_log    TYPE STANDARD TABLE OF ty_log,
      gv_handle TYPE balloghndl,
      gv_text   TYPE c LENGTH 200,
      gv_fehler TYPE i.

* Protokollzeile merken; Fehler zaehlen
DEFINE mes_log.
  APPEND VALUE #( msgty = &1 text = &2 ) TO gt_log.
  IF &1 = 'E'.
    gv_fehler = gv_fehler + 1.
  ENDIF.
END-OF-DEFINITION.
