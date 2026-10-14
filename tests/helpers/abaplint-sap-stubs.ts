/**
 * Minimal definitions of the released SAP objects the RAP scaffold names (3.0.13), so abaplint's check_syntax can
 * analyse the package's own classes: without a superclass or interface definition abaplint stops at the class header
 * and reports nothing inside it. Signatures follow SAP's documentation of the released APIs; they are test stubs for
 * the check, not SAP's code, and they are added to the registry as dependencies, so no finding is reported on them.
 */
export const SAP_STUBS: Record<string, string> = {
  'if_message.intf.abap': `INTERFACE if_message PUBLIC.
  METHODS get_text RETURNING VALUE(result) TYPE string.
  METHODS get_longtext IMPORTING preserve_newlines TYPE abap_bool OPTIONAL RETURNING VALUE(result) TYPE string.
ENDINTERFACE.`,
  'cx_root.clas.abap': `CLASS cx_root DEFINITION PUBLIC ABSTRACT CREATE PUBLIC.
  PUBLIC SECTION.
    INTERFACES if_message.
    DATA previous TYPE REF TO cx_root READ-ONLY.
    DATA textid TYPE c LENGTH 32.
    METHODS constructor IMPORTING textid LIKE textid OPTIONAL previous LIKE previous OPTIONAL.
    METHODS get_text RETURNING VALUE(result) TYPE string.
    METHODS get_longtext RETURNING VALUE(result) TYPE string.
ENDCLASS.
CLASS cx_root IMPLEMENTATION.
  METHOD constructor.
  ENDMETHOD.
  METHOD get_text.
  ENDMETHOD.
  METHOD get_longtext.
  ENDMETHOD.
  METHOD if_message~get_text.
  ENDMETHOD.
  METHOD if_message~get_longtext.
  ENDMETHOD.
ENDCLASS.`,
  'cx_static_check.clas.abap': `CLASS cx_static_check DEFINITION PUBLIC INHERITING FROM cx_root ABSTRACT CREATE PUBLIC.
ENDCLASS.
CLASS cx_static_check IMPLEMENTATION.
ENDCLASS.`,
  'cx_no_check.clas.abap': `CLASS cx_no_check DEFINITION PUBLIC INHERITING FROM cx_root ABSTRACT CREATE PUBLIC.
ENDCLASS.
CLASS cx_no_check IMPLEMENTATION.
ENDCLASS.`,
  'cx_dynamic_check.clas.abap': `CLASS cx_dynamic_check DEFINITION PUBLIC INHERITING FROM cx_root ABSTRACT CREATE PUBLIC.
ENDCLASS.
CLASS cx_dynamic_check IMPLEMENTATION.
ENDCLASS.`,
  'cx_rap_query_provider.clas.abap': `CLASS cx_rap_query_provider DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
ENDCLASS.
CLASS cx_rap_query_provider IMPLEMENTATION.
ENDCLASS.`,
  'cx_apj_rt_content.clas.abap': `CLASS cx_apj_rt_content DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
ENDCLASS.
CLASS cx_apj_rt_content IMPLEMENTATION.
ENDCLASS.`,
  'cx_apj_dt_content.clas.abap': `CLASS cx_apj_dt_content DEFINITION PUBLIC INHERITING FROM cx_static_check CREATE PUBLIC.
ENDCLASS.
CLASS cx_apj_dt_content IMPLEMENTATION.
ENDCLASS.`,
  'if_abap_behv_message.intf.abap': `INTERFACE if_abap_behv_message PUBLIC.
  INTERFACES if_message.
  CONSTANTS: BEGIN OF severity,
               error TYPE c LENGTH 1 VALUE 'E',
               warning TYPE c LENGTH 1 VALUE 'W',
               information TYPE c LENGTH 1 VALUE 'I',
               success TYPE c LENGTH 1 VALUE 'S',
               none TYPE c LENGTH 1 VALUE ' ',
             END OF severity.
ENDINTERFACE.`,
  'if_abap_behv.intf.abap': `INTERFACE if_abap_behv PUBLIC.
  CONSTANTS: BEGIN OF mk,
               on TYPE x LENGTH 1 VALUE '01',
               off TYPE x LENGTH 1 VALUE '00',
             END OF mk.
  CONSTANTS: BEGIN OF auth,
               allowed TYPE x LENGTH 1 VALUE '00',
               unauthorized TYPE x LENGTH 1 VALUE '01',
             END OF auth.
ENDINTERFACE.`,
  'cl_abap_behavior_handler.clas.abap': `CLASS cl_abap_behavior_handler DEFINITION PUBLIC ABSTRACT CREATE PUBLIC.
  PROTECTED SECTION.
    METHODS new_message_with_text IMPORTING severity TYPE c OPTIONAL text TYPE csequence OPTIONAL
      RETURNING VALUE(obj) TYPE REF TO if_abap_behv_message.
ENDCLASS.
CLASS cl_abap_behavior_handler IMPLEMENTATION.
  METHOD new_message_with_text.
  ENDMETHOD.
ENDCLASS.`,
  'if_rap_query_paging.intf.abap': `INTERFACE if_rap_query_paging PUBLIC.
  CONSTANTS page_size_unlimited TYPE int8 VALUE -1.
  METHODS get_offset RETURNING VALUE(rv_offset) TYPE int8.
  METHODS get_page_size RETURNING VALUE(rv_page_size) TYPE int8.
ENDINTERFACE.`,
  'if_rap_query_filter.intf.abap': `INTERFACE if_rap_query_filter PUBLIC.
  METHODS get_sql_filter RETURNING VALUE(rv_string) TYPE string.
ENDINTERFACE.`,
  'if_rap_query_request.intf.abap': `INTERFACE if_rap_query_request PUBLIC.
  TYPES: BEGIN OF ty_parameter,
           parameter_name TYPE string,
           value TYPE string,
         END OF ty_parameter,
         tt_parameters TYPE STANDARD TABLE OF ty_parameter WITH EMPTY KEY.
  METHODS get_parameters RETURNING VALUE(rt_parameters) TYPE tt_parameters.
  METHODS is_data_requested RETURNING VALUE(rv_is_requested) TYPE abap_bool.
  METHODS is_total_numb_of_rec_requested RETURNING VALUE(rv_is_requested) TYPE abap_bool.
  METHODS get_paging RETURNING VALUE(ro_paging) TYPE REF TO if_rap_query_paging.
  METHODS get_filter RETURNING VALUE(ro_filter) TYPE REF TO if_rap_query_filter.
ENDINTERFACE.`,
  'if_rap_query_response.intf.abap': `INTERFACE if_rap_query_response PUBLIC.
  METHODS set_total_number_of_records IMPORTING iv_total_number_of_records TYPE int8.
  METHODS set_data IMPORTING it_data TYPE STANDARD TABLE.
ENDINTERFACE.`,
  'if_rap_query_provider.intf.abap': `INTERFACE if_rap_query_provider PUBLIC.
  METHODS select IMPORTING io_request TYPE REF TO if_rap_query_request io_response TYPE REF TO if_rap_query_response
    RAISING cx_rap_query_provider.
ENDINTERFACE.`,
  'if_apj_dt_exec_object.intf.abap': `INTERFACE if_apj_dt_exec_object PUBLIC.
  CONSTANTS parameter TYPE c LENGTH 1 VALUE 'P'.
  CONSTANTS select_option TYPE c LENGTH 1 VALUE 'S'.
  TYPES: BEGIN OF ty_templ_def,
           selname TYPE c LENGTH 8,
           kind TYPE c LENGTH 1,
           datatype TYPE c LENGTH 4,
           length TYPE i,
           decimals TYPE i,
           param_text TYPE c LENGTH 70,
           changeable_ind TYPE abap_bool,
           mandatory_ind TYPE abap_bool,
         END OF ty_templ_def,
         tt_templ_def TYPE STANDARD TABLE OF ty_templ_def WITH DEFAULT KEY,
         BEGIN OF ty_templ_val,
           selname TYPE c LENGTH 8,
           kind TYPE c LENGTH 1,
           sign TYPE c LENGTH 1,
           option TYPE c LENGTH 2,
           low TYPE c LENGTH 255,
           high TYPE c LENGTH 255,
         END OF ty_templ_val,
         tt_templ_val TYPE STANDARD TABLE OF ty_templ_val WITH DEFAULT KEY.
  METHODS get_parameters EXPORTING et_parameter_def TYPE tt_templ_def et_parameter_val TYPE tt_templ_val.
ENDINTERFACE.`,
  'if_apj_rt_exec_object.intf.abap': `INTERFACE if_apj_rt_exec_object PUBLIC.
  METHODS execute IMPORTING it_parameters TYPE if_apj_dt_exec_object=>tt_templ_val RAISING cx_apj_rt_content.
ENDINTERFACE.`,
  'if_oo_adt_classrun_out.intf.abap': `INTERFACE if_oo_adt_classrun_out PUBLIC.
  METHODS write IMPORTING data TYPE any name TYPE string OPTIONAL RETURNING VALUE(output) TYPE REF TO if_oo_adt_classrun_out.
ENDINTERFACE.`,
  'if_oo_adt_classrun.intf.abap': `INTERFACE if_oo_adt_classrun PUBLIC.
  METHODS main IMPORTING out TYPE REF TO if_oo_adt_classrun_out.
ENDINTERFACE.`,
  'cl_apj_dt_create_content.clas.abap': `CLASS cl_apj_dt_create_content DEFINITION PUBLIC FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    TYPES ty_catalog_name TYPE c LENGTH 30.
    TYPES ty_template_name TYPE c LENGTH 30.
    TYPES ty_class_name TYPE c LENGTH 30.
    TYPES ty_text TYPE c LENGTH 70.
    TYPES ty_transport_request TYPE c LENGTH 20.
    TYPES ty_package TYPE c LENGTH 30.
    CONSTANTS class_based TYPE c LENGTH 1 VALUE 'C'.
    CLASS-METHODS get_instance RETURNING VALUE(ro_instance) TYPE REF TO cl_apj_dt_create_content.
    METHODS exists_job_cat_entry IMPORTING iv_catalog_name TYPE ty_catalog_name RETURNING VALUE(rv_exists) TYPE c.
    METHODS exists_job_template_entry IMPORTING iv_template_name TYPE ty_template_name RETURNING VALUE(rv_exists) TYPE c.
    METHODS create_job_cat_entry IMPORTING iv_catalog_name TYPE ty_catalog_name iv_class_name TYPE ty_class_name
      iv_text TYPE ty_text iv_catalog_entry_type TYPE c iv_transport_request TYPE ty_transport_request iv_package TYPE ty_package
      RAISING cx_apj_dt_content.
    METHODS create_job_template_entry IMPORTING iv_template_name TYPE ty_template_name iv_catalog_name TYPE ty_catalog_name
      iv_text TYPE ty_text iv_transport_request TYPE ty_transport_request iv_package TYPE ty_package
      RAISING cx_apj_dt_content.
ENDCLASS.
CLASS cl_apj_dt_create_content IMPLEMENTATION.
  METHOD get_instance.
  ENDMETHOD.
  METHOD exists_job_cat_entry.
  ENDMETHOD.
  METHOD exists_job_template_entry.
  ENDMETHOD.
  METHOD create_job_cat_entry.
  ENDMETHOD.
  METHOD create_job_template_entry.
  ENDMETHOD.
ENDCLASS.`,
  'cl_abap_unit_assert.clas.abap': `CLASS cl_abap_unit_assert DEFINITION PUBLIC FINAL CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS assert_equals IMPORTING act TYPE any exp TYPE any msg TYPE csequence OPTIONAL.
    CLASS-METHODS skip IMPORTING msg TYPE csequence.
    CLASS-METHODS fail IMPORTING msg TYPE csequence OPTIONAL.
ENDCLASS.
CLASS cl_abap_unit_assert IMPLEMENTATION.
  METHOD assert_equals.
  ENDMETHOD.
  METHOD skip.
  ENDMETHOD.
  METHOD fail.
  ENDMETHOD.
ENDCLASS.`,
};
