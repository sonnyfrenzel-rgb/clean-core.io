CLASS zcl_par_processor DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.
*----------------------------------------------------------------------*
* Generische Parallelisierung ueber aRFC (Servergruppe) mit
* Begrenzung gleichzeitiger Tasks und lokalem Fallback.
* 2017-03 JW  aus ZPP_CONF_PARALLEL herausgeloest
*----------------------------------------------------------------------*
  PUBLIC SECTION.
    TYPES: BEGIN OF ty_package,
             package_id TYPE i,
             payload    TYPE xstring,
           END OF ty_package,
           ty_t_package TYPE STANDARD TABLE OF ty_package WITH EMPTY KEY.

    METHODS constructor
      IMPORTING iv_group         TYPE rzlli_apcl
                iv_max_tasks     TYPE i DEFAULT 5
                iv_handler_class TYPE seoclsname.
    METHODS run
      IMPORTING it_packages       TYPE ty_t_package
      RETURNING VALUE(rt_results) TYPE zif_par_package_handler=>ty_t_result.
    METHODS on_task_end
      IMPORTING p_task TYPE clike.

  PRIVATE SECTION.
    DATA: mv_group         TYPE rzlli_apcl,
          mv_max_tasks     TYPE i,
          mv_handler_class TYPE seoclsname,
          mv_running       TYPE i,
          mv_task_no       TYPE i,
          mv_parallel      TYPE abap_bool,
          mt_results       TYPE zif_par_package_handler=>ty_t_result.

    METHODS dispatch
      IMPORTING is_package TYPE ty_package.
    METHODS process_locally
      IMPORTING is_package TYPE ty_package.
ENDCLASS.



CLASS zcl_par_processor IMPLEMENTATION.

  METHOD constructor.
    mv_group         = iv_group.
    mv_max_tasks     = iv_max_tasks.
    mv_handler_class = iv_handler_class.
  ENDMETHOD.


  METHOD run.
    DATA lv_free TYPE i.

    CLEAR mt_results.
    mv_parallel = abap_true.
    CALL FUNCTION 'SPBT_INITIALIZE'
      EXPORTING
        group_name                     = mv_group
      IMPORTING
        free_pbt_wps                   = lv_free
      EXCEPTIONS
        invalid_group_name             = 1
        internal_error                 = 2
        pbt_env_already_initialized    = 3
        currently_no_resources_avail   = 4
        no_pbt_resources_found         = 5
        cant_init_different_pbt_groups = 6
        OTHERS                         = 7.
    IF sy-subrc <> 0 AND sy-subrc <> 3.
*     keine Servergruppe -> alles sequentiell im eigenen Prozess
      mv_parallel = abap_false.
    ELSEIF lv_free < mv_max_tasks.
      mv_max_tasks = nmax( val1 = 1 val2 = lv_free ).
    ENDIF.

    LOOP AT it_packages INTO DATA(ls_package).
      IF mv_parallel = abap_true.
        dispatch( ls_package ).
      ELSE.
        process_locally( ls_package ).
      ENDIF.
    ENDLOOP.

    WAIT UNTIL mv_running = 0.
    rt_results = mt_results.
  ENDMETHOD.


  METHOD dispatch.
    DATA lv_task TYPE c LENGTH 32.

*   nicht mehr als MV_MAX_TASKS gleichzeitig
    WAIT UNTIL mv_running < mv_max_tasks UP TO 60 SECONDS.

    DO 3 TIMES.
      mv_task_no = mv_task_no + 1.
      lv_task = |PAR{ mv_task_no WIDTH = 6 ALIGN = RIGHT PAD = '0' }|.
      CALL FUNCTION 'Z_PAR_GENERIC_TASK'
        STARTING NEW TASK lv_task
        DESTINATION IN GROUP mv_group
        CALLING on_task_end ON END OF TASK
        EXPORTING
          iv_handler_class      = mv_handler_class
          iv_package_id         = is_package-package_id
          iv_payload            = is_package-payload
        EXCEPTIONS
          resource_failure      = 1
          communication_failure = 2
          system_failure        = 3
          OTHERS                = 4.
      IF sy-subrc = 0.
        mv_running = mv_running + 1.
        RETURN.
      ELSEIF sy-subrc = 1.
        WAIT UNTIL mv_running < mv_max_tasks UP TO 10 SECONDS.
      ELSE.
        EXIT.
      ENDIF.
    ENDDO.

*   drei Fehlversuche oder Gruppe gestoert: lokal verarbeiten
    process_locally( is_package ).
  ENDMETHOD.


  METHOD process_locally.
    DATA lo_handler TYPE REF TO zif_par_package_handler.

    TRY.
        CREATE OBJECT lo_handler TYPE (mv_handler_class).
      CATCH cx_sy_create_object_error.
        APPEND VALUE #( package_id = is_package-package_id
                        err_count  = 1
                        message    = |Handler { mv_handler_class } nicht instanziierbar| )
          TO mt_results.
        RETURN.
    ENDTRY.
    APPEND lo_handler->process( iv_package_id = is_package-package_id
                                iv_payload    = is_package-payload ) TO mt_results.
  ENDMETHOD.


  METHOD on_task_end.
    DATA: ls_result TYPE zif_par_package_handler=>ty_result,
          lv_msg    TYPE c LENGTH 255.

    RECEIVE RESULTS FROM FUNCTION 'Z_PAR_GENERIC_TASK'
      IMPORTING
        es_result             = ls_result
      EXCEPTIONS
        communication_failure = 1 MESSAGE lv_msg
        system_failure        = 2 MESSAGE lv_msg
        OTHERS                = 3.
    mv_running = mv_running - 1.
    IF sy-subrc <> 0.
*     Paket-ID ist hier nicht bekannt -> nur Task-Name im Text
      ls_result-err_count = 1.
      ls_result-message   = |Task { p_task }: { lv_msg }|.
    ENDIF.
    APPEND ls_result TO mt_results.
  ENDMETHOD.

ENDCLASS.
