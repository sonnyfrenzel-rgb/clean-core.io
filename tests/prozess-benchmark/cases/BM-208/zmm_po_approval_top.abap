*&---------------------------------------------------------------------*
*& Include ZMM_PO_APPROVAL_TOP
*&---------------------------------------------------------------------*
TABLES ekko.

TYPES: BEGIN OF ty_ekko,
         ebeln TYPE ebeln,
         bsart TYPE esart,
         ekgrp TYPE bkgrp,
         frgke TYPE frgke,
         frgzu TYPE frgzu,
       END OF ty_ekko.

CLASS lcl_log DEFINITION DEFERRED.

DATA: gt_ekko    TYPE STANDARD TABLE OF ty_ekko,
      gs_ekko    TYPE ty_ekko,
      go_log     TYPE REF TO lcl_log,
      gv_cnt_rel TYPE i,
      gv_cnt_err TYPE i.

CONSTANTS: gc_rel_code  TYPE frgco VALUE 'Z1',
           gc_auto_limit TYPE netwr VALUE '5000.00'.

SELECT-OPTIONS: s_bsart FOR ekko-bsart DEFAULT 'NB',
                s_ekgrp FOR ekko-ekgrp.
