*&---------------------------------------------------------------------*
*& Modulpool SAPMZPP_WERKER - Werkerrueckmeldung am Terminal
*& Transaktion ZPP_RM (Dynpro 0100 Scan, Dynpro 0200 Mengen)
*&---------------------------------------------------------------------*
*& 2011-08  MK  Erstellung fuer Montagelinie Halle 3
*& 2013-02  MK  retrograde Entnahme der Komponenten mitbuchen
*& 2018-11  PB  Etikettendruck nach Endrueckmeldung
*&---------------------------------------------------------------------*
PROGRAM sapmzpp_werker MESSAGE-ID zpp_rm.

INCLUDE mzpp_werkertop.
INCLUDE mzpp_werkero01.
INCLUDE mzpp_werkeri01.
INCLUDE mzpp_werkerf01.
