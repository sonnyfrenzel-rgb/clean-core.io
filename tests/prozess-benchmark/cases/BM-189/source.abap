FUNCTION z_bw_ps_meilenstein_get.
*"----------------------------------------------------------------------
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(I_REQUNR) TYPE  SRSC_S_IF_SIMPLE-REQUNR
*"     VALUE(I_DSOURCE) TYPE  SRSC_S_IF_SIMPLE-DSOURCE OPTIONAL
*"     VALUE(I_MAXSIZE) TYPE  SRSC_S_IF_SIMPLE-MAXSIZE OPTIONAL
*"     VALUE(I_INITFLAG) TYPE  SRSC_S_IF_SIMPLE-INITFLAG OPTIONAL
*"     VALUE(I_READ_ONLY) TYPE  SRSC_S_IF_SIMPLE-READONLY OPTIONAL
*"     VALUE(I_REMOTE_CALL) TYPE  SBIWA_FLAG DEFAULT SBIWA_C_FLAG_OFF
*"  TABLES
*"      I_T_SELECT TYPE  SRSC_S_IF_SIMPLE-T_SELECT OPTIONAL
*"      I_T_FIELDS TYPE  SRSC_S_IF_SIMPLE-T_FIELDS OPTIONAL
*"      E_T_DATA STRUCTURE  ZBW_S_PS_MEILENSTEIN OPTIONAL
*"  EXCEPTIONS
*"      NO_MORE_DATA
*"      ERROR_PASSED_TO_MESS_HANDLER
*"----------------------------------------------------------------------
* Generische DataSource ZPS_MEILENSTEIN (Projektmeilensteine mit
* Terminverzug), Pseudo-Delta über Änderungsdatum AEDAT
* Kopie von RSAX_BIW_GET_DATA_SIMPLE, 2016 BW-Team
  STATICS: s_s_if              TYPE srsc_s_if_simple,
           s_counter_datapakid TYPE sy-tabix,
           s_cursor            TYPE cursor.
  DATA: lr_pspid TYPE RANGE OF ps_pspid,
        lv_where TYPE string.

  IF i_initflag = sbiwa_c_flag_on.
*   Initialisierung: Selektionen merken
    CASE i_dsource.
      WHEN 'ZPS_MEILENSTEIN'.
      WHEN OTHERS.
        IF 1 = 2. MESSAGE e009(r3). ENDIF.
        RAISE error_passed_to_mess_handler.
    ENDCASE.
    APPEND LINES OF i_t_select TO s_s_if-t_select.
    s_s_if-requnr  = i_requnr.
    s_s_if-dsource = i_dsource.
    s_s_if-maxsize = i_maxsize.
    APPEND LINES OF i_t_fields TO s_s_if-t_fields.
  ELSE.
*   Datenübertragung: erstes Paket öffnet den Cursor
    IF s_counter_datapakid = 0.
      LOOP AT s_s_if-t_select INTO DATA(ls_sel) WHERE fieldnm = 'PSPID'.
        APPEND VALUE #( sign = ls_sel-sign option = ls_sel-option
                        low = ls_sel-low high = ls_sel-high ) TO lr_pspid.
      ENDLOOP.
      READ TABLE s_s_if-t_select INTO ls_sel WITH KEY fieldnm = 'AEDAT'.
      IF sy-subrc = 0.
        lv_where = |aedat >= '{ ls_sel-low }'|.
      ENDIF.
      OPEN CURSOR WITH HOLD s_cursor FOR
        SELECT * FROM zv_ps_meilenstein
          WHERE pspid IN @lr_pspid
            AND (lv_where).
    ENDIF.

    FETCH NEXT CURSOR s_cursor
      APPENDING CORRESPONDING FIELDS OF TABLE e_t_data
      PACKAGE SIZE s_s_if-maxsize.
    IF sy-subrc <> 0.
      CLOSE CURSOR s_cursor.
      RAISE no_more_data.
    ENDIF.

*   Terminverzug in Tagen: offen und überfällig bzw. verspätet erreicht
    LOOP AT e_t_data ASSIGNING FIELD-SYMBOL(<ls_data>).
      <ls_data>-verzug_tage = COND #(
        WHEN <ls_data>-ist_datum IS INITIAL AND <ls_data>-plan_datum < sy-datum
          THEN sy-datum - <ls_data>-plan_datum
        WHEN <ls_data>-ist_datum > <ls_data>-plan_datum
          THEN <ls_data>-ist_datum - <ls_data>-plan_datum
        ELSE 0 ).
    ENDLOOP.
    s_counter_datapakid = s_counter_datapakid + 1.
  ENDIF.
ENDFUNCTION.
