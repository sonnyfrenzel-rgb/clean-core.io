*----------------------------------------------------------------------*
* Include ZWM_PICK_WAVE_TOP
*----------------------------------------------------------------------*
TABLES: likp.

PARAMETERS: p_lgnum TYPE lgnum OBLIGATORY MEMORY ID lgn,
            p_vstel TYPE vstel OBLIGATORY.
SELECT-OPTIONS: s_route FOR likp-route,
                s_wadat FOR likp-wadat.
PARAMETERS: p_max   TYPE i DEFAULT 200,
            p_conf  AS CHECKBOX DEFAULT 'X',
            p_print AS CHECKBOX DEFAULT 'X',
            p_ldest TYPE rspopname DEFAULT 'LP01'.

TYPES: BEGIN OF ty_lief,
         vbeln  TYPE likp-vbeln,
         route  TYPE likp-route,
         lprio  TYPE likp-lprio,
         wadat  TYPE likp-wadat,
         tanum  TYPE ltak-tanum,
         status TYPE char1,          "S = TA, Q = quittiert, E = Fehler, L = gesperrt
       END OF ty_lief.

DATA: gt_lief   TYPE STANDARD TABLE OF ty_lief,
      go_log    TYPE REF TO zcl_wm_pick_log,
      gv_open   TYPE i,
      gv_tasks  TYPE i,
      gt_spool  TYPE STANDARD TABLE OF rspoid.

FIELD-SYMBOLS <gs_lief> TYPE ty_lief.

CONSTANTS: gc_fixplatz TYPE lgtyp VALUE '005',
           gc_max_par  TYPE i VALUE 5.
