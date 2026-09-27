*----------------------------------------------------------------------*
* Behavior Pool fuer ZR_UMBUCHUNG (unmanaged, ohne Draft)
*
* Fiori-App "Umbuchungsauftraege" fuer Lagerleiter: Auftrag erfassen,
* Menge korrigieren, per Aktion "Buchen" zur Warenbewegung 311 freigeben.
* Die eigentliche Warenbewegung laeuft NACH dem Commit im tRFC-Baustein
* Z_MM_UMBUCHUNG_BUCHEN (Funktionsgruppe ZMM_UMB_POST).
*
* Verhaltensdefinition (Auszug, zur Orientierung):
*   unmanaged implementation in class zbp_r_umbuchung unique;
*   define behavior for ZR_UMBUCHUNG alias umbuchung
*   lock master
*   authorization master ( global )
*   {
*     create;
*     update;
*     field ( readonly ) UmbuchungId, Status, Material, Werk, LagerortVon,
*                        LagerortNach, Mengeneinheit;
*     action buchen result [1] $self;
*   }
*
* Meldungsklasse ZMM_UMB
*   001  Menge und Material sind Pflicht
*   010  Umbuchung &1 ist nicht mehr offen
*   020  Umbuchung gesperrt durch &1
*   030  Umbuchung &1 kann nicht gebucht werden
*   040  Von- und Nach-Lagerort sind gleich
*   041  Bestand &1 am Lagerort &2 reicht nicht
*   050/051 Verbuchungsfehler (Abbruch)
*----------------------------------------------------------------------*
CLASS zbp_r_umbuchung DEFINITION
  PUBLIC
  ABSTRACT
  FINAL
  FOR BEHAVIOR OF zr_umbuchung.

  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF gc_status,
        offen   TYPE zmm_umb_status VALUE 'O',
        zu_buchen TYPE zmm_umb_status VALUE 'P',
        gebucht TYPE zmm_umb_status VALUE 'B',
      END OF gc_status.
ENDCLASS.



CLASS zbp_r_umbuchung IMPLEMENTATION.
ENDCLASS.
