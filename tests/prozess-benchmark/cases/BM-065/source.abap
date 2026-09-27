*----------------------------------------------------------------------*
***INCLUDE MZPP_WERKER_RM_I01.
*----------------------------------------------------------------------*
* Dynpro 0200, Ablauflogik:
*   CHAIN. FIELD zpp_s_rm-vornr. FIELD zpp_s_rm-gutmenge.
*     MODULE check_gutmenge ON CHAIN-REQUEST. ENDCHAIN.
*----------------------------------------------------------------------*
MODULE check_gutmenge INPUT.
* Gutmenge darf die offene Vorgangsmenge nicht ueberschreiten
  DATA: lv_mgvrg TYPE afvv-mgvrg,
        lv_lmnga TYPE afvv-lmnga,
        lv_offen TYPE afvv-mgvrg.

  SELECT SINGLE v~mgvrg v~lmnga
    INTO (lv_mgvrg, lv_lmnga)
    FROM afvc AS c INNER JOIN afvv AS v
      ON v~aufpl = c~aufpl AND v~aplzl = c~aplzl
    WHERE c~aufpl = gv_aufpl
      AND c~vornr = zpp_s_rm-vornr.
  IF sy-subrc <> 0.
    MESSAGE e001(zpp_rm) WITH zpp_s_rm-vornr.
  ENDIF.

  lv_offen = lv_mgvrg - lv_lmnga.
  IF zpp_s_rm-gutmenge > lv_offen.
    MESSAGE e002(zpp_rm) WITH lv_offen.
  ENDIF.
ENDMODULE.
