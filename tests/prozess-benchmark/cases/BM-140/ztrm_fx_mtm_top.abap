*&---------------------------------------------------------------------*
*& Include ZTRM_FX_MTM_TOP - Deklarationen Marktbewertung Devisen
*&---------------------------------------------------------------------*
* Annahmen (Konzernvorgabe Treasury 2015):
*   - alle Devisentermingeschäfte gegen EUR, Kurs = EUR je Fremdwährung
*   - Marktwert (MtM) = Fremdwährungsbetrag * (Marktterminkurs - Geschäftskurs)
*   - Marktterminkurs = Mittelkurs (Kurstyp M) + Terminpunkte je Laufzeitband
*   - Kontrahentenlimit gilt für die Summe der positiven Marktwerte
*   - negative Marktwerte (Verbindlichkeiten gegenüber der Bank)
*     mindern die Auslastung nicht
* Datenquellen:
*   VTBFHA         Geschäftskopf (Produktart 60A, Fälligkeit, Partner)
*   ZTRM_FX_POS    Tagesposition aus der Handelsplattform
*                  (Fremdwährung, Betrag, Geschäftskurs)
*   ZTRM_FWD_PTS   Terminpunkte je Währung, Stichtag und Laufzeitband
*                  (TAGE_BIS = Obergrenze des Bandes in Tagen)
*   ZTRM_CPTY_LIMIT Kontrahentenlimite (über ZCL_TRM_CPTY_LIMIT)
*   INDX(ZM)       Marktwerte je Stichtag für den Vortagesvergleich
* Ausgaben:
*   XML-Datei für das Risikosystem (Transformation ID)
*   Liste mit Marktwerten, Limitverstößen und Positionsliste
*----------------------------------------------------------------------*
TABLES vtbfha.

TYPES: BEGIN OF ty_deal,
         kontrh    TYPE vtbfha-kontrh,
         rfha      TYPE vtbfha-rfha,
         bukrs     TYPE vtbfha-bukrs,
         sfhaart   TYPE vtbfha-sfhaart,
         delfz     TYPE vtbfha-delfz,
         fw_waers  TYPE waers,
         fw_betrag TYPE ztrm_betrag,
         kurs      TYPE ztrm_kurs,
       END OF ty_deal,
       BEGIN OF ty_mtm,
         kontrh    TYPE vtbfha-kontrh,
         rfha      TYPE vtbfha-rfha,
         fw_waers  TYPE waers,
         restlz    TYPE i,
         mkurs     TYPE ztrm_kurs,
         mtm       TYPE ztrm_betrag,
         mtm_vt    TYPE ztrm_betrag,
         delta     TYPE ztrm_betrag,
       END OF ty_mtm,
       BEGIN OF ty_breach,
         kontrh TYPE vtbfha-kontrh,
         expo   TYPE ztrm_betrag,
         limit  TYPE ztrm_betrag,
       END OF ty_breach,
       ty_t_mtm TYPE STANDARD TABLE OF ty_mtm WITH DEFAULT KEY.

SELECT-OPTIONS: s_bukrs FOR vtbfha-bukrs OBLIGATORY,
                s_kontrh FOR vtbfha-kontrh.
PARAMETERS: p_datum TYPE datum DEFAULT sy-datum,
            p_file  TYPE string LOWER CASE
                    DEFAULT '/interface/risk/fx_mtm.xml',
            p_test  AS CHECKBOX DEFAULT 'X'.

DATA: gt_deal   TYPE STANDARD TABLE OF ty_deal,
      gt_mtm    TYPE ty_t_mtm,
      gt_prev   TYPE ty_t_mtm,
      gt_fwd    TYPE SORTED TABLE OF ztrm_fwd_pts
                WITH NON-UNIQUE KEY fw_waers tage_bis,
      gt_breach TYPE STANDARD TABLE OF ty_breach,
      gv_indx   TYPE indx_srtfd.

*----------------------------------------------------------------------*
* Behandler für Limitüberschreitungen
*----------------------------------------------------------------------*
CLASS lcl_breach_handler DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS on_breach
      FOR EVENT limit_breach OF zcl_trm_cpty_limit
      IMPORTING iv_kontrh iv_expo iv_limit.
ENDCLASS.

DATA: go_limit   TYPE REF TO zcl_trm_cpty_limit,
      go_handler TYPE REF TO lcl_breach_handler.
