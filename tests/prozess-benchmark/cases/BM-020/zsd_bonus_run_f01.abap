*&---------------------------------------------------------------------*
*& Include ZSD_BONUS_RUN_F01 - Unterprogramme
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  UMSAETZE_LESEN
*&---------------------------------------------------------------------*
*       Nettoumsatz je Regulierer und Belegwährung im Geschäftsjahr:
*       Rechnungen F2/ZF2, nicht storniert, ohne Bonuspositionen
*----------------------------------------------------------------------*
FORM umsaetze_lesen.
  DATA: ls_ums TYPE ty_umsatz,
        lv_von TYPE d,
        lv_bis TYPE d.

  lv_von = |{ p_gjahr }0101|.
  lv_bis = |{ p_gjahr }1231|.

* bis 2016 über Infostruktur S003 - dort fehlten die ZF2-Rechnungen
*  SELECT kunnr SUM( umsatz ) FROM s003 INTO TABLE gt_umsatz
*    WHERE vkorg = p_vkorg AND spmon BETWEEN ... GROUP BY kunnr.

  EXEC SQL.
    OPEN c_ums FOR
      SELECT k.kunrg, k.waerk, SUM( p.netwr )
        FROM vbrk k
        INNER JOIN vbrp p
                ON p.mandt = k.mandt
               AND p.vbeln = k.vbeln
       WHERE k.mandt = :sy-mandt
         AND k.vkorg = :p_vkorg
         AND k.vtweg = :p_vtweg
         AND k.fkdat BETWEEN :lv_von AND :lv_bis
         AND k.fkart IN ( 'F2', 'ZF2' )
         AND k.fksto = ' '
         AND p.pstyv <> 'ZBON'
       GROUP BY k.kunrg, k.waerk
  ENDEXEC.

  DO.
    EXEC SQL.
      FETCH NEXT c_ums INTO :ls_ums-kunrg, :ls_ums-waerk, :ls_ums-umsatz
    ENDEXEC.
    IF sy-subrc <> 0.
      EXIT.
    ENDIF.
    IF ls_ums-kunrg IN s_kunrg.
      APPEND ls_ums TO gt_umsatz.
    ENDIF.
  ENDDO.

  EXEC SQL.
    CLOSE c_ums
  ENDEXEC.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  KUNDE_ABRECHNEN
*&---------------------------------------------------------------------*
FORM kunde_abrechnen USING is_ums TYPE ty_umsatz.
  DATA: ls_res   TYPE zcl_sd_bonus_calc=>ty_result,
        ls_out   TYPE ty_out,
        lv_vbeln TYPE vbeln_va.

  ls_out = CORRESPONDING #( is_ums ).

  ls_res = go_calc->calculate( iv_kunnr  = is_ums-kunrg
                               iv_umsatz = is_ums-umsatz
                               iv_waerk  = is_ums-waerk ).
  ls_out-prozent = ls_res-prozent.
  ls_out-bonus   = ls_res-bonus.
  ls_out-text    = ls_res-text.

  IF ls_res-bonus <= 0.
    ls_out-status = 'I'.
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  IF p_test = abap_true.
    ls_out-status = 'T'.
    ls_out-text   = 'Testlauf: Gutschrift würde angelegt'(t01).
    APPEND ls_out TO gt_out.
    RETURN.
  ENDIF.

  PERFORM gutschrift_anlegen USING    is_ums ls_res
                             CHANGING lv_vbeln ls_out.
  APPEND ls_out TO gt_out.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  GUTSCHRIFT_ANLEGEN
*&---------------------------------------------------------------------*
*       Gutschriftsanforderung ZG2 mit Bonusposition und Kondition ZBON;
*       der Bonusbeleg wird mit derselben LUW verbucht
*----------------------------------------------------------------------*
FORM gutschrift_anlegen USING    is_ums   TYPE ty_umsatz
                                 is_res   TYPE zcl_sd_bonus_calc=>ty_result
                        CHANGING cv_vbeln TYPE vbeln_va
                                 cs_out   TYPE ty_out.
  DATA: ls_hdr  TYPE bapisdhd1,
        lt_itm  TYPE STANDARD TABLE OF bapisditm,
        lt_par  TYPE STANDARD TABLE OF bapiparnr,
        lt_cond TYPE STANDARD TABLE OF bapicond,
        lt_ret  TYPE STANDARD TABLE OF bapiret2,
        ls_ret  TYPE bapiret2,
        ls_bel  TYPE zsd_bonus_beleg.

  ls_hdr = VALUE #( doc_type   = gc_auart_bonus
                    sales_org  = p_vkorg
                    distr_chan = p_vtweg
                    division   = p_spart
                    ord_reason = gc_augru_bonus
                    purch_no_c = |BONUS { p_gjahr }| ).
  lt_par  = VALUE #( ( partn_role = 'AG' partn_numb = is_ums-kunrg ) ).
  lt_itm  = VALUE #( ( itm_number = '000010'
                       material   = gc_matnr_bonus
                       target_qty = 1 ) ).
  lt_cond = VALUE #( ( itm_number = '000010'
                       cond_type  = gc_kschl_bonus
                       cond_value = is_res-bonus
                       currency   = is_ums-waerk ) ).

  ls_bel = VALUE #( kunnr   = is_ums-kunrg
                    vkorg   = p_vkorg
                    gjahr   = p_gjahr
                    umsatz  = is_ums-umsatz
                    waerk   = is_ums-waerk
                    prozent = is_res-prozent
                    bonus   = is_res-bonus
                    vbeln   = cv_vbeln
                    ernam   = sy-uname
                    erdat   = sy-datum ).
  CALL FUNCTION 'Z_SD_BONUS_POST_UPD' IN UPDATE TASK
    EXPORTING
      is_beleg = ls_bel.

  CALL FUNCTION 'BAPI_SALESORDER_CREATEFROMDAT2'
    EXPORTING
      order_header_in     = ls_hdr
    IMPORTING
      salesdocument       = cv_vbeln
    TABLES
      return              = lt_ret
      order_items_in      = lt_itm
      order_partners      = lt_par
      order_conditions_in = lt_cond.

  IF cv_vbeln IS INITIAL.
    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
    READ TABLE lt_ret INTO ls_ret WITH KEY type = 'E'.
    cs_out-status = 'E'.
    cs_out-text   = ls_ret-message.
  ELSE.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.
    cs_out-status = 'S'.
    cs_out-vbeln  = cv_vbeln.
    cs_out-text   = 'Gutschriftsanforderung angelegt'(s01).
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  ERGEBNIS_ANZEIGEN
*&---------------------------------------------------------------------*
FORM ergebnis_anzeigen.
  DATA: lt_fcat TYPE slis_t_fieldcat_alv,
        lt_sort TYPE slis_t_sortinfo_alv,
        ls_layo TYPE slis_layout_alv.

  lt_fcat = VALUE #( ( fieldname = 'KUNRG'   ref_tabname = 'VBRK' )
                     ( fieldname = 'WAERK'   ref_tabname = 'VBRK' )
                     ( fieldname = 'UMSATZ'  seltext_m = 'Umsatz'
                       cfieldname = 'WAERK' do_sum = abap_true )
                     ( fieldname = 'PROZENT' seltext_m = 'Bonus %' )
                     ( fieldname = 'BONUS'   seltext_m = 'Bonus'
                       cfieldname = 'WAERK' do_sum = abap_true )
                     ( fieldname = 'VBELN'   ref_tabname = 'VBAK' )
                     ( fieldname = 'STATUS'  seltext_m = 'Status' )
                     ( fieldname = 'TEXT'    seltext_m = 'Meldung' outputlen = 50 ) ).
  lt_sort = VALUE #( ( fieldname = 'WAERK' up = abap_true subtot = abap_true ) ).
  ls_layo-colwidth_optimize = abap_true.
  ls_layo-zebra             = abap_true.

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program = sy-repid
      is_layout          = ls_layo
      it_fieldcat        = lt_fcat
      it_sort            = lt_sort
      i_grid_title       = CONV lvc_title( |Jahresbonus { p_gjahr } VKORG { p_vkorg }| )
    TABLES
      t_outtab           = gt_out
    EXCEPTIONS
      OTHERS             = 1.
ENDFORM.
