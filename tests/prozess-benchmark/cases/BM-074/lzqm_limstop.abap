FUNCTION-POOL zqm_lims MESSAGE-ID zqm.
*----------------------------------------------------------------------*
* Eingang Pruefergebnisse aus dem LIMS (IDoc-Typ ZQMRES01)
* Nachrichtentyp ZQMRES, Vorgangscode ZQMR -> IDOC_INPUT_ZQMRES
* Segmente: Z1QMRESH (Kopf: Prueflos, Vorgang, Labor, Meldungswunsch)
*           Z1QMRESI (Merkmal: Nummer, Mittelwert, Bewertung A/R)
*----------------------------------------------------------------------*
TYPES: BEGIN OF gty_kopf,
         prueflos TYPE qplos,
         vornr    TYPE vornr,
         labor    TYPE c LENGTH 10,
         meldung  TYPE c LENGTH 1,
       END OF gty_kopf.

TYPES: BEGIN OF gty_pos,
         merknr    TYPE qmerknrp,
         mittelwrt TYPE c LENGTH 22,
         bewertung TYPE c LENGTH 1,
       END OF gty_pos.

DATA: gs_kopf     TYPE gty_kopf,
      gt_pos      TYPE STANDARD TABLE OF gty_pos,
      gv_vorglfnr TYPE qlfnkn,
      gv_msg      TYPE bapi_msg.

CONSTANTS: gc_status_ok  TYPE edi_status VALUE '53',
           gc_status_err TYPE edi_status VALUE '51',
           gc_qmart      TYPE qmart      VALUE 'Z3'.
