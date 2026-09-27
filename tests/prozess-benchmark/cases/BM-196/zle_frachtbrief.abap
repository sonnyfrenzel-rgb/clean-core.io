*&---------------------------------------------------------------------*
*& Report ZLE_FRACHTBRIEF
*&---------------------------------------------------------------------*
*& Druckprogramm Frachtbrief / Befoerderungspapier je Transport (VTTK)
*& inkl. Gefahrgutangaben nach ADR 5.4.1
*&
*& Nachrichtensteuerung Transport (Applikation V7, Tabelle TNAPR):
*&   ZFB1  Druck             -> FORM ENTRY       (ZLE_FRACHTBRIEF_F01)
*&   ZFB5  Mail an Spediteur -> FORM ENTRY_MAIL  (ZLE_FRACHTBRIEF_F02)
*&
*& Gefahrgutdaten: FB Z_LE_GEFAHRGUT_DATEN (Funktionsgruppe ZLE_GG)
*& Formular:       Smart Form ZLE_FRACHTBRIEF_SF
*&---------------------------------------------------------------------*
REPORT zle_frachtbrief MESSAGE-ID zle.

INCLUDE zle_frachtbrief_top.
INCLUDE zle_frachtbrief_f01.
INCLUDE zle_frachtbrief_f02.
