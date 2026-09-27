*&---------------------------------------------------------------------*
*&  Include  ZFI_BANKSTMT_IN_TOP
*&---------------------------------------------------------------------*
TYPES: BEGIN OF ty_file,
         name TYPE eps2filnam,
         size TYPE eps2filsiz,
       END OF ty_file,
       BEGIN OF ty_stmt,
         bankl  TYPE bankl,
         bankn  TYPE bankn,
         budat  TYPE budat,
         valut  TYPE valut,
         amount TYPE bapiwrbtr,
         waers  TYPE waers,
         ref    TYPE xblnr,
         text   TYPE sgtxt,
       END OF ty_stmt.

DATA: gt_files        TYPE STANDARD TABLE OF ty_file,
      gs_file         TYPE ty_file,
      gt_lines        TYPE STANDARD TABLE OF string,
      gv_locked       TYPE abap_bool,
      gv_ok           TYPE abap_bool,
      gv_start        TYPE i,
      gv_errors       TYPE i,
      gv_restart_line TYPE i,
      gv_files_ok     TYPE i,
      gv_nfiles       TYPE i.

CONSTANTS: gc_max_retry TYPE i VALUE 3,
           gc_blart     TYPE blart VALUE 'ZB'.
