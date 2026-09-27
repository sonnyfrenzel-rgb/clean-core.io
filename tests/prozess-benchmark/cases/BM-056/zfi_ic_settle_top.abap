*&---------------------------------------------------------------------*
*&  Include  ZFI_IC_SETTLE_TOP
*&---------------------------------------------------------------------*
*&  Globale Daten und Selektionsbild der IC-Abrechnung
*&---------------------------------------------------------------------*
TABLES: zfi_ic_serv.

TYPES: BEGIN OF ty_partner,
         bukrs  TYPE bukrs,
         pbukrs TYPE bukrs,
       END OF ty_partner.

TYPES: BEGIN OF ty_prot,
         bukrs   TYPE bukrs,
         pbukrs  TYPE bukrs,
         servid  TYPE zfi_ic_servid,
         status  TYPE zfi_ic_status,
         belnr_l TYPE belnr_d,
         belnr_p TYPE belnr_d,
         text    TYPE char80,
       END OF ty_prot.

CONSTANTS: gc_stat_open   TYPE zfi_ic_status VALUE 'O',   " offen
           gc_stat_posted TYPE zfi_ic_status VALUE 'P',   " beidseitig gebucht
           gc_stat_error  TYPE zfi_ic_status VALUE 'E',   " Fehler
           gc_blart       TYPE blart         VALUE 'IC',
           gc_log_object  TYPE balobj_d      VALUE 'ZFI_IC',
           gc_log_subobj  TYPE balsubobj     VALUE 'SETTLE'.

DATA: gt_serv       TYPE STANDARD TABLE OF zfi_ic_serv,
      gs_serv       TYPE zfi_ic_serv,
      gt_partner    TYPE STANDARD TABLE OF ty_partner,
      gs_partner    TYPE ty_partner,
      gs_dest       TYPE zfi_ic_dest,
      gt_prot       TYPE STANDARD TABLE OF ty_prot,
      gs_prot       TYPE ty_prot,
      gt_msg        TYPE STANDARD TABLE OF bal_s_msg,
      gs_msg        TYPE bal_s_msg,
      gv_log_handle TYPE balloghndl,
      gv_waers_l    TYPE waers,
      gv_cnt_ok     TYPE i,
      gv_cnt_err    TYPE i.

* DATA: gt_bsid TYPE STANDARD TABLE OF bsid.        "bis 2013
* RANGES: r_ic_kunnr FOR bsid-kunnr.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY.
SELECT-OPTIONS: s_pbukrs FOR zfi_ic_serv-pbukrs.
PARAMETERS: p_gjahr TYPE gjahr OBLIGATORY,
            p_monat TYPE monat OBLIGATORY,
            p_budat TYPE budat DEFAULT sy-datum OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_test AS CHECKBOX DEFAULT 'X'.
* PARAMETERS: p_noprt AS CHECKBOX.   "ohne Partnerbuchung - 2021 entfernt
SELECTION-SCREEN END OF BLOCK b2.
