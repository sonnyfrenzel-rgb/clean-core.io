REPORT zpp_conf_parallel.
*----------------------------------------------------------------------*
* Rueckmeldungen aus MES (Staging ZPP_CONF_STG) parallel buchen
* Pakete zu P_PACK Saetzen, aRFC ueber Servergruppe P_GROUP
* 2018-11 JW  Umstellung sequentiell -> parallel (Laufzeit Nachtjob > 4h)
*----------------------------------------------------------------------*
TABLES zpp_conf_stg.

TYPES: ty_t_conf TYPE STANDARD TABLE OF zpp_conf_stg WITH DEFAULT KEY.

DATA: gt_conf     TYPE ty_t_conf,
      gt_package  TYPE ty_t_conf,
      gv_sent     TYPE i,
      gv_recv     TYPE i,
      gv_ok       TYPE i,
      gv_err      TYPE i,
      gv_pkg_err  TYPE i,
      gv_taskno   TYPE n LENGTH 6,
      gv_task     TYPE c LENGTH 32,
      gv_free     TYPE i.

SELECT-OPTIONS: s_werks FOR zpp_conf_stg-werks OBLIGATORY,
                s_aufnr FOR zpp_conf_stg-aufnr.
PARAMETERS: p_pack  TYPE i DEFAULT 200,
            p_group TYPE rzlli_apcl DEFAULT 'PARALLEL_PP'.

INCLUDE zpp_conf_parallel_f01.

START-OF-SELECTION.
  SELECT * FROM zpp_conf_stg INTO TABLE gt_conf
    WHERE werks IN s_werks
      AND aufnr IN s_aufnr
      AND status = 'N'
    ORDER BY aufnr vornr.
  IF sy-subrc <> 0.
    WRITE / 'Keine offenen Rueckmeldungen.'.
    RETURN.
  ENDIF.

  CALL FUNCTION 'SPBT_INITIALIZE'
    EXPORTING
      group_name                     = p_group
    IMPORTING
      free_pbt_wps                   = gv_free
    EXCEPTIONS
      invalid_group_name             = 1
      internal_error                 = 2
      pbt_env_already_initialized    = 3
      currently_no_resources_avail   = 4
      no_pbt_resources_found         = 5
      cant_init_different_pbt_groups = 6
      OTHERS                         = 7.
  IF sy-subrc <> 0 AND sy-subrc <> 3.
    MESSAGE e020(zpp) WITH p_group.
  ENDIF.

  LOOP AT gt_conf INTO DATA(ls_conf).
    DATA(lv_idx) = sy-tabix.
    APPEND ls_conf TO gt_package.
*   Paket voll oder letzter Satz -> abschicken
    IF lines( gt_package ) >= p_pack OR lv_idx = lines( gt_conf ).
      PERFORM dispatch_package.
      CLEAR gt_package.
    ENDIF.
  ENDLOOP.

* auf alle Rueckmeldungen der Tasks warten
  WAIT UNTIL gv_recv >= gv_sent.

  WRITE: / 'Pakete gesendet:', gv_sent,
         / 'Rueckmeldungen gebucht:', gv_ok,
         / 'Rueckmeldungen fehlerhaft:', gv_err,
         / 'Pakete mit Systemfehler:', gv_pkg_err.
