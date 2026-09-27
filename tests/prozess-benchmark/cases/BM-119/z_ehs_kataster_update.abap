FUNCTION z_ehs_kataster_update.
*"----------------------------------------------------------------------
*"*"Verbuchungsfunktionsbaustein:
*"
*"*"Lokale Schnittstelle:
*"  IMPORTING
*"     VALUE(IS_KATASTER) TYPE  ZEHS_KATASTER
*"----------------------------------------------------------------------
* Gefahrstoffkataster: SDB-Daten des Stoffs an allen Lagerorten des
* Werks übernehmen, Änderung historisieren (Dokumentationspflicht
* GefStoffV § 6 Abs. 12)
* Aufruf IN UPDATE TASK aus ZEHS_SDB_INBOUND (COMMIT am Laufende).
* Fehler brechen die Verbuchung mit MESSAGE A ab (Eintrag in SM13).
* 2018-10 NKL  Erstellung
* 2021-03 NKL  Historie ZEHS_KAT_HIST
*----------------------------------------------------------------------
  UPDATE zehs_kataster
    SET lgk       = @is_kataster-lgk,
        wgk       = @is_kataster-wgk,
        sdb_datum = @is_kataster-sdb_datum,
        lifnr     = @is_kataster-lifnr
    WHERE werks = @is_kataster-werks
      AND subid = @is_kataster-subid.
  IF sy-subrc <> 0.
    MESSAGE a810(zehs) WITH is_kataster-subid is_kataster-werks.
  ENDIF.

  INSERT zehs_kat_hist FROM @( VALUE #( BASE CORRESPONDING #( is_kataster )
                                        aenddat = sy-datum
                                        aendzeit = sy-uzeit
                                        aendnam = sy-uname ) ).
ENDFUNCTION.
