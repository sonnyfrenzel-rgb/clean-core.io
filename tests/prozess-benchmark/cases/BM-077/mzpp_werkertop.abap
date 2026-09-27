*&---------------------------------------------------------------------*
*& Include MZPP_WERKERTOP - globale Daten
*&---------------------------------------------------------------------*

* Dynprofelder 0100
DATA: gv_scan  TYPE c LENGTH 30,        " Barcode AUFNR/VORNR
      gv_pernr TYPE pernr_d.

* Dynprofelder 0200
DATA: BEGIN OF zpp_s_rm,
        aufnr    TYPE aufnr,
        vornr    TYPE vornr,
        matnr    TYPE matnr,
        maktx    TYPE maktx,
        arbpl    TYPE arbpl,
        offen    TYPE ru_lmnga,
        gutmenge TYPE ru_lmnga,
        ausschuss TYPE ru_xmnga,
        grund    TYPE co_agrnd,
        endrm    TYPE xfeld,
        meinh    TYPE meins,
      END OF zpp_s_rm.

TYPES: BEGIN OF ty_komp,
         rsnum TYPE rsnum,
         rspos TYPE rspos,
         matnr TYPE matnr,
         werks TYPE werks_d,
         lgort TYPE lgort_d,
         charg TYPE charg_d,
         bdmng TYPE bdmng,
         meins TYPE meins,
         menge TYPE erfmg,
       END OF ty_komp.

DATA: gt_komp     TYPE STANDARD TABLE OF ty_komp,
      gs_komp     TYPE ty_komp,
      ok_code     TYPE sy-ucomm,
      gv_okcode   TYPE sy-ucomm,
      gv_aufpl    TYPE co_aufpl,
      gv_aplzl    TYPE co_aplzl,
      gv_objnr    TYPE j_objnr,
      gv_psmng    TYPE co_psmng,
      gv_werks    TYPE werks_d,
      gv_lgort    TYPE lgort_d,
      gv_letzter  TYPE abap_bool,
      gv_ok       TYPE abap_bool,
      gv_rueck    TYPE co_rueck,
      gv_druck    TYPE abap_bool VALUE abap_true.

CONTROLS tc_komp TYPE TABLEVIEW USING SCREEN 0200.
