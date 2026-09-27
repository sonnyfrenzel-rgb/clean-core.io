*---------------------------------------------------------------------*
*       FORM USEREXIT_MOVE_FIELD_TO_VBAK                              *
*---------------------------------------------------------------------*
*       This userexit can be used to move some fields into the sales  *
*       dokument header workaerea VBAK.                               *
*---------------------------------------------------------------------*
FORM userexit_move_field_to_vbak.
* Ticket 4711 - Vorbelegung Versandbedingung Key Accounts (MB 2014)
  DATA: lv_kdgrp TYPE knvv-kdgrp.

  CHECK t180-trtyp = 'H'.          "nur beim Anlegen

  SELECT SINGLE kdgrp FROM knvv INTO lv_kdgrp
    WHERE kunnr = vbak-kunnr
      AND vkorg = vbak-vkorg
      AND vtweg = vbak-vtweg
      AND spart = vbak-spart.
  IF sy-subrc = 0 AND lv_kdgrp = 'KA'.
    vbak-vsbed = '10'.             "Express
    vbak-zzkeyacc = 'X'.
  ELSEIF vbak-auart = 'ZFD'.
    vbak-augru = 'Z01'.            "Freilieferung: Auftragsgrund Muster
  ENDIF.
*  vbak-lifsk = '01'.  "deaktiviert 2016, Liefersperre jetzt über Kredit
ENDFORM.
