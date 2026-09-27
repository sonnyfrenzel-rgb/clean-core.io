*&---------------------------------------------------------------------*
*& Include ZSD_CUST_REPL_TOP
*&---------------------------------------------------------------------*
TYPES: BEGIN OF ty_kna1,
         kunnr TYPE kna1-kunnr,
         name1 TYPE kna1-name1,
         name2 TYPE kna1-name2,
         land1 TYPE kna1-land1,
         pstlz TYPE kna1-pstlz,
         ort01 TYPE kna1-ort01,
         stras TYPE kna1-stras,
         adrnr TYPE kna1-adrnr,
         loevm TYPE kna1-loevm,
         aufsd TYPE kna1-aufsd,
       END OF ty_kna1.

TYPES: BEGIN OF ty_knvv,
         kunnr TYPE knvv-kunnr,
         kdgrp TYPE knvv-kdgrp,
         bzirk TYPE knvv-bzirk,
         vkbur TYPE knvv-vkbur,
       END OF ty_knvv.

TYPES: BEGIN OF ty_adr6,
         addrnumber TYPE adr6-addrnumber,
         smtp_addr  TYPE adr6-smtp_addr,
       END OF ty_adr6.

TYPES: BEGIN OF ty_link,
         customer     TYPE cvi_cust_link-customer,
         partner_guid TYPE cvi_cust_link-partner_guid,
       END OF ty_link.

TYPES: BEGIN OF ty_bp,
         partner      TYPE but000-partner,
         partner_guid TYPE but000-partner_guid,
       END OF ty_bp.

TYPES: BEGIN OF ty_cpmap,
         kunnr   TYPE kunnr,
         cpident TYPE bdcp-cpident,
       END OF ty_cpmap.

TYPES: BEGIN OF ty_pack,
         no   TYPE i,
         recs TYPE zcrm_t_customer,
       END OF ty_pack.

DATA: gt_cp    TYPE STANDARD TABLE OF bdcp,
      gt_cpmap TYPE STANDARD TABLE OF ty_cpmap,
      gt_kunnr TYPE SORTED TABLE OF kunnr WITH UNIQUE KEY table_line,
      gt_kna1  TYPE STANDARD TABLE OF ty_kna1,
      gt_knvv  TYPE SORTED TABLE OF ty_knvv WITH NON-UNIQUE KEY kunnr,
      gt_adr6  TYPE SORTED TABLE OF ty_adr6 WITH NON-UNIQUE KEY addrnumber,
      gt_link  TYPE SORTED TABLE OF ty_link WITH UNIQUE KEY customer,
      gt_bp    TYPE SORTED TABLE OF ty_bp WITH UNIQUE KEY partner_guid,
      gt_pack  TYPE STANDARD TABLE OF ty_pack,
      gs_pack  TYPE ty_pack,
      gt_done  TYPE SORTED TABLE OF kunnr WITH UNIQUE KEY table_line,
      gs_logh  TYPE bal_s_log,
      gv_log   TYPE balloghndl,
      gt_logh  TYPE bal_t_logh,
      gv_sent  TYPE i,
      gv_recv  TYPE i,
      gv_msg   TYPE c LENGTH 200.

PARAMETERS: p_mestyp TYPE edi_mestyp DEFAULT 'ZDEBMAS_CRM',
            p_vkorg  TYPE vkorg DEFAULT '1000',
            p_pack   TYPE i DEFAULT 200,
            p_par    AS CHECKBOX DEFAULT 'X',
            p_group  TYPE rzlli_apcl DEFAULT 'parallel_generators',
            p_wait   TYPE i DEFAULT 600,
            p_reorg  AS CHECKBOX.
