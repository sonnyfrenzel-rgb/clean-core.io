CLASS zcl_pp_step_mrp DEFINITION
  PUBLIC
  INHERITING FROM zcl_pp_chain_step
  FINAL
  CREATE PUBLIC.
* Schritt "MRP-Lauf": ein Jobschritt RMMRP000 je Werk der Kette,
* Werk muss fuer die Planung aktiviert sein (Planungsdatei).
  PUBLIC SECTION.
    METHODS constructor
      IMPORTING is_def TYPE zpp_chain_step.
  PROTECTED SECTION.
    METHODS check_prerequisite REDEFINITION.
    METHODS add_job_steps REDEFINITION.
  PRIVATE SECTION.
    DATA mt_werks TYPE STANDARD TABLE OF werks_d WITH EMPTY KEY.
ENDCLASS.



CLASS zcl_pp_step_mrp IMPLEMENTATION.

  METHOD constructor.
    super->constructor( is_def ).
    SELECT werks FROM zpp_chain_plant INTO TABLE mt_werks
      WHERE chain_id = is_def-chain_id
        AND active   = abap_true.
  ENDMETHOD.


  METHOD check_prerequisite.
    DATA lv_werks TYPE werks_d.

    IF mt_werks IS INITIAL.
      RAISE EXCEPTION TYPE zcx_pp_chain
        EXPORTING
          textid = zcx_pp_chain=>no_plants.
    ENDIF.

*   Planung im Werk aktiviert? (T399D-Eintrag)
    LOOP AT mt_werks INTO lv_werks.
      SELECT SINGLE werks FROM t399d INTO lv_werks
        WHERE werks = lv_werks.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_pp_chain
          EXPORTING
            textid = zcx_pp_chain=>plant_not_planned.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.


  METHOD add_job_steps.
    DATA lt_seltab TYPE STANDARD TABLE OF rsparams.

    LOOP AT mt_werks INTO DATA(lv_werks).
      lt_seltab = VALUE #( ( selname = 'WERKS' kind = 'P' low = lv_werks )
                           ( selname = 'VERSL' kind = 'P' low = 'NETCH' )
                           ( selname = 'BANER' kind = 'P' low = '1' )
                           ( selname = 'LIFKZ' kind = 'P' low = '3' ) ).
      SUBMIT rmmrp000
        WITH SELECTION-TABLE lt_seltab
        VIA JOB ms_job-jobname NUMBER ms_job-jobcount
        AND RETURN.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE zcx_pp_chain
          EXPORTING
            textid = zcx_pp_chain=>submit_failed.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
