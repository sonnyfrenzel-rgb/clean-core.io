*&---------------------------------------------------------------------*
*& Include ZVC_KONFIG_PRUEFUNG_TOP
*&---------------------------------------------------------------------*
TABLES: vbak, vbap.

TYPES: BEGIN OF ty_pos,
         vbeln TYPE vbak-vbeln,
         posnr TYPE vbap-posnr,
         matnr TYPE vbap-matnr,
         cuobj TYPE vbap-cuobj,
         kunnr TYPE vbak-kunnr,
         lifsk TYPE vbak-lifsk,
       END OF ty_pos,
       BEGIN OF ty_erg,
         vbeln   TYPE vbak-vbeln,
         posnr   TYPE vbap-posnr,
         matnr   TYPE vbap-matnr,
         meldung TYPE string,
         sperren TYPE abap_bool,
       END OF ty_erg,
       BEGIN OF ty_log,
         vbeln TYPE vbak-vbeln,
         text  TYPE string,
       END OF ty_log.

DATA: gt_pos  TYPE STANDARD TABLE OF ty_pos,
      gt_erg  TYPE STANDARD TABLE OF ty_erg,
      gt_log  TYPE STANDARD TABLE OF ty_log,
      gt_conf TYPE STANDARD TABLE OF conf_out.

SELECT-OPTIONS: s_vkorg FOR vbak-vkorg OBLIGATORY,
                s_vbeln FOR vbak-vbeln,
                s_matnr FOR vbap-matnr.
PARAMETERS: p_sperr AS CHECKBOX,
            p_lifsk TYPE vbak-lifsk DEFAULT 'VC'.
