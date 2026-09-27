*&---------------------------------------------------------------------*
*& Include ZMM_AUTO_PO_F01
*&---------------------------------------------------------------------*
FORM select_requisitions.
* freigegeben (FRGKZ 2 oder ohne Strategie), nicht bestellt, nicht geloescht,
* nicht bereits als fehlerhaft markiert
  SELECT banfn bnfpo matnr werks lgort menge meins lfdat ekgrp
    FROM eban
    INTO TABLE gt_eban
    WHERE werks IN s_werks
      AND ekgrp IN s_ekgrp
      AND matkl IN s_matkl
      AND lfdat IN s_lfdat
      AND frgkz IN (' ', '2')
      AND statu = 'N'
      AND loekz = space
      AND ebeln = space
      AND zzapo_err = space
    ORDER BY werks matnr.
ENDFORM.

FORM mark_error USING is_eban TYPE ty_eban
                      iv_text TYPE csequence.
* Kundenfelder in EBAN (Append ZAEBAN_APO) - kein erneuter Versuch im Folgelauf
  UPDATE eban SET zzapo_err = 'X'
                  zzapo_msg = iv_text
    WHERE banfn = is_eban-banfn
      AND bnfpo = is_eban-bnfpo.
ENDFORM.

FORM write_protocol.
  SELECT ebeln, lifnr, anzpo FROM zmm_autopo_log
    WHERE runid = @gv_runid
    INTO TABLE @DATA(lt_log).
  LOOP AT lt_log INTO DATA(ls_log).
    WRITE: / ls_log-ebeln, ls_log-lifnr, ls_log-anzpo.
  ENDLOOP.
  IF p_test = abap_true.
    WRITE / 'Testlauf - keine Bestellungen angelegt'(002).
  ENDIF.
ENDFORM.
