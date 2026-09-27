*&---------------------------------------------------------------------*
*&  Include           MZWM_RF_UMLAGI01
*&---------------------------------------------------------------------*
*  RF-Umlagerung Lagerplatz -> Lagerplatz (Handscanner, Dynpro 0300)
*  PAI-Module. Ablauflogik 0300 (zur Info):
*    FIELD gv_vonplatz MODULE check_vonplatz ON REQUEST.
*    MODULE user_command_0300.
*----------------------------------------------------------------------*
* 2009-04-02 HBE  Ersterstellung Lager 120
* 2013-10-21 HBE  Warnung bei Menge > Quantbestand (Inventurdifferenzen)
*----------------------------------------------------------------------*

*----------------------------------------------------------------------*
*  MODULE check_vonplatz INPUT
*----------------------------------------------------------------------*
MODULE check_vonplatz INPUT.

  SELECT SINGLE lgnum lgtyp lgpla skzua
    FROM lagp
    INTO CORRESPONDING FIELDS OF gs_lagp
    WHERE lgnum = gv_lgnum
      AND lgpla = gv_vonplatz.
  IF sy-subrc <> 0 OR gs_lagp-skzua = 'X'.
*   Lagerplatz & unbekannt oder fuer Auslagerung gesperrt
    MESSAGE e101(zwm_rf) WITH gv_vonplatz.
  ENDIF.

ENDMODULE.                 " CHECK_VONPLATZ  INPUT

*----------------------------------------------------------------------*
*  MODULE user_command_0300 INPUT
*----------------------------------------------------------------------*
MODULE user_command_0300 INPUT.

  gv_ok = ok_code.
  CLEAR ok_code.

  CASE gv_ok.
    WHEN 'F3' OR 'BACK'.
      LEAVE TO SCREEN 0100.

    WHEN 'ENTR' OR 'SAVE'.
*     Nach-Platz ist Mussfeld auf 0300 (Dynpro-Attribut)
      SELECT SUM( verme ) FROM lqua INTO gv_bestand
        WHERE lgnum = gv_lgnum
          AND lgpla = gv_vonplatz
          AND matnr = gv_matnr.
      IF gv_menge > gv_bestand.
*       nur Warnung - Staplerfahrer darf mit Enter weiter (Inventurdiff.)
        MESSAGE w104(zwm_rf) WITH gv_bestand gv_meins.
      ENDIF.

      CALL FUNCTION 'L_TO_CREATE_SINGLE'
        EXPORTING
          i_lgnum               = gv_lgnum
          i_bwlvs               = '999'
          i_matnr               = gv_matnr
          i_werks               = gv_werks
          i_anfme               = gv_menge
          i_altme               = gv_meins
          i_squit               = 'X'
          i_vltyp               = gs_lagp-lgtyp
          i_vlpla               = gv_vonplatz
          i_nltyp               = gv_nachtyp
          i_nlpla               = gv_nachplatz
          i_commit_work         = 'X'
        IMPORTING
          e_tanum               = gv_tanum
        EXCEPTIONS
          no_to_created         = 1
          bwlvs_wrong           = 2
          manual_to_forbidden   = 3
          material_not_found    = 4
          OTHERS                = 99.
      IF sy-subrc <> 0.
        MESSAGE ID sy-msgid TYPE 'E' NUMBER sy-msgno
                WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
      ENDIF.

      MESSAGE s105(zwm_rf) WITH gv_tanum.     "TA & quittiert angelegt
      CLEAR: gv_vonplatz, gv_nachplatz, gv_menge, gs_lagp.
      LEAVE TO SCREEN 0300.

*   WHEN 'PRNT'.                              "Etikett - nie produktiv
*     PERFORM etikett_drucken.
    WHEN OTHERS.
  ENDCASE.

ENDMODULE.                 " USER_COMMAND_0300  INPUT
