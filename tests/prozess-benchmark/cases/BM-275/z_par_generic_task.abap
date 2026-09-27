FUNCTION z_par_generic_task.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (RFC-faehig)
*"  IMPORTING
*"     VALUE(IV_HANDLER_CLASS) TYPE  SEOCLSNAME
*"     VALUE(IV_PACKAGE_ID) TYPE  I
*"     VALUE(IV_PAYLOAD) TYPE  XSTRING
*"  EXPORTING
*"     VALUE(ES_RESULT) TYPE  ZIF_PAR_PACKAGE_HANDLER=>TY_RESULT
*"----------------------------------------------------------------------
* Rahmen fuer einen Task der generischen Parallelisierung:
* Handler per Namen erzeugen und das Paket verarbeiten lassen.

  DATA lo_handler TYPE REF TO zif_par_package_handler.

  TRY.
      CREATE OBJECT lo_handler TYPE (iv_handler_class).
    CATCH cx_sy_create_object_error.
      es_result-package_id = iv_package_id.
      es_result-err_count  = 1.
      es_result-message    = |Handler { iv_handler_class } nicht instanziierbar|.
      RETURN.
  ENDTRY.

  es_result = lo_handler->process( iv_package_id = iv_package_id
                                   iv_payload    = iv_payload ).

ENDFUNCTION.
