*&---------------------------------------------------------------------*
*&  Include           ZSD_KASSLIM_PFLEGE_C01
*&---------------------------------------------------------------------*
*  Klassen: Ausnahme, abstrakte Pflegebasis (Schablone), Limitpflege
*----------------------------------------------------------------------*

CLASS lcx_pflege DEFINITION INHERITING FROM cx_static_check FINAL.
  PUBLIC SECTION.
    INTERFACES if_t100_dyn_msg.
ENDCLASS.

CLASS lcx_pflege IMPLEMENTATION.
ENDCLASS.

*----------------------------------------------------------------------*
*  Pflegebasis: Sichern als Schablonenmethode
*----------------------------------------------------------------------*
CLASS lcl_pflege_base DEFINITION ABSTRACT.
  PUBLIC SECTION.
    METHODS sichern
      RAISING lcx_pflege.
  PROTECTED SECTION.
    METHODS pruefen ABSTRACT
      RAISING lcx_pflege.
    METHODS schreiben ABSTRACT.
ENDCLASS.

CLASS lcl_pflege_base IMPLEMENTATION.
  METHOD sichern.
    pruefen( ).
    schreiben( ).
    COMMIT WORK.
  ENDMETHOD.
ENDCLASS.

*----------------------------------------------------------------------*
*  Kassenlimit je Kunde
*----------------------------------------------------------------------*
CLASS lcl_limit_pflege DEFINITION INHERITING FROM lcl_pflege_base FINAL
  CREATE PRIVATE.
  PUBLIC SECTION.
    CLASS-METHODS laden
      IMPORTING iv_kunnr        TYPE kunnr
      RETURNING VALUE(ro_pflege) TYPE REF TO lcl_limit_pflege.
    METHODS sperren
      RAISING lcx_pflege.
    DATA: ms_neu TYPE zsd_kasslimit,
          ms_alt TYPE zsd_kasslimit READ-ONLY.
  PROTECTED SECTION.
    METHODS pruefen REDEFINITION.
    METHODS schreiben REDEFINITION.
  PRIVATE SECTION.
    DATA mv_neu TYPE abap_bool.
ENDCLASS.

CLASS lcl_limit_pflege IMPLEMENTATION.

  METHOD laden.
    CREATE OBJECT ro_pflege.
    SELECT SINGLE * FROM zsd_kasslimit INTO ro_pflege->ms_alt
      WHERE kunnr = iv_kunnr.
    IF sy-subrc <> 0.
      ro_pflege->mv_neu = abap_true.
      ro_pflege->ms_alt-kunnr = iv_kunnr.
      ro_pflege->ms_alt-waers = 'EUR'.
    ENDIF.
    ro_pflege->ms_neu = ro_pflege->ms_alt.
  ENDMETHOD.

  METHOD sperren.
    CALL FUNCTION 'ENQUEUE_EZSD_KASSLIM'
      EXPORTING
        kunnr          = ms_alt-kunnr
      EXCEPTIONS
        foreign_lock   = 1
        system_failure = 2
        OTHERS         = 3.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE lcx_pflege
        MESSAGE e001(zsd_kl) WITH sy-msgv1.     "gesperrt durch &
    ENDIF.
  ENDMETHOD.

  METHOD pruefen.
*   Limits ueber Freigabegrenze nur mit Zusatzberechtigung (Revision 2019)
    IF ms_neu-limit > gc_limit_freigabe.
      AUTHORITY-CHECK OBJECT 'ZSD_KLIM'
        ID 'ACTVT' FIELD '02'
        ID 'VKORG' FIELD ms_neu-vkorg.
      IF sy-subrc <> 0.
        RAISE EXCEPTION TYPE lcx_pflege
          MESSAGE e002(zsd_kl) WITH ms_neu-vkorg ms_neu-limit.
      ENDIF.
    ENDIF.
  ENDMETHOD.

  METHOD schreiben.
    DATA: lv_upd   TYPE c LENGTH 1,
          lv_objid TYPE cdobjectv.

    ms_neu-aenam = sy-uname.
    ms_neu-aedat = sy-datum.
    IF mv_neu = abap_true.
      INSERT zsd_kasslimit FROM ms_neu.
      lv_upd = 'I'.
    ELSE.
      UPDATE zsd_kasslimit FROM ms_neu.
      lv_upd = 'U'.
    ENDIF.

*   generierter Aenderungsbeleg-Baustein (SCDO ZKASSLIM)
    lv_objid = ms_neu-kunnr.
    CALL FUNCTION 'ZKASSLIM_WRITE_DOCUMENT' IN UPDATE TASK
      EXPORTING
        objectid          = lv_objid
        tcode             = sy-tcode
        utime             = sy-uzeit
        udate             = sy-datum
        username          = sy-uname
        n_zsd_kasslimit   = ms_neu
        o_zsd_kasslimit   = ms_alt
        upd_zsd_kasslimit = lv_upd.

    ms_alt = ms_neu.
    mv_neu = abap_false.
  ENDMETHOD.

ENDCLASS.
