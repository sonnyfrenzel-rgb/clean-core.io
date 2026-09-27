REPORT ztrm_festgeld_rollover.
*----------------------------------------------------------------------*
* Treasury Geldhandel: automatische Prolongation fälliger Festgelder
* nach Rollover-Regeln (ZTRM_ROLL), Zinssatz aus der Zinsquelle,
* die über TVARVC umgeschaltet wird (Tages- oder Monatsfixing).
* Anschließend wird der Buchungslauf (TBB1) als Job eingeplant.
* 2012 JHA  / 2017 JHA Zinsquelle umschaltbar / 2022 KFR Jobeinplanung
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_fha,
         bukrs    TYPE vtbfha-bukrs,
         rfha     TYPE vtbfha-rfha,
         kontrh   TYPE vtbfha-kontrh,
         wgschft1 TYPE vtbfha-wgschft1,
         lz_tage  TYPE ztrm_roll-lz_tage,
       END OF ty_fha,
       BEGIN OF ty_prot,
         rfha_alt TYPE vtbfha-rfha,
         rfha_neu TYPE vtbfha-rfha,
         zins     TYPE ztrm_zinssatz,
         text     TYPE char60,
       END OF ty_prot.

PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_datum TYPE datum DEFAULT sy-datum,
            p_test  AS CHECKBOX DEFAULT 'X',
            p_post  AS CHECKBOX DEFAULT 'X'.

DATA: gt_fha  TYPE STANDARD TABLE OF ty_fha,
      gs_fha  TYPE ty_fha,
      gt_prot TYPE STANDARD TABLE OF ty_prot,
      gv_tab  TYPE tabname,
      gv_neu  TYPE i.

START-OF-SELECTION.
  PERFORM zinsquelle_bestimmen.
  PERFORM faellige_lesen.
  IF gt_fha IS INITIAL.
    WRITE: / 'Keine fälligen Festgelder mit Rollover-Regel am', p_datum.
    RETURN.
  ENDIF.

  LOOP AT gt_fha INTO gs_fha.
    PERFORM prolongieren USING gs_fha.
  ENDLOOP.

  IF p_test IS INITIAL AND p_post = 'X' AND gv_neu > 0.
    PERFORM buchungslauf_einplanen.
  ENDIF.
  PERFORM protokoll.

INCLUDE ztrm_festgeld_rollover_f01.
