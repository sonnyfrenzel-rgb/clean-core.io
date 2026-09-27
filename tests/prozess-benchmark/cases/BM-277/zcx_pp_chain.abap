CLASS zcx_pp_chain DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.
* Fehler beim Einplanen/Neustarten der Dispositionskette (OTR-Texte)
  PUBLIC SECTION.
    CONSTANTS:
      unknown_step_type  TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0001',
      job_open_failed    TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0002',
      job_close_failed   TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0003',
      submit_failed      TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0004',
      no_plants          TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0005',
      plant_not_planned  TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0006',
      no_steps           TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0007',
      nothing_to_restart TYPE sotr_conc VALUE '0050569A2B3C1EEA9F1D4E2A6B7C0008'.
ENDCLASS.



CLASS zcx_pp_chain IMPLEMENTATION.
ENDCLASS.
