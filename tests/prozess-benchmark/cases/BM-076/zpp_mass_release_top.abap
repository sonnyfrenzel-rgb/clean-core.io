*&---------------------------------------------------------------------*
*& Include ZPP_MASS_RELEASE_TOP - Selektionsbild und globale Daten
*&---------------------------------------------------------------------*
TABLES: aufk, afko.

SELECTION-SCREEN BEGIN OF BLOCK sel WITH FRAME TITLE TEXT-s01.
PARAMETERS: p_werks TYPE werks_d OBLIGATORY,
            p_auart TYPE aufart  OBLIGATORY DEFAULT 'PP01',
            p_bis   TYPE co_gstrp OBLIGATORY.
SELECT-OPTIONS: s_fevor FOR afko-fevor,
                s_aufnr FOR aufk-aufnr.
SELECTION-SCREEN END OF BLOCK sel.

SELECTION-SCREEN BEGIN OF BLOCK par WITH FRAME TITLE TEXT-s02.
PARAMETERS: p_para  AS CHECKBOX DEFAULT 'X',
            p_group TYPE rzlli_apcl DEFAULT 'parallel_generators',
            p_maxt  TYPE i DEFAULT 8,
            p_paket TYPE i DEFAULT 50,
            p_test  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK par.

TYPES: BEGIN OF ty_order,
         aufnr TYPE aufnr,
         objnr TYPE j_objnr,
         gstrp TYPE co_gstrp,
       END OF ty_order,
       tt_order TYPE STANDARD TABLE OF ty_order WITH DEFAULT KEY.

TYPES: BEGIN OF ty_paket,
         nr     TYPE i,
         orders TYPE STANDARD TABLE OF zpp_s_aufnr WITH DEFAULT KEY,
       END OF ty_paket.

DATA: gt_orders  TYPE tt_order,
      gt_pakete  TYPE STANDARD TABLE OF ty_paket,
      gs_paket   TYPE ty_paket,
      gt_result  TYPE STANDARD TABLE OF zpp_s_rel_result,
      gv_sent    TYPE i,
      gv_recv    TYPE i,
      gv_max     TYPE i,
      gv_free    TYPE i,
      gv_task    TYPE c LENGTH 8,
      gv_msg     TYPE c LENGTH 80,
      gv_handle  TYPE balloghndl.

CONSTANTS: gc_st_ok   TYPE c LENGTH 1 VALUE 'S',
           gc_st_err  TYPE c LENGTH 1 VALUE 'E',
           gc_st_lock TYPE c LENGTH 1 VALUE 'L',
           gc_st_test TYPE c LENGTH 1 VALUE 'T'.
