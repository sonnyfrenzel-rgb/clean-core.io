*&---------------------------------------------------------------------*
*&  Include           ZCO_PLANUPLOAD_TOP
*&---------------------------------------------------------------------*
TYPES: BEGIN OF ty_fehler,
         zeilennr TYPE i,
         rohzeile TYPE string,
         text     TYPE string,
       END OF ty_fehler.

DATA: gt_zeilen   TYPE STANDARD TABLE OF zcl_co_plan_pruefer=>ty_zeile,
      gt_ok       TYPE STANDARD TABLE OF zcl_co_plan_pruefer=>ty_zeile,
      gt_roh      TYPE STANDARD TABLE OF string,
      gt_fehler   TYPE STANDARD TABLE OF ty_fehler,
      gt_return   TYPE STANDARD TABLE OF bapiret2,
      go_pruefer  TYPE REF TO zcl_co_plan_pruefer,
      gx_plan     TYPE REF TO zcx_co_plan,
      gv_bapi_err TYPE xfeld.

* Feldtrenner der Planungsdatei
CONSTANTS gc_sep TYPE c LENGTH 1 VALUE ';'.
