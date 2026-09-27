REPORT zpt_term_upload MESSAGE-ID zpt_term.
************************************************************************
* Zeiterfassung: Upload der Buchungsdatei des Terminalservers
* Datei (je Werk): Terminal;Ausweis;Datum;Uhrzeit;Buchungsart
*   Buchungsart K = Kommen, G = Gehen, PB = Pause Beginn, PE = Pause Ende
* -> Zeitereignisse ueber BAPI_CC1_UPLOAD_TIMEEVENT
* Job ZPT_TERM_UPLOAD_<Werk>, alle 15 Minuten
* 2007-03 HR-IT  Anlage (vorher KK4/CC1-Schnittstelle)
* 2014-11 HR-IT  Dublettenpruefung gegen TEVEN
* 2020-05 HR-IT  Archivierung der Datei statt Loeschen
************************************************************************
PARAMETERS: p_file  TYPE string LOWER CASE
                    DEFAULT '/interface/hr/time/in/buchungen.csv',
            p_arch  TYPE string LOWER CASE
                    DEFAULT '/interface/hr/time/archive/',
            p_test  AS CHECKBOX.

TYPES: BEGIN OF ty_raw,
         terminal TYPE char10,
         zausw    TYPE pa0050-zausw,
         ldate    TYPE sy-datum,
         ltime    TYPE sy-uzeit,
         kind     TYPE char2,
       END OF ty_raw.

DATA: gt_raw     TYPE STANDARD TABLE OF ty_raw,
      gt_lines   TYPE STANDARD TABLE OF string,
      gt_events  TYPE STANDARD TABLE OF bapicc1uptevent,
      gt_return  TYPE STANDARD TABLE OF bapireturn1,
      gv_log     TYPE balloghndl,
      gv_errors  TYPE i,
      gv_posted  TYPE abap_bool.

INCLUDE zpt_term_upload_f01.

START-OF-SELECTION.
  PERFORM lock_file.
  PERFORM log_create.
  PERFORM read_file.
  IF gt_raw IS INITIAL.
    PERFORM log_add USING 'I' 'Keine Buchungen in der Datei'.
  ELSE.
    PERFORM map_events.
    PERFORM post_events.
  ENDIF.
  IF gv_posted = abap_true.
    PERFORM archive_file.
  ENDIF.
  PERFORM log_save.
  CALL FUNCTION 'DEQUEUE_EZPT_TERMFILE'
    EXPORTING
      filename = p_file.
