FUNCTION-POOL zfiaa_idoc MESSAGE-ID zfiaa.
*----------------------------------------------------------------------*
* Funktionsgruppe ZFIAA_IDOC
* Anlagenzugaenge aus Investitionssystem InvestPlan per IDoc
* globale Daten fuer IDoc-Eingang und Buchungsbaustein
*----------------------------------------------------------------------*

TYPE-POOLS: abap.

CONSTANTS: gc_mestyp       TYPE edi_mestyp VALUE 'ZFIAA_ACQ',
           gc_seg_hdr      TYPE edilsegtyp VALUE 'Z1FIAA_HDR',
           gc_seg_val      TYPE edilsegtyp VALUE 'Z1FIAA_VAL',
           gc_stat_ok      TYPE edi_status VALUE '53',
           gc_stat_err     TYPE edi_status VALUE '51',
           gc_wf_ok        TYPE bdwf_param-result VALUE '0',
           gc_wf_error     TYPE bdwf_param-result VALUE '99999',
           gc_bwasl_zugang TYPE bwasl VALUE '100'.

* Meldung fuer den Statussatz
TYPES: BEGIN OF ty_err,
         msgid TYPE symsgid,
         msgno TYPE symsgno,
         msgv1 TYPE symsgv,
         msgv2 TYPE symsgv,
         msgv3 TYPE symsgv,
       END OF ty_err.

DATA: gs_edidc     TYPE edidc,
      gs_edidd     TYPE edidd,
      gs_z1hdr     TYPE z1fiaa_hdr,
      gs_z1val     TYPE z1fiaa_val,
      gs_hdr       TYPE zfiaa_s_hdr,
      gs_val       TYPE zfiaa_s_val,
      gs_err       TYPE ty_err,
      gs_status    TYPE bdidocstat,
      gs_return    TYPE bapiret2,
      gt_return    TYPE STANDARD TABLE OF bapiret2,
      gv_error     TYPE abap_bool,
      gv_any_error TYPE abap_bool,
      go_mapper    TYPE REF TO zcl_fi_asset_mapper.

* bis 2019 (Batch-Input AS91/ABZON)
* DATA: gt_bdc    TYPE STANDARD TABLE OF bdcdata,
*       gs_bdc    TYPE bdcdata.
* DATA: gv_mode   TYPE c VALUE 'N'.
