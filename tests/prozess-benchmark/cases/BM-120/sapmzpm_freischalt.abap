*&---------------------------------------------------------------------*
*& Modulpool SAPMZPM_FREISCHALT  (Transaktion ZPM_FREISCH)
*&---------------------------------------------------------------------*
*& Freischaltung von Instandhaltungsaufträgen (Arbeitssicherheit)
*& Berechtigung: nur Transaktionsstart (Objekt S_TCODE), keine eigene
*& Prüfung im Programm
*&
*& Dynpro 0100  Einstieg: Auftragsnummer
*& Dynpro 0200  Freischaltschritte des Auftrags (Table Control
*&              TC_STEPS): Setzen, Prüfen (Vier-Augen), Zurücknehmen,
*&              Sichern
*&
*& Ablaufeigenschaften:
*&   0100 PAI: MODULE exit_command AT EXIT-COMMAND.
*&             MODULE user_command_0100.
*&   0200 PAI: LOOP AT gt_steps. MODULE tc_steps_modify. ENDLOOP.
*&             MODULE exit_command AT EXIT-COMMAND.
*&             MODULE user_command_0200.
*&   PBO-Module (Status, Table Control) in MZPM_FREISCHALT_O01
*&---------------------------------------------------------------------*
*& 2019-02 JHO  Erstellung (Arbeitsschutzprojekt Werk 2000)
*& 2020-11 JHO  Vier-Augen-Prüfung, Status E0010 "freigeschaltet"
*& 2021-05 JHO  Zurücknehmen erst nach technischem Abschluss
*& 2022-09 EXT  Protokoll ZPM_FREISCH_LOG in der Verbuchung
*&
*& Hinweis: Die Freigabeprüfung im BAdI WORKORDER_UPDATE
*& (ZCL_IM_PM_WCM_RELEASE) verlangt für jeden ZWCM-Vorgang
*& Freischaltschritte im Status AKT.
*&---------------------------------------------------------------------*
PROGRAM sapmzpm_freischalt MESSAGE-ID zpm.

INCLUDE mzpm_freischalt_top.
INCLUDE mzpm_freischalt_o01.
INCLUDE mzpm_freischalt_i01.
INCLUDE mzpm_freischalt_f01.
