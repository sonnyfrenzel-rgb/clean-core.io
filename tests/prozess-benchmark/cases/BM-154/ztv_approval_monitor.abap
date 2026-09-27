REPORT ztv_approval_monitor.
************************************************************************
* Reisekosten: Genehmigungsfristen ueberwachen (taeglicher Job)
*  - Kleinbetraege nach Frist automatisch genehmigen (Betriebsvereinb.
*    Reisekosten 2016, Anlage 3)
*  - Genehmiger nach n Tagen erinnern (Sammelmail je Genehmiger)
*  - nach m Tagen an den Vorgesetzten des Genehmigers eskalieren
* ANTRG '3' = zur Genehmigung eingereicht (Kundencustomizing)
************************************************************************
PARAMETERS: p_auto  TYPE ptrv_rec_amount DEFAULT '50.00',
            p_dauto TYPE i DEFAULT 5,
            p_drem  TYPE i DEFAULT 3,
            p_desc  TYPE i DEFAULT 10,
            p_test  AS CHECKBOX DEFAULT 'X'.

TYPES: BEGIN OF ty_work,
         pernr    TYPE pernr_d,
         reinr    TYPE reinr,
         amount   TYPE ptrv_rec_amount,
         days     TYPE i,
         approver TYPE pernr_d,
         action   TYPE char10,
       END OF ty_work,
       tt_work TYPE STANDARD TABLE OF ty_work WITH DEFAULT KEY.

DATA: gt_work TYPE tt_work,
      gt_esc  TYPE tt_work.

INCLUDE ztv_approval_monitor_f01.

START-OF-SELECTION.
  PERFORM select_trips.
  IF gt_work IS INITIAL.
    WRITE: / 'Keine Reisen in Genehmigung.'.
    RETURN.
  ENDIF.
  PERFORM determine_approvers.
  PERFORM process_by_approver.
  PERFORM escalate.
  PERFORM show_result.
