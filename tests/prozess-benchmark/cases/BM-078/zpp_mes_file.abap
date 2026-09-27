REPORT zpp_mes_file MESSAGE-ID zpp.
*&---------------------------------------------------------------------*
*& MES-Dateischnittstelle Werk (Job ZPP_MES_FILE, alle 15 Minuten)
*&  Export: freigegebene Fertigungsauftraege mit Vorgaengen und
*&          Komponenten als CSV nach <pfad>/out
*&  Import: Rueckmeldungen (Satzart R) und Wareneingaenge (Satzart G)
*&          aus <pfad>/in/RM_<werk>.csv, danach Archiv
*&  Protokoll: Anwendungs-Log ZPP/MESFILE
*&---------------------------------------------------------------------*
*& 2014-04  AS  Erstellung (Ablosung Altschnittstelle Leitrechner)
*& 2015-01  AS  Dublettenpruefung Wareneingang ueber XBLNR
*& 2019-09  TW  Dublettenpruefung Rueckmeldung ueber Rueckmeldetext
*&---------------------------------------------------------------------*
INCLUDE zpp_mes_file_top.
INCLUDE zpp_mes_file_f01.
INCLUDE zpp_mes_file_f02.
INCLUDE zpp_mes_file_f03.

START-OF-SELECTION.
  PERFORM log_anlegen.

  IF p_exp = abap_true.
    PERFORM export.
  ENDIF.

  IF p_imp = abap_true.
    PERFORM import.
  ENDIF.

  PERFORM log_sichern.
