*&---------------------------------------------------------------------*
*& Report  ZPP_TERMINAL   (Transaktion ZPPT, Startbild der Terminals)
*&---------------------------------------------------------------------*
*& Werkerterminal Halle 3: Anmelden, Vorgang starten und beenden.
*&---------------------------------------------------------------------*
*& 2015-05-04 KSC  Ersterstellung
*& 2021-03-15 EXT  Schritte als Klassen, Fabrik nach Funktionscode
*&---------------------------------------------------------------------*
REPORT zpp_terminal.

INCLUDE zpp_terminal_top.
INCLUDE zpp_terminal_c01.
INCLUDE zpp_terminal_c02.

START-OF-SELECTION.
  gs_term-terminal = p_term.
  CALL SCREEN 0100.

*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_0100  INPUT
*&---------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  DATA lo_schritt TYPE REF TO lif_schritt.
  DATA lx_term    TYPE REF TO lcx_terminal.

  CASE ok_code.
    WHEN 'ABME'.
      CLEAR: gs_term-pernr, gs_term-ausweis, gs_term-aufnr, gs_term-vornr.
      LEAVE TO SCREEN 0100.
    WHEN 'BACK'.
      LEAVE PROGRAM.
  ENDCASE.

  TRY.
      lo_schritt = lcl_schritt_fabrik=>fuer_okcode( ok_code ).
      lo_schritt->ausfuehren( CHANGING cs_term = gs_term ).
      IF lo_schritt IS INSTANCE OF lcl_anmelden.
        MESSAGE s300(zpp_t) WITH gs_term-pernr.        "Willkommen &
      ELSE.
        MESSAGE s301(zpp_t) WITH gs_term-aufnr gs_term-vornr.
      ENDIF.
    CATCH lcx_terminal INTO lx_term.
      MESSAGE lx_term TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.
  CLEAR ok_code.

ENDMODULE.
