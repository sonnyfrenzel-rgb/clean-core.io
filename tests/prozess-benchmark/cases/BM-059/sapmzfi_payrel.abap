*&---------------------------------------------------------------------*
*& Modulpool SAPMZFI_PAYREL
*& Zahlungsfreigabe im Vier-Augen-Prinzip vor dem Zahllauf (F110)
*& Transaktion ZFI_PAYREL, Einstiegsbild 0100
*&---------------------------------------------------------------------*
*& Aenderungen:
*& 2011-05-17 HBE     Anlage (Projekt Sicherheit Zahlungsverkehr)
*& 2013-02-04 HBE     Zweite Freigabe ueber Betragsgrenze ZFI_PAYREL_LIM
*& 2014-06-30 HBE     COMMIT WORK AND WAIT zurueckgenommen (Laufzeit)
*& 2016-09-12 TWI     Workflow-Events fuer Zweitfreigeber / Zahllauf
*& 2019-11-28 EXT-KL  Start F110 direkt aus der Freigabe (Batch-Input)
*&---------------------------------------------------------------------*
PROGRAM sapmzfi_payrel MESSAGE-ID zfi_pay.

INCLUDE mzfi_payreltop.   " Globale Daten, Makros
INCLUDE mzfi_payrelo01.   " PBO-Module
INCLUDE mzfi_payreli01.   " PAI-Module
INCLUDE mzfi_payrelf01.   " FORM-Routinen
* INCLUDE mzfi_payrelf02.   " Druck Freigabeprotokoll - 2016 entfernt
