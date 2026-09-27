*&---------------------------------------------------------------------*
*&  Include           ZQM_PM_PFLEGE_C02
*&---------------------------------------------------------------------*
*  Kalibrierung: Folgetermin und Erfassung eines Kalibrierergebnisses
*----------------------------------------------------------------------*
CLASS lcl_kalib DEFINITION FINAL.
  PUBLIC SECTION.
    METHODS naechster_termin
      IMPORTING is_pm          TYPE zqm_pruefmittel
      RETURNING VALUE(rv_datum) TYPE datum.
    METHODS erfassen
      CHANGING cs_pm TYPE zqm_pruefmittel.
ENDCLASS.

CLASS lcl_kalib IMPLEMENTATION.

* Folgetermin = letzte Kalibrierung + Intervall (Kalendertage, kein
* Fabrikkalender - so mit QS abgestimmt)
  METHOD naechster_termin.
    rv_datum = is_pm-letzte_kalib + is_pm-intervall.
  ENDMETHOD.

  METHOD erfassen.
    DATA lv_msg TYPE c LENGTH 80.

    CALL FUNCTION 'POPUP_TO_CONFIRM'
      EXPORTING
        titlebar              = 'Kalibrierergebnis'(t02)
        text_question         = 'Pruefmittel innerhalb der Toleranz?'(q02)
        text_button_1         = 'i.O.'(b01)
        text_button_2         = 'n.i.O.'(b02)
        default_button        = '1'
        display_cancel_button = space
      IMPORTING
        answer                = gv_answer.

    cs_pm-letzte_kalib = sy-datum.

    IF gv_answer = '2'.
*     n.i.O.: Pruefmittel sperren und Instandsetzungsauftrag im PM-System
      cs_pm-status = gc_status_gesperrt.
      CALL FUNCTION 'Z_PM_KALIB_AUFTRAG' DESTINATION gc_pm_dest
        EXPORTING
          iv_werk          = cs_pm-werk
          iv_pruefmittel   = cs_pm-id
          iv_text          = cs_pm-bezeichnung
        EXCEPTIONS
          communication_failure = 1 MESSAGE lv_msg
          system_failure        = 2 MESSAGE lv_msg
          OTHERS                = 3.
      IF sy-subrc <> 0.
*       Sperre bleibt trotzdem - Auftrag legt QS dann per Hand an
        MESSAGE w730(zqm) WITH cs_pm-id lv_msg.
      ENDIF.
    ELSE.
      cs_pm-status = gc_status_frei.
    ENDIF.

    cs_pm-naechste_kalib = naechster_termin( cs_pm ).
  ENDMETHOD.

ENDCLASS.
