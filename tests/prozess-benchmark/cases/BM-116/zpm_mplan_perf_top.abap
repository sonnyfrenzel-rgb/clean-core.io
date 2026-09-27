*----------------------------------------------------------------------*
* Include ZPM_MPLAN_PERF_TOP - globale Daten und Selektionsbild
*----------------------------------------------------------------------*
TABLES: mpla, mpos.

TYPES: BEGIN OF ty_plan,
         warpl TYPE mpla-warpl,
         iwerk TYPE mpos-iwerk,
       END OF ty_plan,
       tt_plan TYPE STANDARD TABLE OF ty_plan WITH DEFAULT KEY.

* Ergebnisstruktur ZPM_S_MPLAN_RESULT:
*   WARPL  Wartungsplan
*   STATUS A = Auftrag angelegt, T = fällig (Testlauf),
*          N = nicht fällig, O = offener Auftrag vorhanden,
*          L = gesperrt, F = Fehler
*   DUE    hochgerechnetes Fälligkeitsdatum
*   AUFNR  angelegter bzw. offener Auftrag
*   TEXT   Klartext

DATA: gt_plan   TYPE tt_plan,
      gt_result TYPE zpm_t_mplan_result,
      gs_log    TYPE bal_s_log,
      gv_log    TYPE balloghndl,
      gv_sent   TYPE i,
      gv_done   TYPE i,
      gv_max    TYPE i,
      gv_free   TYPE i.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
SELECT-OPTIONS: s_warpl FOR mpla-warpl,
                s_iwerk FOR mpos-iwerk OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
PARAMETERS: p_test  AS CHECKBOX DEFAULT 'X',
            p_para  AS CHECKBOX DEFAULT 'X',
            p_group TYPE rzlli_apcl DEFAULT 'parallel_generators'.
SELECTION-SCREEN END OF BLOCK b2.
