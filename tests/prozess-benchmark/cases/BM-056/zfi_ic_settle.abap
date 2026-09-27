*&---------------------------------------------------------------------*
*& Report ZFI_IC_SETTLE
*&---------------------------------------------------------------------*
*& Intercompany-Abrechnung (Leistungsverrechnung) - Hintergrundjob
*& Liest offene IC-Leistungen aus ZFI_IC_SERV je Partnergesellschaft,
*& bucht die Ausgangsrechnung lokal (BAPI) und die Eingangsseite beim
*& Partner per RFC (Z_FI_IC_POST_PARTNER, Fkt.gruppe ZFI_IC_RFC).
*&---------------------------------------------------------------------*
*& Historie
*& 2011-04-12  HBR     angelegt (Projekt IC-Clearing)
*& 2013-09-02  HBR     Aufschlag aus ZFI_IC_DEST statt fix 5 %
*& 2014-06-17  EXT_PL  asynchroner Partneraufruf - wieder ausgebaut
*& 2016-01-20  EXT_TK  Application Log statt Spool-Liste (Revision)
*& 2019-11-05  MSC     Sperre je Partner (Parallellauf Job-Ketten)
*& 2021-03-08  MSC     Wiederholung Partnerseite bei Status E
*&---------------------------------------------------------------------*
REPORT zfi_ic_settle MESSAGE-ID zfi_ic LINE-SIZE 200.

INCLUDE zfi_ic_settle_top.                 " Globale Daten, Selektionsbild
INCLUDE zfi_ic_settle_f01.                 " Ablauf, Log, Protokoll
INCLUDE zfi_ic_settle_f02.                 " Buchung lokal / Partner, Status

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*

* Echtlauf nur als eingeplanter Job (SM36); im Dialog nur Testlauf
  IF sy-batch IS INITIAL AND p_test IS INITIAL.
    MESSAGE e010.
  ENDIF.

  PERFORM log_init.

  PERFORM read_services.
  IF gt_serv IS INITIAL.
    MESSAGE s011 WITH p_bukrs p_gjahr p_monat.
    RETURN.
  ENDIF.

* Abrechnung je Partnergesellschaft
  LOOP AT gt_partner INTO gs_partner.
    PERFORM process_partner USING gs_partner.
  ENDLOOP.

  PERFORM log_save.
  PERFORM write_protocol.
* PERFORM send_mail_controlling.       "2012 abgeschaltet, Controlling liest Log
