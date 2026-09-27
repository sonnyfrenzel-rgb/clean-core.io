*&---------------------------------------------------------------------*
*& Report  ZSD_KASSLIM_PFLEGE   (Transaktion ZKL1)
*&---------------------------------------------------------------------*
*& Pflege Kassenlimit je Kunde mit Sperre und Aenderungsbeleg.
*& Ersetzt die SM30-Pflege, weil Revision Aenderungsbelege verlangt.
*&---------------------------------------------------------------------*
*& 2016-10-04 DKO  Ersterstellung
*& 2019-06-17 DKO  Freigabegrenze + Berechtigung ZSD_KLIM
*& 2022-02-08 EXT  Umbau auf Klassen (Schablone lcl_pflege_base)
*&---------------------------------------------------------------------*
REPORT zsd_kasslim_pflege.

INCLUDE zsd_kasslim_pflege_top.
INCLUDE zsd_kasslim_pflege_c01.

*----------------------------------------------------------------------*
START-OF-SELECTION.
*----------------------------------------------------------------------*
  go_pflege = lcl_limit_pflege=>laden( p_kunnr ).
  TRY.
      go_pflege->sperren( ).
    CATCH lcx_pflege INTO gx_err.
      MESSAGE gx_err TYPE 'S' DISPLAY LIKE 'E'.
      RETURN.
  ENDTRY.

  zsd_kasslimit = go_pflege->ms_neu.
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  STATUS_0100  OUTPUT
*&---------------------------------------------------------------------*
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'PFLEGE'.
  SET TITLEBAR 'ZKL' WITH p_kunnr.
ENDMODULE.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  CASE ok_code.
    WHEN 'SAVE'.
      CLEAR ok_code.
      go_pflege->ms_neu = zsd_kasslimit.
      TRY.
          go_pflege->sichern( ).
          MESSAGE s010(zsd_kl) WITH p_kunnr.      "Limit gesichert
        CATCH lcx_pflege INTO gx_err.
          MESSAGE gx_err TYPE 'E'.
      ENDTRY.

    WHEN 'BACK' OR 'EXIT' OR 'CANC'.
      CALL FUNCTION 'DEQUEUE_EZSD_KASSLIM'
        EXPORTING
          kunnr = p_kunnr.
      LEAVE TO SCREEN 0.

*   WHEN 'DELE'.    "Loeschen nur per SE16N durch Fachbereich
  ENDCASE.

ENDMODULE.
