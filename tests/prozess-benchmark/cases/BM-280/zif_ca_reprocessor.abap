INTERFACE zif_ca_reprocessor
  PUBLIC.
*----------------------------------------------------------------------*
* Nachverarbeitung eines Eintrags aus ZCA_IF_LOG.
* OK = abap_true nur, wenn der Vorgang danach fachlich erledigt ist.
*----------------------------------------------------------------------*
  TYPES: BEGIN OF ty_result,
           ok      TYPE abap_bool,
           message TYPE bapi_msg,
         END OF ty_result.

  METHODS reprocess
    IMPORTING is_entry         TYPE zca_if_log
    RETURNING VALUE(rs_result) TYPE ty_result.

ENDINTERFACE.
