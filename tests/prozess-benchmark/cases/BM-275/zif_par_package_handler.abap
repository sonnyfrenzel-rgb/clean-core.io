INTERFACE zif_par_package_handler
  PUBLIC.
*----------------------------------------------------------------------*
* Verarbeitet ein Paket der generischen Parallelisierung (ZCL_PAR_PROCESSOR).
* Implementierung muss ohne Konstruktorparameter instanziierbar sein,
* weil der RFC-Rahmen Z_PAR_GENERIC_TASK sie per Klassennamen erzeugt.
*----------------------------------------------------------------------*
  TYPES: BEGIN OF ty_result,
           package_id TYPE i,
           ok_count   TYPE i,
           err_count  TYPE i,
           message    TYPE bapi_msg,
         END OF ty_result,
         ty_t_result TYPE STANDARD TABLE OF ty_result WITH EMPTY KEY.

  METHODS process
    IMPORTING iv_package_id    TYPE i
              iv_payload       TYPE xstring
    RETURNING VALUE(rs_result) TYPE ty_result.

ENDINTERFACE.
