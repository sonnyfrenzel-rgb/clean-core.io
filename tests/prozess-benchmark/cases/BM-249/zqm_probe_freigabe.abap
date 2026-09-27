*&---------------------------------------------------------------------*
*& Report ZQM_PROBE_FREIGABE
*&---------------------------------------------------------------------*
*& Massenfreigabe von Laborproben (BO ZQM_PROBE) nach Abschluss der
*& Messungen. Einplanung als Job ZQM_PROBE_FREIGABE_NACHT, 22:00.
*& 2020-02 TR: Umstellung von direktem UPDATE ZQM_PROBE auf BOPF-Aktion
*&---------------------------------------------------------------------*
REPORT zqm_probe_freigabe.

TABLES: zqm_probe.

SELECT-OPTIONS: s_werk  FOR zqm_probe-werks OBLIGATORY,
                s_datum FOR zqm_probe-probedatum.
PARAMETERS:     p_test  AS CHECKBOX DEFAULT 'X'.

DATA: go_svc_mngr TYPE REF TO /bobf/if_tra_service_manager,
      go_tra_mngr TYPE REF TO /bobf/if_tra_transaction_mgr,
      gt_sel      TYPE /bobf/t_frw_query_selparam,
      gt_key      TYPE /bobf/t_frw_key,
      go_message  TYPE REF TO /bobf/if_frw_message,
      gt_failed   TYPE /bobf/t_frw_key,
      go_change   TYPE REF TO /bobf/if_tra_change,
      gv_rejected TYPE abap_bool,
      gt_msg      TYPE /bobf/t_frw_message_k,
      gv_anz      TYPE i,
      gv_fehl     TYPE i,
      gv_text     TYPE string.

START-OF-SELECTION.
  go_svc_mngr = /bobf/cl_tra_serv_mgr_factory=>get_service_manager( zif_zqm_probe_c=>sc_bo_key ).
  go_tra_mngr = /bobf/cl_tra_trans_mgr_factory=>get_transaction_manager( ).

  gt_sel = VALUE #(
    FOR ls_w IN s_werk ( attribute_name = 'WERKS' sign = ls_w-sign option = ls_w-option
                         low = ls_w-low high = ls_w-high ) ).
  gt_sel = VALUE #( BASE gt_sel
    FOR ls_d IN s_datum ( attribute_name = 'PROBEDATUM' sign = ls_d-sign option = ls_d-option
                          low = ls_d-low high = ls_d-high ) ).
  APPEND VALUE #( attribute_name = 'STATUS' sign = 'I' option = 'EQ' low = 'G' ) TO gt_sel. "gemessen

  go_svc_mngr->query(
    EXPORTING
      iv_query_key            = zif_zqm_probe_c=>sc_query-root-select_by_elements
      it_selection_parameters = gt_sel
    IMPORTING
      et_key                  = gt_key ).

  IF gt_key IS INITIAL.
    WRITE: / 'Keine gemessenen Proben im Selektionszeitraum.'.
    RETURN.
  ENDIF.

  go_svc_mngr->do_action(
    EXPORTING
      iv_act_key           = zif_zqm_probe_c=>sc_action-root-freigeben
      it_key               = gt_key
    IMPORTING
      eo_change            = go_change
      eo_message           = go_message
      et_failed_key        = gt_failed ).

  IF go_message IS BOUND.
    go_message->get_messages( IMPORTING et_message = gt_msg ).
    LOOP AT gt_msg INTO DATA(gs_msg).
      gv_text = gs_msg-message->get_text( ).
      WRITE: / gv_text.
    ENDLOOP.
  ENDIF.

  gv_anz  = lines( gt_key ).
  gv_fehl = lines( gt_failed ).

  IF p_test = abap_true.
    go_tra_mngr->cleanup( ).
    WRITE: / 'Testlauf:', gv_anz, 'Proben geprueft,',
             gv_fehl, 'nicht freigebbar. Nichts gesichert.'.
    RETURN.
  ENDIF.

  go_tra_mngr->save(
    IMPORTING
      ev_rejected = gv_rejected
      eo_message  = go_message ).

  IF gv_rejected = abap_true.
    go_tra_mngr->cleanup( ).
    WRITE: / 'Sichern abgelehnt - keine Probe freigegeben.'.
  ELSE.
    gv_anz = gv_anz - gv_fehl.
    WRITE: / gv_anz, 'Proben freigegeben,', gv_fehl, 'abgelehnt.'.
  ENDIF.
