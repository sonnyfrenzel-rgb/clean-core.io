INTERFACE zif_sd_seg_mapper
  PUBLIC.
* Bildet genau ein IDoc-Segment auf die Auftragsstruktur ab.
* Fehler werden als ZCX_SD_IDOC_MAP gemeldet (IDoc -> Status 51).

  METHODS map
    IMPORTING
      is_edidd TYPE edidd
    CHANGING
      cs_order TYPE zsd_s_idoc_order
    RAISING
      zcx_sd_idoc_map.

ENDINTERFACE.
