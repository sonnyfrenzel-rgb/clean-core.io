FUNCTION-POOL zmatmas_in MESSAGE-ID zmm_ale.
*----------------------------------------------------------------------*
* Funktionsgruppe ZMATMAS_IN
* Eingang Materialstamm aus dem MDM-Hub
* Nachrichtentyp ZMATMAS, Basistyp ZMATMAS01 (reduzierte Kopie MATMAS05
* plus Kundensegment ZE1ZMAT für die Felder MARA-ZZ*)
*----------------------------------------------------------------------*
* Änderungshistorie
* 2012-02  DS   Erstellung (Projekt MDM-Hub Phase 1)
* 2012-09  DS   Werkssegmente, ein BAPI-Aufruf je Werk
* 2014-05  RK   Serialisierung über ZMM_IDOC_SERIAL statt BD55
* 2017-11  RK   Kundenfelder Designverantwortung / RoHS
*----------------------------------------------------------------------*

TYPES: BEGIN OF ty_err,
         msgno TYPE symsgno,
         msgv1 TYPE symsgv,
         msgv2 TYPE symsgv,
       END OF ty_err.

CONSTANTS: gc_status_ok   TYPE edi_status VALUE '53',
           gc_status_err  TYPE edi_status VALUE '51',
           gc_status_skip TYPE edi_status VALUE '68'.

* Steuerung
DATA: gs_edidc TYPE edidc,
      gs_err   TYPE ty_err,
      gv_error TYPE c LENGTH 1,
      gv_skip  TYPE c LENGTH 1.

* Segmente
DATA: gs_e1maram TYPE ze1maram,
      gs_e1maktm TYPE ze1maktm,
      gs_e1marcm TYPE ze1marcm,
      gs_e1marmm TYPE ze1marmm,
      gs_e1zmat  TYPE ze1zmat.

* BAPI-Strukturen
DATA: gs_head   TYPE bapimathead,
      gs_mara   TYPE bapi_mara,
      gs_marax  TYPE bapi_marax,
      gt_marc   TYPE STANDARD TABLE OF bapi_marc,
      gt_makt   TYPE STANDARD TABLE OF bapi_makt,
      gt_marm   TYPE STANDARD TABLE OF bapi_marm,
      gt_marmx  TYPE STANDARD TABLE OF bapi_marmx,
      gt_extin  TYPE STANDARD TABLE OF bapiparex,
      gt_extinx TYPE STANDARD TABLE OF bapiparexx.

* Feld aus Segment ZE1MARAM in Mandantendaten + X-Kennzeichen
DEFINE map_field.
  &1-&3 = gs_e1maram-&3.
  &2-&3 = 'X'.
END-OF-DEFINITION.
