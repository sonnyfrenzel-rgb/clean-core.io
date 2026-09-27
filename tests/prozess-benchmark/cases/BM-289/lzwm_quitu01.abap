FUNCTION z_wm_ta_quittieren_dialog.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IV_LGNUM) TYPE  LGNUM
*"     VALUE(IV_TANUM) TYPE  TANUM
*"  EXPORTING
*"     VALUE(EV_QUITTIERT) TYPE  ABAP_BOOL
*"  EXCEPTIONS
*"      TA_GESPERRT
*"      NICHTS_OFFEN
*"----------------------------------------------------------------------

  gv_lgnum = iv_lgnum.
  gv_tanum = iv_tanum.
  CLEAR: gv_done, gv_changed, gt_pos.

* TA gegen parallele Quittierung (zweiter Packtisch, LT12) sperren
  CALL FUNCTION 'ENQUEUE_EZWM_TANUM'
    EXPORTING
      lgnum          = gv_lgnum
      tanum          = gv_tanum
      _scope         = '1'          "Sperre bleibt ueber COMMIT hinaus
    EXCEPTIONS
      foreign_lock   = 1
      system_failure = 2
      OTHERS         = 3.
  IF sy-subrc <> 0.
    RAISE ta_gesperrt.
  ENDIF.

  SELECT p~tapos p~matnr k~maktx p~vlpla p~vsola p~altme
    FROM ltap AS p
    LEFT OUTER JOIN makt AS k ON k~matnr = p~matnr
                             AND k~spras = sy-langu
    INTO CORRESPONDING FIELDS OF TABLE gt_pos
    WHERE p~lgnum = gv_lgnum
      AND p~tanum = gv_tanum
      AND p~pquit = space.
  IF gt_pos IS INITIAL.
    CALL FUNCTION 'DEQUEUE_EZWM_TANUM'
      EXPORTING
        lgnum = gv_lgnum
        tanum = gv_tanum.
    RAISE nichts_offen.
  ENDIF.

* Vorschlag Istmenge = Sollmenge macht seit 2018 das PBO (TC_POS_INIT)

  CALL SCREEN 0100 STARTING AT 5 3 ENDING AT 110 22.

  CALL FUNCTION 'DEQUEUE_EZWM_TANUM'
    EXPORTING
      lgnum = gv_lgnum
      tanum = gv_tanum.

  ev_quittiert = gv_done.

ENDFUNCTION.
