*&---------------------------------------------------------------------*
*& Report ZSD_CREDIT_RELEASE  (Transaktion ZVKM)
*&---------------------------------------------------------------------*
*& Freigabe kreditgesperrter Kundenauftraege durch das Kreditmanagement
*& Dynpro 0100: Auftragsnummer, Dynpro 0200: Kreditsituation + Entscheidung
*& Ersatz fuer VKM3 mit Begruendungspflicht (Revision 2015)
*&---------------------------------------------------------------------*
*& Aenderungen:
*& 2015-04 RKA  Ersterstellung, Batch-Input VKM3 (abgeschaltet 2015-11)
*& 2015-11 RKA  Freigabe ueber SD_ORDER_CREDIT_RELEASE
*& 2019-06 MWE  Zustandsklassen, Ablehnung als Liefersperre ZK
*& 2022-02 MWE  Arbeitsvorrat nach Auftragswert, Ampel im Dynpro 0200
*& Offen: Umstellung auf FSCM-Kreditmanagement (UKM_CASE) - Projekt S4
*&---------------------------------------------------------------------*
*& Ablauflogik Dynpro 0100:          Ablauflogik Dynpro 0200:
*&   PROCESS BEFORE OUTPUT.            PROCESS BEFORE OUTPUT.
*&     MODULE status_0100.               MODULE status_0200.
*&   PROCESS AFTER INPUT.              PROCESS AFTER INPUT.
*&     FIELD gv_vbeln                    MODULE user_command_0200.
*&       MODULE check_vbeln ON REQUEST.
*&     MODULE user_command_0100.
*&---------------------------------------------------------------------*
REPORT zsd_credit_release.

INCLUDE zsd_credit_release_top.
INCLUDE zsd_credit_release_c01.
INCLUDE zsd_credit_release_o01.
INCLUDE zsd_credit_release_i01.
INCLUDE zsd_credit_release_f01.

START-OF-SELECTION.
* nur Mitarbeiter Kreditmanagement (Aenderungsberechtigung Kreditdaten)
  AUTHORITY-CHECK OBJECT 'F_KNKK_BED'
    ID 'KKBER' FIELD gc_kkber
    ID 'ACTVT' FIELD '02'.
  IF sy-subrc <> 0.
    MESSAGE e398(00) WITH 'Keine Berechtigung fuer Kreditfreigabe'.
  ENDIF.

  PERFORM load_worklist.
  CALL SCREEN 100.
