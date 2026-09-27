*&---------------------------------------------------------------------*
*& Report ZSD_BILLING_RUN
*&---------------------------------------------------------------------*
*& Fakturierungslauf fuer warenausgangsgebuchte Lieferungen
*& Option Intercompany: IV-Fakturen und Uebergabe an Partnergesellschaft
*&---------------------------------------------------------------------*
*& 06.2017 FRA  Neuanlage (Ersatz VF04-Variante)
*& 03.2019 FRA  Intercompany-Unterklasse
*&---------------------------------------------------------------------*
REPORT zsd_billing_run.

TABLES likp.

SELECT-OPTIONS: s_vkorg FOR likp-vkorg OBLIGATORY,
                s_wadat FOR likp-wadat_ist.
PARAMETERS:     p_ic AS CHECKBOX.

DATA: go_run   TYPE REF TO zcl_sd_billing_run,
      gx_bill  TYPE REF TO zcx_sd_billing,
      gv_count TYPE i.

START-OF-SELECTION.
  TRY.
      IF p_ic = abap_true.
        go_run = NEW zcl_sd_billing_run_ic( s_vkorg[] ).
      ELSE.
        go_run = NEW zcl_sd_billing_run( it_vkorg = s_vkorg[] ).
      ENDIF.
      gv_count = go_run->run( s_wadat[] ).
      WRITE: / 'Angelegte Fakturen:'(001), gv_count.
    CATCH zcx_sd_billing INTO gx_bill.
      MESSAGE gx_bill TYPE 'E'.
  ENDTRY.
