  METHOD kreditlimitset_get_entity.
*   Kreditlimit je Kunde und Kreditkontrollbereich fuer die Fiori-Kachel "Kundenkredit"
    DATA: ls_key    TYPE /iwbep/s_mgw_name_value_pair,
          lv_kunnr  TYPE kunnr,
          lv_kkber  TYPE kkber.

    READ TABLE it_key_tab INTO ls_key WITH KEY name = 'Kunnr'.
    lv_kunnr = |{ ls_key-value ALPHA = IN }|.
    READ TABLE it_key_tab INTO ls_key WITH KEY name = 'Kkber'.
    lv_kkber = ls_key-value.

    SELECT SINGLE kunnr kkber klimk skfor ssobl ctlpc
      FROM knkk
      INTO CORRESPONDING FIELDS OF er_entity
      WHERE kunnr = lv_kunnr
        AND kkber = lv_kkber.
    IF sy-subrc <> 0.
      RAISE EXCEPTION TYPE /iwbep/cx_mgw_busi_exception
        EXPORTING
          textid  = /iwbep/cx_mgw_busi_exception=>business_error
          message = |Kein Kreditlimit fuer Kunde { lv_kunnr } in { lv_kkber }|.
    ENDIF.

*   Ausschoepfung in Prozent (Obligo = Forderungen + Sonderobligo)
    IF er_entity-klimk > 0.
      er_entity-ausschoepfung = ( er_entity-skfor + er_entity-ssobl ) * 100 / er_entity-klimk.
    ENDIF.
  ENDMETHOD.
