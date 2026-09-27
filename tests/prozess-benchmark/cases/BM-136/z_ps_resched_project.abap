FUNCTION z_ps_resched_project.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:  (RFC-fähig, Funktionsgruppe ZPS_RESCHED)
*"  IMPORTING
*"     VALUE(IV_PSPNR) TYPE  PS_INTNR
*"     VALUE(IV_TEST) TYPE  XFELD DEFAULT 'X'
*"  TABLES
*"      ET_RESULT STRUCTURE  ZPS_S_RESCHED_RES
*"----------------------------------------------------------------------
* Terminiert alle Netzpläne eines Projekts neu und ermittelt den
* Verzug des Netzplanendes gegen den eingefrorenen Basistermin.
* Änderungen:
* 2013 PSC  RFC-fähig für Parallelisierung
* 2016 PSC  Notfall-Lauf ohne Statusprüfung (Ticket 4711)
* 2019 MBR  Verzug gegen ZPS_MLST_BASIS statt Meilenstein-Plandatum
* 2021 MBR  Testlauf über Rollback nach PRECOMMIT
*----------------------------------------------------------------------
  DATA: lt_ret    TYPE STANDARD TABLE OF bapiret2,
        lv_status TYPE zps_resched_status.

  SELECT SINGLE pspid FROM proj INTO @DATA(lv_pspid)
    WHERE pspnr = @iv_pspnr.

* Netzpläne (Auftragstyp 20) des Projekts
  SELECT a~aufnr, a~objnr, k~gltrp
    FROM aufk AS a
    INNER JOIN afko AS k ON k~aufnr = a~aufnr
    WHERE k~pronr = @iv_pspnr
      AND a~autyp = '20'
    INTO TABLE @DATA(lt_netz).
  IF lt_netz IS INITIAL.
    APPEND VALUE #( pspid = lv_pspid status = 'L'
                    meldung = 'Keine Netzpläne' ) TO et_result.
    RETURN.
  ENDIF.

  LOOP AT lt_netz INTO DATA(ls_netz).
    CLEAR lt_ret.

*   technisch abgeschlossene Netze nicht anfassen
*   (Notfall-Lauf mit Benutzer PSC_BATCH ohne Statusprüfung, 2016)
    IF sy-uname <> 'PSC_BATCH'.
      CALL FUNCTION 'STATUS_CHECK'
        EXPORTING
          objnr             = ls_netz-objnr
          status            = 'I0045'
        EXCEPTIONS
          object_not_found  = 1
          status_not_active = 2
          OTHERS            = 3.
      IF sy-subrc = 0.
        APPEND VALUE #( pspid = lv_pspid aufnr = ls_netz-aufnr status = 'S'
                        meldung = 'Technisch abgeschlossen' ) TO et_result.
        CONTINUE.
      ENDIF.
    ENDIF.

    CALL FUNCTION 'BAPI_PS_INITIALIZATION'.
    CALL FUNCTION 'BAPI_BUS2002_SCHEDULE'
      EXPORTING
        i_number    = ls_netz-aufnr
      TABLES
        et_return   = lt_ret.

    IF line_exists( lt_ret[ type = 'E' ] ) OR line_exists( lt_ret[ type = 'A' ] ).
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      APPEND VALUE #( pspid = lv_pspid aufnr = ls_netz-aufnr status = 'F'
                      meldung = lt_ret[ 1 ]-message ) TO et_result.
      CONTINUE.
    ENDIF.

    CALL FUNCTION 'BAPI_PS_PRECOMMIT'
      TABLES
        et_return = lt_ret.

    IF iv_test = abap_true.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      lv_status = 'T'.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
      lv_status = 'O'.
    ENDIF.

*   neues Netzplanende gegen eingefrorenen Basistermin
    SELECT SINGLE gltrp FROM afko INTO @DATA(lv_neu)
      WHERE aufnr = @ls_netz-aufnr.
    SELECT SINGLE basis_ende FROM zps_mlst_basis INTO @DATA(lv_basis)
      WHERE aufnr = @ls_netz-aufnr.

    APPEND VALUE #( pspid       = lv_pspid
                    aufnr       = ls_netz-aufnr
                    status      = lv_status
                    verzug_tage = COND #( WHEN sy-subrc = 0 AND lv_neu > lv_basis
                                          THEN lv_neu - lv_basis
                                          ELSE 0 ) ) TO et_result.
  ENDLOOP.
ENDFUNCTION.
