*&---------------------------------------------------------------------*
*& Include ZHR_EMP_EXPORT_TOP
*&---------------------------------------------------------------------*
TABLES: pa0001.

TYPES: BEGIN OF ty_rec,
         satzart TYPE c LENGTH 1,        "U = Änderung, D = Austritt
         pernr   TYPE persno,
         nachn   TYPE pad_nachn,
         vorna   TYPE pad_vorna,
         gbdat   TYPE gbdat,
         bukrs   TYPE bukrs,
         kostl   TYPE kostl,
         orgeh   TYPE orgeh,
         stras   TYPE pad_stras,
         pstlz   TYPE pstlz_hr,
         ort01   TYPE pad_ort01,
         email   TYPE comm_id_long,
       END OF ty_rec.

TYPES: BEGIN OF ty_error,
         pernr TYPE persno,
         text  TYPE c LENGTH 80,
       END OF ty_error.

DATA: gt_pernr    TYPE SORTED TABLE OF persno WITH UNIQUE KEY table_line,
      gv_pernr    TYPE persno,
      gt_rec      TYPE STANDARD TABLE OF ty_rec,
      gt_time     TYPE STANDARD TABLE OF zhr_s_time_emp,
      gt_error    TYPE STANDARD TABLE OF ty_error,
      gv_last_run TYPE datum,
      gv_file_ok  TYPE c LENGTH 1,
      gv_rfc_ok   TYPE c LENGTH 1.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-b01.
SELECT-OPTIONS: s_bukrs FOR pa0001-bukrs OBLIGATORY,
                s_persg FOR pa0001-persg.
PARAMETERS:     p_full  AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-b02.
PARAMETERS: p_file TYPE string LOWER CASE,
            p_dest TYPE rfcdest DEFAULT 'ZEIT_TERMINAL',
            p_mail TYPE so_recname DEFAULT 'HR_IT_ALERT',
            p_test AS CHECKBOX DEFAULT 'X'.
SELECTION-SCREEN END OF BLOCK b2.
