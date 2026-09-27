CLASS zcl_ztm_v_fo_capacity DEFINITION
  PUBLIC
  INHERITING FROM /bobf/cl_lib_v_supercl_simple
  FINAL
  CREATE PUBLIC .

*"* Validierung ZZ_CHECK_CAPACITY am Knoten ROOT des BO /SCMTMS/TOR
*"* (Konsistenzvalidierung, Erweiterung ZTM_TOR_ENH)
*"* Kapazitaeten je Fahrzeugtyp (MTR) in Kundentabelle ZTM_VEH_CAP,
*"* Pflege durch die Fuhrparkverwaltung (SM30)
  PUBLIC SECTION.

    METHODS /bobf/if_frw_validation~execute
        REDEFINITION .
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.



CLASS zcl_ztm_v_fo_capacity IMPLEMENTATION.


  METHOD /bobf/if_frw_validation~execute.
*----------------------------------------------------------------------*
* Frachtauftrag darf das zulaessige Ladegewicht des Fahrzeugtyps (plus
* Ueberplanungstoleranz) nicht ueberschreiten; Gefahrgut nur auf
* ADR-zugelassenen Fahrzeugtypen.
*----------------------------------------------------------------------*
* 04/2021 PW  Erstellung
* 11/2021 PW  Toleranz ueber TVARVC (Wunsch Disposition Nord)
* 03/2022 SB  ADR-Pruefung
*----------------------------------------------------------------------*
    DATA: lt_root TYPE /scmtms/t_tor_root_k,
          lt_mtr  TYPE STANDARD TABLE OF ztm_veh_cap-mtr WITH EMPTY KEY,
          lt_cap  TYPE SORTED TABLE OF ztm_veh_cap WITH UNIQUE KEY mtr,
          ls_msg  TYPE symsg.

    CLEAR et_failed_key.
    eo_message = /bobf/cl_frw_factory=>get_message( ).

    io_read->retrieve(
      EXPORTING
        iv_node = /scmtms/if_tor_c=>sc_node-root
        it_key  = it_key
      IMPORTING
        et_data = lt_root ).

    lt_mtr = VALUE #( FOR ls_r IN lt_root WHERE ( mtr IS NOT INITIAL ) ( ls_r-mtr ) ).
    IF lt_mtr IS NOT INITIAL.
      SELECT * FROM ztm_veh_cap
        FOR ALL ENTRIES IN @lt_mtr
        WHERE mtr = @lt_mtr-table_line
        INTO TABLE @lt_cap.
    ENDIF.

*   Ueberplanungstoleranz in Prozent (Schalter der Disposition)
    SELECT SINGLE low FROM tvarvc
      WHERE name = 'ZTM_CAP_TOLERANCE_PCT'
        AND type = 'P'
        AND numb = '0000'
      INTO @DATA(lv_low).
    DATA(lv_tol) = COND i( WHEN sy-subrc = 0 THEN lv_low ELSE 0 ).

    LOOP AT lt_root INTO DATA(ls_root).

*     ohne Fahrzeugtyp (noch nicht disponiert) keine Pruefung
      IF ls_root-mtr IS INITIAL.
        CONTINUE.
      ENDIF.

      READ TABLE lt_cap INTO DATA(ls_cap) WITH TABLE KEY mtr = ls_root-mtr.
      IF sy-subrc <> 0.
*       Fahrzeugtyp nicht gepflegt -> nur Warnung, Auftrag bleibt konsistent
        ls_msg = VALUE #( msgty = 'W' msgid = 'ZTM' msgno = '101' msgv1 = ls_root-mtr ).
        eo_message->add_message( is_msg  = ls_msg
                                 iv_node = is_ctx-node_key
                                 iv_key  = ls_root-key ).
        CONTINUE.
      ENDIF.

*     Kapazitaet immer in KG gepflegt (siehe Pflegedialog)
      DATA(lv_max) = ls_cap-max_gro_wei * ( 100 + lv_tol ) / 100.

      IF ls_root-zz_total_weight > lv_max.
        ls_msg = VALUE #( msgty = 'E' msgid = 'ZTM' msgno = '100'
                          msgv1 = |{ ls_root-zz_total_weight }|
                          msgv2 = |{ lv_max }|
                          msgv3 = ls_root-mtr ).
        eo_message->add_message( is_msg       = ls_msg
                                 iv_node      = is_ctx-node_key
                                 iv_key       = ls_root-key
                                 iv_attribute = zif_ztm_tor_c=>sc_node_attribute-root-zz_total_weight ).
        INSERT VALUE #( key = ls_root-key ) INTO TABLE et_failed_key.
      ENDIF.

*     Gefahrgut nur auf ADR-zugelassenen Fahrzeugtypen
      IF ls_root-zz_dg_indicator = abap_true AND ls_cap-adr_zugelassen = abap_false.
        ls_msg = VALUE #( msgty = 'E' msgid = 'ZTM' msgno = '102'
                          msgv1 = ls_root-tor_id
                          msgv2 = ls_root-mtr ).
        eo_message->add_message( is_msg  = ls_msg
                                 iv_node = is_ctx-node_key
                                 iv_key  = ls_root-key ).
        INSERT VALUE #( key = ls_root-key ) INTO TABLE et_failed_key.
      ENDIF.

*      IF sy-uname = 'PWEBER'.              "Test Toleranz - 2021 raus
*        CLEAR et_failed_key.
*      ENDIF.

    ENDLOOP.

  ENDMETHOD.
ENDCLASS.
