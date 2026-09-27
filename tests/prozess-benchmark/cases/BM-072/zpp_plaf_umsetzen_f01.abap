*&---------------------------------------------------------------------*
*& Include ZPP_PLAF_UMSETZEN_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& Planauftraege selektieren
*&---------------------------------------------------------------------*
FORM lese_planauftraege.
  SELECT plnum matnr plwrk gsmng psttr auffx
    FROM plaf
    INTO TABLE gt_plaf
    WHERE plwrk =  p_werks
      AND dispo IN s_dispo
      AND matnr IN s_matnr
      AND psttr <= p_bis
      AND paart =  'LA'
      AND beskz =  'E'.

  IF p_fix = abap_true.
    DELETE gt_plaf WHERE auffx = space.
  ENDIF.
  SORT gt_plaf BY psttr plnum.
ENDFORM.

*&---------------------------------------------------------------------*
*& Material im Werk: vorhanden, nicht gesperrt
*&---------------------------------------------------------------------*
FORM pruefe_material USING    is_plaf TYPE ty_plaf
                     CHANGING cv_ok   TYPE abap_bool.
  DATA lv_mmsta TYPE mmsta.

  cv_ok = abap_false.
  SELECT SINGLE mmsta FROM marc INTO lv_mmsta
    WHERE matnr = is_plaf-matnr
      AND werks = is_plaf-plwrk.
* Z1 = Fertigung gesperrt, Z2 = Auslauf (Umsetzen erlaubt)
  IF lv_mmsta = 'Z1'.
    APPEND VALUE #( plnum = is_plaf-plnum matnr = is_plaf-matnr ampel = gc_rot
                    text = 'Material fuer Fertigung gesperrt (Z1)' ) TO gt_log.
    RETURN.
  ENDIF.

  cv_ok = abap_true.
ENDFORM.

*&---------------------------------------------------------------------*
*& Komponenten: Sekundaerbedarf gegen frei verwendbaren Lagerbestand
*& (bewusst ohne ATP - Vorgabe Werkleitung 2016)
*&---------------------------------------------------------------------*
FORM pruefe_komponenten USING    is_plaf TYPE ty_plaf
                        CHANGING cv_ok   TYPE abap_bool.
  TYPES: BEGIN OF lty_resb,
           matnr TYPE matnr,
           werks TYPE werks_d,
           bdmng TYPE bdmng,
         END OF lty_resb.
  DATA: lt_resb    TYPE STANDARD TABLE OF lty_resb,
        ls_resb    TYPE lty_resb,
        lv_bestand TYPE labst.

  cv_ok = abap_true.

  SELECT matnr werks bdmng FROM resb
    INTO TABLE lt_resb
    WHERE plnum = is_plaf-plnum
      AND xloek = space.

  LOOP AT lt_resb INTO ls_resb.
    CLEAR lv_bestand.
    SELECT SUM( labst ) FROM mard INTO lv_bestand
      WHERE matnr = ls_resb-matnr
        AND werks = ls_resb-werks.
    IF lv_bestand < ls_resb-bdmng.
      cv_ok = abap_false.
      APPEND VALUE #( plnum = is_plaf-plnum matnr = is_plaf-matnr ampel = gc_gelb
                      text = |Fehlteil { ls_resb-matnr }| ) TO gt_log.
      EXIT.
    ENDIF.
  ENDLOOP.
ENDFORM.

*&---------------------------------------------------------------------*
*& Umsetzen (und ggf. freigeben)
*&---------------------------------------------------------------------*
FORM umsetzen USING is_plaf TYPE ty_plaf.
  DATA: lv_aufnr  TYPE aufnr,
        ls_return TYPE bapiret2,
        lt_orders TYPE STANDARD TABLE OF bapi_order_key,
        lt_detail TYPE STANDARD TABLE OF bapi_order_return,
        ls_ret_fr TYPE bapiret2.

  CALL FUNCTION 'BAPI_PRODORD_CREATE_FROM_PLORD'
    EXPORTING
      planned_order    = is_plaf-plnum
      order_type       = p_auart
    IMPORTING
      production_order = lv_aufnr
      return           = ls_return.

  IF ls_return-type CA 'EAX' OR lv_aufnr IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    APPEND VALUE #( plnum = is_plaf-plnum matnr = is_plaf-matnr ampel = gc_rot
                    text = ls_return-message ) TO gt_log.
    RETURN.
  ENDIF.

  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
    EXPORTING
      wait = abap_true.
  APPEND VALUE #( plnum = is_plaf-plnum matnr = is_plaf-matnr aufnr = lv_aufnr
                  ampel = gc_gruen text = 'umgesetzt' ) TO gt_log.

  IF p_frei = abap_true.
    APPEND VALUE #( order_number = lv_aufnr ) TO lt_orders.
    CALL FUNCTION 'BAPI_PRODORD_RELEASE'
      IMPORTING
        return        = ls_ret_fr
      TABLES
        orders        = lt_orders
        detail_return = lt_detail.
    IF ls_ret_fr-type CA 'EA'.
      CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
      APPEND VALUE #( plnum = is_plaf-plnum matnr = is_plaf-matnr aufnr = lv_aufnr
                      ampel = gc_gelb text = 'umgesetzt, Freigabe fehlgeschlagen' ) TO gt_log.
    ELSE.
      CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
        EXPORTING
          wait = abap_true.
    ENDIF.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Protokoll als ALV
*&---------------------------------------------------------------------*
FORM ausgabe.
  DATA: lt_fcat   TYPE slis_t_fieldcat_alv,
        ls_layout TYPE slis_layout_alv.

  lt_fcat = VALUE #( ( fieldname = 'PLNUM' seltext_m = 'Planauftrag' )
                     ( fieldname = 'MATNR' seltext_m = 'Material' )
                     ( fieldname = 'AUFNR' seltext_m = 'Auftrag' )
                     ( fieldname = 'TEXT'  seltext_m = 'Ergebnis' outputlen = 60 ) ).
  ls_layout-lights_fieldname  = 'AMPEL'.
  ls_layout-colwidth_optimize = abap_true.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      is_layout   = ls_layout
      it_fieldcat = lt_fcat
    TABLES
      t_outtab    = gt_log
    EXCEPTIONS
      OTHERS      = 1.
ENDFORM.
