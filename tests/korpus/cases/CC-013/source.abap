PROGRAM zcc_ref_013.
DATA ok_code TYPE c LENGTH 20.
DATA gv_amount TYPE p LENGTH 9 DECIMALS 2.
DATA gv_route TYPE c LENGTH 20.
MODULE status_0100 OUTPUT.
  SET PF-STATUS 'MAIN'.
ENDMODULE.
MODULE user_command_0100 INPUT.
  CASE ok_code.
    WHEN 'CHECK'.
      IF gv_amount > 10000.
        gv_route = 'MANAGER_ROUTE'.
      ELSE.
        gv_route = 'AUTO_ROUTE'.
      ENDIF.
    WHEN 'BACK'.
      LEAVE TO SCREEN 0.
  ENDCASE.
  CLEAR ok_code.
ENDMODULE.
