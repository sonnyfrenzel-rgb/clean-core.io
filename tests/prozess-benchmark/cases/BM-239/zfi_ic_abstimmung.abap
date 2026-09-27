*&---------------------------------------------------------------------*
*& Report  ZFI_IC_ABSTIMMUNG
*&
*& Intercompany-Abstimmung zum Stichtag:
*&   eigene Forderungen/Verbindlichkeiten gegenueber Partnergesell-
*&   schaften (Partner-Gesellschaftsnummer VBUND) werden mit den Salden
*&   im Partnersystem verglichen. Die Partnersalden werden parallel
*&   per RFC gelesen (Z_FI_IC_SALDEN_LESEN, liegt in jedem System).
*&   Differenzen ueber Toleranz -> ZFI_IC_DIFF fuer die Klaerung.
*&---------------------------------------------------------------------*
*& Einplanung: Job ZFI_IC_ABSTIMMUNG_<BUKRS>, Arbeitstag 3 nach
*& Monatsende, Variante je Buchungskreis. Das IC-Team klaert die
*& Differenzen in ZFI_IC_DIFF ueber Transaktion ZFI_IC_KLAER.
*& Voraussetzung: Z_FI_IC_SALDEN_LESEN in jedem Partnersystem in
*& gleicher Version, RFC-Benutzer ZIC_RFC mit Leserecht F_BKPF_BUK.
*&---------------------------------------------------------------------*
*& 2010-10  RSP  Erstellung (sequentiell)
*& 2015-12  RSP  parallele RFC, Laufzeit Abschluss von 40 auf 6 Min.
*& 2021-03  ALE  Rueckfall auf synchrones RFC bei RESOURCE_FAILURE
*&---------------------------------------------------------------------*
REPORT zfi_ic_abstimmung MESSAGE-ID zfi_ic.

INCLUDE zfi_ic_abstimmung_top.
INCLUDE zfi_ic_abstimmung_f01.
INCLUDE zfi_ic_abstimmung_f02.
INCLUDE zfi_ic_abstimmung_f03.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  PERFORM partner_lesen.
  IF gt_partner IS INITIAL.
    MESSAGE e001 WITH p_bukrs.
  ENDIF.

  PERFORM eigene_salden.
  PERFORM partner_salden_parallel.
  PERFORM vergleichen.

  IF p_test IS INITIAL.
    COMMIT WORK.
  ENDIF.

  PERFORM ausgabe.
