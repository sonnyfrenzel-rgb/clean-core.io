*----------------------------------------------------------------------*
* Behavior Pool ZBP_I_ANGEBOT - Vertriebsangebote (managed, draft,
* with additional save). Kopf ZI_ANGEBOT, Positionen ZI_ANGEBOTPOS.
*
* Statusmodell Kopf
*   N  neu / in Bearbeitung
*   G  Genehmigung angefordert (Gesamtwert > 50.000)
*   F  freigegeben (an Kunden versendbar)
*   A  abgelaufen (Job ZSD_ANGEBOT_ABLAUF, taeglich 01:00)
*
* Business Event: GenehmigungAngefordert -> Event Consumption Model
* in der BTP-Genehmigungsapp (nicht Teil dieses Pakets)
*----------------------------------------------------------------------*
CLASS zbp_i_angebot DEFINITION
  PUBLIC
  ABSTRACT
  FINAL
  FOR BEHAVIOR OF zi_angebot.

  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF gc_status,
        neu          TYPE zsd_angebot_status VALUE 'N',
        genehmigung  TYPE zsd_angebot_status VALUE 'G',
        freigegeben  TYPE zsd_angebot_status VALUE 'F',
        abgelaufen   TYPE zsd_angebot_status VALUE 'A',
      END OF gc_status,
      gc_genehmigungsgrenze TYPE zsd_angebot_wert VALUE '50000.00'.
ENDCLASS.



CLASS zbp_i_angebot IMPLEMENTATION.
ENDCLASS.
