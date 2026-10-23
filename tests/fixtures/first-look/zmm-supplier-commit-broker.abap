*&---------------------------------------------------------------------*
*& Report ZMM_SUPPLIER_COMMIT_BROKER
*&---------------------------------------------------------------------*
*& Synthetic test fixture (Clean-Core.io 3.0.21). Same shape as an owner's
*& report: a selection screen, built-in demo cases, a list on screen and a
*& CSV download - and no table read by name.
*&---------------------------------------------------------------------*
REPORT zmm_supplier_commit_broker.

TYPES: BEGIN OF ty_commit,
         supplier  TYPE c LENGTH 10,
         material  TYPE c LENGTH 18,
         quantity  TYPE i,
         due_date  TYPE d,
         status    TYPE c LENGTH 12,
       END OF ty_commit.

DATA: gt_commit TYPE STANDARD TABLE OF ty_commit,
      gs_commit TYPE ty_commit,
      gt_csv    TYPE STANDARD TABLE OF string,
      gv_line   TYPE string.

PARAMETERS: p_case TYPE i DEFAULT 1,
            p_days TYPE i DEFAULT 14,
            p_file TYPE string LOWER CASE DEFAULT 'C:\temp\commit.csv',
            p_csv  AS CHECKBOX DEFAULT 'X'.

START-OF-SELECTION.
  PERFORM fill_demo_cases.
  PERFORM rate_commitments.
  PERFORM show_list.
  IF p_csv = abap_true.
    PERFORM download_csv.
  ENDIF.

FORM fill_demo_cases.
  CASE p_case.
    WHEN 1.
      gs_commit-supplier = '100001'.
      gs_commit-material = 'MAT-A'.
      gs_commit-quantity = 10.
      gs_commit-due_date = sy-datum.
      APPEND gs_commit TO gt_commit.
    WHEN 2.
      gs_commit-supplier = '100002'.
      gs_commit-material = 'MAT-B'.
      gs_commit-quantity = 0.
      gs_commit-due_date = sy-datum.
      APPEND gs_commit TO gt_commit.
    WHEN 3.
      gs_commit-supplier = '100003'.
      gs_commit-material = 'MAT-C'.
      gs_commit-quantity = 250.
      gs_commit-due_date = sy-datum + 30.
      APPEND gs_commit TO gt_commit.
    WHEN OTHERS.
      MESSAGE 'Unknown demo case' TYPE 'E'.
  ENDCASE.
ENDFORM.

FORM rate_commitments.
  LOOP AT gt_commit INTO gs_commit.
    IF gs_commit-quantity <= 0.
      gs_commit-status = 'REJECTED'.
    ELSEIF gs_commit-due_date > sy-datum + p_days.
      gs_commit-status = 'LATE'.
    ELSE.
      gs_commit-status = 'COMMITTED'.
    ENDIF.
    MODIFY gt_commit FROM gs_commit.
  ENDLOOP.
ENDFORM.

FORM show_list.
  DATA lo_alv TYPE REF TO cl_salv_table.
  cl_salv_table=>factory( IMPORTING r_salv_table = lo_alv CHANGING t_table = gt_commit ).
  lo_alv->display( ).
ENDFORM.

FORM download_csv.
  LOOP AT gt_commit INTO gs_commit.
    gv_line = |{ gs_commit-supplier };{ gs_commit-material };{ gs_commit-quantity };{ gs_commit-status }|.
    APPEND gv_line TO gt_csv.
  ENDLOOP.
  CALL FUNCTION 'GUI_DOWNLOAD'
    EXPORTING
      filename = p_file
    TABLES
      data_tab = gt_csv.
ENDFORM.
