*----------------------------------------------------------------------*
* Include ZMM_STO_NACHSCHUB_TOP
*----------------------------------------------------------------------*
TABLES: t001w.

SELECT-OPTIONS: s_werks FOR t001w-werks OBLIGATORY.
PARAMETERS: p_date TYPE sy-datum OBLIGATORY,
            p_dest TYPE rfcdest DEFAULT 'POS_PROD',
            p_wa   AS CHECKBOX,
            p_test AS CHECKBOX DEFAULT 'X'.

* Bedarfszeile MATNR/MENGE/MEINS (DDIC, auch in ZCL_MM_STO_CREATOR)
TYPES: ty_need TYPE zmm_s_sto_need,
       tt_need TYPE zmm_t_sto_need.

TYPES: BEGIN OF ty_result,
         werks TYPE werks_d,
         reswk TYPE reswk,
         anz   TYPE i,
         ebeln TYPE ebeln,
         vbeln TYPE vbeln_vl,
         wa    TYPE abap_bool,
         text  TYPE bapi_msg,
       END OF ty_result.

DATA: gt_route   TYPE STANDARD TABLE OF zmm_sto_route,
      gs_route   TYPE zmm_sto_route,
      gt_need    TYPE tt_need,
      gt_result  TYPE STANDARD TABLE OF ty_result,
      go_creator TYPE REF TO zcl_mm_sto_creator,
      gv_log     TYPE balloghndl.
