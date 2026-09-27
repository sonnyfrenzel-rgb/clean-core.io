*----------------------------------------------------------------------*
***INCLUDE MZPM_KALIB_I01.
*----------------------------------------------------------------------*
* Kalibrierung Prüfmittel - PAI Dynpro 0100
* Bildfelder: GS_KAL-EQUNR, -SOLLWERT, -ISTWERT, -TOLERANZ, -ERGEBNIS
* 2013-05 AKU  Erstellung (Messmittelüberwachung ISO 9001)
* 2018-02 AKU  n.i.O.: Equipment sperren + M2-Meldung
*----------------------------------------------------------------------*
MODULE user_command_0100 INPUT.
  DATA: lv_abw     TYPE p LENGTH 8 DECIMALS 3,
        lv_objnr   TYPE j_objnr,
        ls_notif   TYPE bapi2080_nothdri,
        ls_hdr_exp TYPE bapi2080_nothdre,
        lt_ret     TYPE STANDARD TABLE OF bapiret2.

  CASE ok_code.
    WHEN 'PRUEF'.
      IF gs_kal-sollwert = 0.
        MESSAGE e401(zpm).
      ENDIF.
      lv_abw = abs( gs_kal-istwert - gs_kal-sollwert ) * 100
               / gs_kal-sollwert.
      gs_kal-ergebnis = COND #( WHEN lv_abw <= gs_kal-toleranz THEN 'IO'
                                ELSE 'NIO' ).

    WHEN 'SAVE'.
      IF gs_kal-ergebnis IS INITIAL.
        MESSAGE e402(zpm).
      ENDIF.
      gs_kal-datum = sy-datum.
      gs_kal-pruefer = sy-uname.
      INSERT zpm_kalib_erg FROM gs_kal.

      IF gs_kal-ergebnis = 'NIO'.
        CONCATENATE 'IE' gs_kal-equnr INTO lv_objnr.
        CALL FUNCTION 'STATUS_CHANGE_EXTERN'
          EXPORTING
            objnr       = lv_objnr
            user_status = 'E0003'
          EXCEPTIONS
            OTHERS      = 1.
        ls_notif-equipment  = gs_kal-equnr.
        ls_notif-short_text = 'Kalibrierung nicht in Ordnung'.
        CALL FUNCTION 'BAPI_ALM_NOTIF_CREATE'
          EXPORTING
            notif_type         = 'M2'
            notifheader        = ls_notif
          IMPORTING
            notifheader_export = ls_hdr_exp
          TABLES
            return             = lt_ret.
        CALL FUNCTION 'BAPI_ALM_NOTIF_SAVE'
          EXPORTING
            number = ls_hdr_exp-notif_no
          TABLES
            return = lt_ret.
      ENDIF.
      COMMIT WORK.
      MESSAGE s403(zpm) WITH gs_kal-equnr gs_kal-ergebnis.
      CLEAR gs_kal.
      LEAVE TO SCREEN 0100.

    WHEN OTHERS.
*     Enter: nichts
  ENDCASE.
  CLEAR ok_code.
ENDMODULE.
