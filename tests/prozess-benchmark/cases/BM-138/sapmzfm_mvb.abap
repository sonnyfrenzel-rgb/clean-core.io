*&---------------------------------------------------------------------*
*& Modulpool SAPMZFM_MVB - Antrag auf Mittelvormerkung mit Genehmigung
*&---------------------------------------------------------------------*
*& Transaktionen:
*&   ZFM_MVB     Antrag erfassen, prüfen, einreichen   (Dynpro 0100)
*&   ZFM_MVB_OK  Antrag genehmigen / ablehnen          (Dynpro 0200)
*&               Aufruf aus dem Workflow-Eingang, Antragsnummer über
*&               SPA/GPA-Parameter ZMVB
*&
*& Ablauflogik Dynpro 0100:
*&   PROCESS BEFORE OUTPUT.
*&     MODULE status_0100.
*&   PROCESS AFTER INPUT.
*&     MODULE exit_command AT EXIT-COMMAND.
*&     FIELD gs_kopf-fistl MODULE check_fistl ON REQUEST.
*&     MODULE user_command_0100.
*& Ablauflogik Dynpro 0200:
*&   PROCESS BEFORE OUTPUT.
*&     MODULE status_0200.
*&   PROCESS AFTER INPUT.
*&     MODULE exit_command AT EXIT-COMMAND.
*&     MODULE user_command_0200.
*&
*& Workflow: Objekttyp ZFMMVB, Ereignisse CREATED (startet die
*&   Genehmigungsaufgabe beim Budgetverantwortlichen der Finanzstelle),
*&   APPROVED und REJECTED (Benachrichtigung des Antragstellers).
*& Verfügbarkeit: Sicht ZFM_V_VERFUEGBAR (Budget - Obligo - Ist je
*&   Finanzstelle/Finanzposition/Jahr), keine Standard-AVC im Dialog.
*& Mittelvormerkung: Belegart ZV, wird erst bei Genehmigung angelegt.
*&
*& 2017 KOM  Ersterstellung (Stadtkämmerei)
*& 2019 KOM  Vier-Augen-Prinzip, Workflow-Ereignisse
*& 2021 TWE  Mittelvormerkung erst bei Genehmigung anlegen
*&---------------------------------------------------------------------*
PROGRAM sapmzfm_mvb MESSAGE-ID zfm.

INCLUDE mzfm_mvb_top.
INCLUDE mzfm_mvb_o01.
INCLUDE mzfm_mvb_i01.
INCLUDE mzfm_mvb_f01.
