*&---------------------------------------------------------------------*
*&  Include           ZFI_IC_ABSTIMMUNG_TOP
*&---------------------------------------------------------------------*
*----------------------------------------------------------------------*
* Pflege ZFI_IC_PARTNER (SM30, Pflege durch IC-Team):
*   BUKRS          eigener Buchungskreis
*   PARTNER_BUKRS  Buchungskreis im Partnersystem
*   VBUND          Partner-Gesellschaftsnummer des Partners bei uns
*   EIGENE_VBUND   unsere Gesellschaftsnummer im Partnersystem
*   RFCDEST        RFC-Destination (SM59), Benutzer ZIC_RFC
*   AKTIV          nur aktive Partner werden abgestimmt
*
* Statuswerte der Ausgabe:
*   O  abgestimmt (innerhalb Toleranz)
*   D  Differenz -> ZFI_IC_DIFF (nur Echtlauf)
*   F  Partnersaldo nicht ermittelbar (RFC-Fehler)
*   ' ' keine Rueckmeldung innerhalb der Wartezeit
*----------------------------------------------------------------------*
TYPES: BEGIN OF ty_partner,
         partner_bukrs TYPE bukrs,
         vbund         TYPE rassc,      "Partner-Gesellschaft des Partners
         eigene_vbund  TYPE rassc,      "wir als Partner beim Partner
         rfcdest       TYPE rfcdest,
         waers         TYPE waers,
       END OF ty_partner.

TYPES: BEGIN OF ty_saldo,
         partner_bukrs TYPE bukrs,
         eig_ford      TYPE dmbtr,      "unsere Forderung an Partner
         eig_verb      TYPE dmbtr,      "unsere Verbindlichkeit
         par_ford      TYPE dmbtr,      "Forderung des Partners an uns
         par_verb      TYPE dmbtr,      "Verbindlichkeit des Partners
         status        TYPE c LENGTH 1, "O = ok, D = Differenz, F = Fehler
         text          TYPE char80,
       END OF ty_saldo.

DATA: gt_partner  TYPE STANDARD TABLE OF ty_partner,
      gt_saldo    TYPE SORTED TABLE OF ty_saldo WITH UNIQUE KEY partner_bukrs,
      gv_gestartet TYPE i,
      gv_fertig    TYPE i.

PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
            p_datum TYPE datum OBLIGATORY DEFAULT sy-datum,
            p_toler TYPE dmbtr DEFAULT '10.00',
            p_test  AS CHECKBOX DEFAULT 'X'.
