FUNCTION z_yard_stellplatz_reservieren.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_YARD) TYPE  ZYARD_ID
*"     VALUE(IV_PLATZ) TYPE  ZYARD_PLATZ
*"     VALUE(IV_CONTAINER) TYPE  ZYARD_CONTAINER
*"     VALUE(IV_STUNDEN) TYPE  I DEFAULT 24
*"  EXCEPTIONS
*"      PLATZ_GESPERRT
*"      PLATZ_BELEGT
*"      SPERRFEHLER
*"----------------------------------------------------------------------
* Containerterminal: Stellplatz für einen angemeldeten Container
* reservieren. Aufruf aus Gate-In-Transaktion ZYARD_GATE (Dialog).
* Sperrversuch bis zu 5 x mit 2 Sekunden Pause (Gate-Rechner parallel).
  DATA: ls_platz TYPE zyard_platz,
        lv_ts    TYPE timestamp.

  DO 5 TIMES.
    CALL FUNCTION 'ENQUEUE_EZYARD_PLATZ'
      EXPORTING
        mode_zyard_platz = 'E'
        yard             = iv_yard
        platz            = iv_platz
        _wait            = ' '
      EXCEPTIONS
        foreign_lock     = 1
        system_failure   = 2
        OTHERS           = 3.
    CASE sy-subrc.
      WHEN 0.
        EXIT.
      WHEN 1.
        WAIT UP TO 2 SECONDS.
      WHEN OTHERS.
        MESSAGE e100(zyard) RAISING sperrfehler.
    ENDCASE.
  ENDDO.
  IF sy-subrc <> 0.
    MESSAGE e101(zyard) WITH iv_platz RAISING platz_gesperrt.
  ENDIF.

  SELECT SINGLE * FROM zyard_platz INTO ls_platz
    WHERE yard  = iv_yard
      AND platz = iv_platz.
  IF sy-subrc <> 0 OR ls_platz-status <> 'F'.
    CALL FUNCTION 'DEQUEUE_EZYARD_PLATZ'
      EXPORTING
        yard  = iv_yard
        platz = iv_platz.
    MESSAGE e102(zyard) WITH iv_platz RAISING platz_belegt.
  ENDIF.

  GET TIME STAMP FIELD lv_ts.
  ls_platz-status    = 'R'.
  ls_platz-container = iv_container.
  ls_platz-res_bis   = cl_abap_tstmp=>add( tstmp = lv_ts secs = iv_stunden * 3600 ).
  ls_platz-aenam     = sy-uname.
  UPDATE zyard_platz FROM ls_platz.

  CALL FUNCTION 'DEQUEUE_EZYARD_PLATZ'
    EXPORTING
      yard  = iv_yard
      platz = iv_platz.
ENDFUNCTION.
