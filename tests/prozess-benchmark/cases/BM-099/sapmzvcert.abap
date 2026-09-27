*&---------------------------------------------------------------------*
*& Modulpool SAPMZVCERT - Pflege Lieferantenzertifikate
*& Transaktion ZVCERT
*&---------------------------------------------------------------------*
*& Dynpro 0100: Einstieg (Kreditor, Zertifikatsart)
*&              Funktionen SHOW = Anzeigen, CREA = Anlegen, CHNG = Ändern
*& Dynpro 0200: Detail (Zertifikatsnummer, Aussteller, gültig von/bis,
*&              Bemerkung); Funktionen SAVE, DELE, BACK, CANC
*&
*& Ablaufsteuerung 0100:
*&   PROCESS BEFORE OUTPUT.
*&     MODULE status_0100.
*&   PROCESS AFTER INPUT.
*&     MODULE exit_command AT EXIT-COMMAND.
*&     MODULE user_command_0100.
*&
*& Ablaufsteuerung 0200:
*&   PROCESS BEFORE OUTPUT.
*&     MODULE status_0200.
*&   PROCESS AFTER INPUT.
*&     MODULE exit_command AT EXIT-COMMAND.
*&     MODULE user_command_0200.
*&
*& Nachrichtenklasse ZVCERT:
*&   001  Kreditor & existiert nicht
*&   002  Kreditor & ist gesperrt oder zum Löschen vorgemerkt
*&   003  Zertifikat & / & existiert bereits
*&   004  Zertifikat & / & existiert nicht
*&   005  Keine Berechtigung für Zertifikatsart &
*&   006  Zertifikat wird von & bearbeitet
*&   007  Gültig-bis liegt vor Gültig-ab
*&   008  Zertifikatsart & ist nicht definiert
*&   010  Anzeigemodus - nichts zu sichern
*&   011  Zertifikat & / & gesichert
*&   012  Zertifikat & / & gelöscht
*&---------------------------------------------------------------------*
*& 2010-10  UH  Erstellung (QM-Audit Lieferantenbewertung)
*& 2011-03  UH  Änderungsprotokoll ZVCERT_LOG
*& 2014-07  FP  Berechtigungsobjekt Z_VCERT je Zertifikatsart
*& 2018-01  FP  Status E/G beim Sichern
*&---------------------------------------------------------------------*
PROGRAM sapmzvcert MESSAGE-ID zvcert.

*----------------------------------------------------------------------*
* Tabellen (Auslieferungsklasse A, Pflege nur über diese Transaktion)
*   ZVCERT       Lieferantenzertifikat
*                MANDT, LIFNR, CTYPE (Schlüssel), CERTNO, ISSUER,
*                VALID_FROM, VALID_TO, REMARK, STATUS (E/G),
*                AENAM, AEDAT
*   ZVCERT_TYPE  Zertifikatsarten (Customizing, SM30)
*                MANDT, CTYPE, MAXYEARS, QMREL
*   ZVCERT_TYPET Texte zu Zertifikatsarten
*                MANDT, SPRAS, CTYPE, CTEXT
*   ZVCERT_LOG   Änderungsprotokoll
*                MANDT, LIFNR, CTYPE, UDATE, UTIME (Schlüssel), UNAME,
*                MODE, OLD_VALID, NEW_VALID, OLD_CERTNO, NEW_CERTNO
* Sperrobjekt EZVCERT (LIFNR, CTYPE)
* Berechtigungsobjekt Z_VCERT (ACTVT, ZCTYPE)
*----------------------------------------------------------------------*

* Dynprofelder 0100/0200 sind Felder der Tabelle ZVCERT:
*   LIFNR, CTYPE, CERTNO, ISSUER, VALID_FROM, VALID_TO, REMARK
* Systemfelder: STATUS, AENAM, AEDAT (nicht auf dem Dynpro)
TABLES: zvcert,
        lfa1.

DATA: ok_code   TYPE sy-ucomm,
      gv_ucomm  TYPE sy-ucomm,
      gv_mode   TYPE c LENGTH 1,
      gv_locked TYPE c LENGTH 1,
      gv_answer TYPE c LENGTH 1,
      gs_old    TYPE zvcert.

* Anzeigefelder Dynpro 0200 (nicht eingabebereit)
DATA: gv_name1 TYPE lfa1-name1,
      gv_ort01 TYPE lfa1-ort01,
      gv_ctext TYPE zvcert_typet-ctext,
      gv_days  TYPE i.

CONSTANTS: gc_display TYPE c LENGTH 1 VALUE 'A',
           gc_create  TYPE c LENGTH 1 VALUE 'C',
           gc_change  TYPE c LENGTH 1 VALUE 'U'.

INCLUDE mzvcerto01.    "PBO
INCLUDE mzvcerti01.    "PAI
INCLUDE mzvcertf01.    "Unterroutinen
