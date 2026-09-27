*&---------------------------------------------------------------------*
*&  Include           MZPOS_KASSE_I01
*&---------------------------------------------------------------------*
*  Kassenschalter Filiale - Bon abschliessen (Dynpro 0100, PAI)
*  12.03.2011 KRM  Ersterstellung
*  07.11.2016 TWE  Pruefung Bargeld gegeben < Summe (Ticket 4711)
*----------------------------------------------------------------------*
MODULE user_command_0100 INPUT.

  CASE ok_code.
    WHEN 'BACK'.
      LEAVE TO SCREEN 0.
    WHEN 'BON'.
      CLEAR ok_code.
*     Kunde muss mindestens die Bonsumme bar geben
      IF gs_bon-gegeben < gs_bon-summe.
        MESSAGE e012(zpos) WITH gs_bon-summe.
      ENDIF.
      INSERT zpos_bon FROM gs_bon.
      CLEAR gs_bon.
*    WHEN 'STOR'.            "Storno jetzt ueber Transaktion ZPOS_STORNO
*      PERFORM bon_stornieren.
  ENDCASE.

ENDMODULE.                 " USER_COMMAND_0100  INPUT
