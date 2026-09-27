*&---------------------------------------------------------------------*
*& Include ZPS_NETZ_RESCHED_TOP - Deklarationen
*&---------------------------------------------------------------------*
TABLES proj.

TYPES: BEGIN OF ty_proj,
         pspnr TYPE proj-pspnr,
         pspid TYPE proj-pspid,
         objnr TYPE proj-objnr,
         post1 TYPE proj-post1,
       END OF ty_proj,
       ty_t_proj TYPE STANDARD TABLE OF ty_proj WITH DEFAULT KEY.

* Ergebniszeile - identisch mit DDIC-Struktur ZPS_S_RESCHED_RES
*   STATUS: O = neu terminiert, T = Testlauf, S = übersprungen,
*           F = Fehler, L = keine Netzpläne
*   AMPEL : 1 rot, 2 gelb, 3 grün (Exception-Spalte)
TYPES ty_t_erg TYPE STANDARD TABLE OF zps_s_resched_res WITH DEFAULT KEY.

CONSTANTS: gc_stat_neu    TYPE zps_resched_status VALUE 'O',
           gc_stat_test   TYPE zps_resched_status VALUE 'T',
           gc_stat_skip   TYPE zps_resched_status VALUE 'S',
           gc_stat_fehler TYPE zps_resched_status VALUE 'F',
           gc_stat_leer   TYPE zps_resched_status VALUE 'L'.

SELECT-OPTIONS s_pspid FOR proj-pspid OBLIGATORY.
PARAMETERS: p_group TYPE rzlli_apcl DEFAULT 'parallel_generators',
            p_maxt  TYPE i DEFAULT 5,
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: gt_proj   TYPE ty_t_proj,
      gs_proj   TYPE ty_proj,
      gt_erg    TYPE ty_t_erg,
      gv_sent   TYPE i,
      gv_recv   TYPE i,
      gv_active TYPE i,
      gv_task   TYPE char32,
      gv_msg    TYPE char255,
      go_alv    TYPE REF TO cl_salv_table.

*----------------------------------------------------------------------*
* Ereignisbehandler für das Ergebnis-ALV
*----------------------------------------------------------------------*
CLASS lcl_handler DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_double_click
      FOR EVENT double_click OF cl_salv_events_table
      IMPORTING row column.
ENDCLASS.

DATA go_handler TYPE REF TO lcl_handler.
