*&---------------------------------------------------------------------*
*&  Include           ZRE_INDEX_TOP
*&---------------------------------------------------------------------*
*&  Globale Daten Indexmietanpassung (RE-FX)
*&---------------------------------------------------------------------*
TABLES: vicncn.

TYPES: BEGIN OF ty_contract,
         bukrs      TYPE bukrs,
         recnnr     TYPE recnnumber,
         intreno    TYPE recaintreno,
         recntype   TYPE recncontracttype,
         idxseries  TYPE char10,
         base_vpi   TYPE p LENGTH 7 DECIMALS 1,
         base_per   TYPE spmon,
         thresh_pct TYPE p LENGTH 5 DECIMALS 2,
         cap_pct    TYPE p LENGTH 5 DECIMALS 2,
         last_adj   TYPE dats,
         condtype   TYPE recdcondtype,
         unitprice  TYPE recdunitprice,
         condcurr   TYPE recdcondcurr,
       END OF ty_contract,
       ty_t_contract TYPE STANDARD TABLE OF ty_contract WITH DEFAULT KEY.

* Uebergabe an / Rueckgabe aus Z_RE_INDEX_TASK (DDIC: ZRE_S_IDX_ADJUST)
TYPES: ty_adjust   TYPE zre_s_idx_adjust,
       ty_t_adjust TYPE zre_t_idx_adjust,
       ty_result   TYPE zre_s_idx_result,
       ty_t_result TYPE zre_t_idx_result.

CONSTANTS: gc_condtype_rent TYPE recdcondtype VALUE '1000',   "Grundmiete
           gc_role_tenant   TYPE bu_role     VALUE 'TR0600',  "Hauptmieter
           gc_form          TYPE fpname      VALUE 'ZRE_INDEX_LETTER',
           gc_log_object    TYPE balobj_d    VALUE 'ZRE',
           gc_log_subobj    TYPE balsubobj   VALUE 'ZRE_INDEX'.

DATA: gt_contracts TYPE ty_t_contract,
      gt_adjust    TYPE ty_t_adjust,
      gt_result    TYPE ty_t_result,
      gv_vpi_act   TYPE p LENGTH 7 DECIMALS 1,
      gv_period    TYPE spmon,
      gv_log       TYPE balloghndl,
      gs_log       TYPE bal_s_log,
      gt_msg       TYPE bal_t_msg,
      gv_cnt_cn    TYPE i,
      gv_cnt_adj   TYPE i,
      gv_started   TYPE i,
      gv_done      TYPE i,
      gv_taskno    TYPE n LENGTH 4,
      gv_letters   TYPE i,
      gv_mails     TYPE i.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
SELECT-OPTIONS: s_bukrs  FOR vicncn-bukrs OBLIGATORY,
                s_recnnr FOR vicncn-recnnr,
                s_cntype FOR vicncn-recntype.
PARAMETERS:     p_stich  TYPE dats OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_http  TYPE rfcdest DEFAULT 'Z_DESTATIS_VPI',
            p_rfcgr TYPE rzlli_apcl DEFAULT 'parallel_generators',
            p_pkg   TYPE i DEFAULT 50,
            p_test  AS CHECKBOX DEFAULT 'X',
            p_mail  AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.
