PROGRAM sapmzkanban MESSAGE-ID zpk.
*----------------------------------------------------------------------*
* Kanban-Scanner an der Montagelinie (MDE-Geraet 8x40, Transaktion ZPK1)
* Werker scannt leeren Behaelter -> Status LEER -> Nachschub laeuft an
* 2010 Ersterstellung / 2018 KHA: Sonderkanban bei Doppelscan
*----------------------------------------------------------------------*
* Dynpro 0100: Eingabe Behaelter-ID (GV_PKKEY), Versorgungsbereich
* Dynpro 0200: Rueckmeldung (GV_MSG)
*----------------------------------------------------------------------*
TABLES: pkps, pkhd.

DATA: ok_code   TYPE sy-ucomm,
      gv_save   TYPE sy-ucomm,
      gv_pkkey  TYPE pkps-pkkey,
      gv_prvbe  TYPE pkhd-prvbe,
      gs_pkps   TYPE pkps,
      gs_pkhd   TYPE pkhd,
      gv_msg    TYPE char40,
      gv_answer TYPE c LENGTH 1.

CONSTANTS: gc_leer     TYPE pkps-pkbst VALUE '2',
           gc_voll     TYPE pkps-pkbst VALUE '5',
           gc_inbenutz TYPE pkps-pkbst VALUE '6'.

INCLUDE mzkanbani01.
INCLUDE mzkanbanf01.
