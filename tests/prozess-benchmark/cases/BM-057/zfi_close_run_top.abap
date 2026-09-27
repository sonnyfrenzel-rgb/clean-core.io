*&---------------------------------------------------------------------*
*&  Include           ZFI_CLOSE_RUN_TOP
*&---------------------------------------------------------------------*
* Globale Daten, Selektionsbild, Makros
*----------------------------------------------------------------------*
TABLES: t001.

TYPES: BEGIN OF ty_t001,
         bukrs TYPE bukrs,
         opvar TYPE opvar,
       END OF ty_t001.

TYPES: tt_bukrs TYPE STANDARD TABLE OF bukrs WITH DEFAULT KEY.

DATA: gt_bukrs   TYPE tt_bukrs,
      gt_steps   TYPE STANDARD TABLE OF zfi_close_step,
      gs_step    TYPE zfi_close_step,
      gt_stat    TYPE STANDARD TABLE OF zfi_close_stat,
      gs_stat    TYPE zfi_close_stat,
      gs_run     TYPE zfi_close_run,
      gv_rc      TYPE sy-subrc,
      gv_abort   TYPE abap_bool,
      gv_log     TYPE balloghndl,
      gv_sent    TYPE i,
      gv_recv    TYPE i,
      gv_failed  TYPE i,
      gv_perr    TYPE i,
      gv_msg     TYPE bapi_msg,
      gs_bal_msg TYPE bal_s_msg,
      gs_bal_log TYPE bal_s_log.

* DATA: gv_rc2   TYPE sy-subrc,          "alt, nicht mehr benutzt
*       gt_bdc   TYPE TABLE OF bdcdata.  "F.13 per Batch-Input (raus 2014)

*----------------------------------------------------------------------*
* Selektionsbild
*----------------------------------------------------------------------*
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
PARAMETERS: p_runid TYPE zfi_close_runid OBLIGATORY,
            p_rtype TYPE zfi_close_rtype OBLIGATORY DEFAULT 'MONTH'.
SELECT-OPTIONS: s_bukrs FOR t001-bukrs OBLIGATORY.
PARAMETERS: p_gjahr TYPE gjahr OBLIGATORY,
            p_monat TYPE poper OBLIGATORY,
            p_budat TYPE budat OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_rfcgr TYPE rzlli_apcl DEFAULT 'parallel_generators' LOWER CASE,
            p_mail  TYPE ad_smtpadr,
            p_test  TYPE abap_bool AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.

*----------------------------------------------------------------------*
* Makro: Meldung ins Anwendungsprotokoll
*   &1 Meldungstyp  &2 Meldungsnummer (ZFI_CLOSE)  &3/&4 Variablen
*----------------------------------------------------------------------*
DEFINE mac_log.
  CLEAR gs_bal_msg.
  gs_bal_msg-msgty = &1.
  gs_bal_msg-msgid = 'ZFI_CLOSE'.
  gs_bal_msg-msgno = &2.
  gs_bal_msg-msgv1 = &3.
  gs_bal_msg-msgv2 = &4.
  CALL FUNCTION 'BAL_LOG_MSG_ADD'
    EXPORTING
      i_log_handle = gv_log
      i_s_msg      = gs_bal_msg
    EXCEPTIONS
      OTHERS       = 1.
END-OF-DEFINITION.
