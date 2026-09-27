*&---------------------------------------------------------------------*
*&  Include           ZFI_ABGRENZUNG_TOP
*&---------------------------------------------------------------------*
DATA: gt_abg        TYPE STANDARD TABLE OF zfi_abgrenz,
      gs_abg        TYPE zfi_abgrenz,
      gt_bdc        TYPE STANDARD TABLE OF bdcdata,
      gs_bdc        TYPE bdcdata,
      gt_msg        TYPE STANDARD TABLE OF bdcmsgcoll,
      gv_ok         TYPE i,
      gv_err        TYPE i,
      gv_mappe_offen TYPE xfeld.

* BDC-Hilfsmakros (statt FORM bdc_dynpro / bdc_field)
DEFINE bdc_d.
  CLEAR gs_bdc.
  gs_bdc-program  = &1.
  gs_bdc-dynpro   = &2.
  gs_bdc-dynbegin = 'X'.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.

DEFINE bdc_f.
  CLEAR gs_bdc.
  gs_bdc-fnam = &1.
  gs_bdc-fval = &2.
  APPEND gs_bdc TO gt_bdc.
END-OF-DEFINITION.
