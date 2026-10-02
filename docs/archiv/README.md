# Archiv — frühere Roadmaps

**Angelegt am 15.09.2026.** Verbindlich ist allein [`docs/ROADMAP.md`](../ROADMAP.md).
Aktiv daneben bleiben nur [`docs/roadmap/clean-core-mockups-v2_7.html`](../roadmap/clean-core-mockups-v2_7.html)
(Zielbild von 3.0) und [`docs/roadmap/SCHNITT-0-UMFANG.md`](../roadmap/SCHNITT-0-UMFANG.md)
(Arbeitspakete von Phase 0).

Was hier liegt, wird nicht mehr gepflegt. Es bleibt stehen, weil Befund-IDs
(`CR-nn`, `Exx`), Feature-IDs (`UX-Exx-Fyy`) und Abnahmefälle (W22, C23, QA24, V25)
aus diesen Dateien in `docs/ROADMAP.md`, `docs/BACKLOG.md` und im CHANGELOG zitiert
werden. **Wo eine Datei hier `docs/ROADMAP.md` widerspricht, gilt die Roadmap.**

| Datei | Früherer Pfad | Was sie ist | Abgelöst, weil |
|---|---|---|---|
| [`ROADMAP-2.0.md`](ROADMAP-2.0.md) | `docs/ROADMAP-2.0.md` | Status und Begründung von v2.0 (02.07.2026): warum SSO, RBAC und Self-Hosting zurückgestellt wurden | Seit 12.09. durch die Roadmap ersetzt; die Begründung trägt weiter |
| [`roadmap-2.7/ROADMAP-2.7.md`](roadmap-2.7/ROADMAP-2.7.md) | `docs/ROADMAP.md` (12.–15.09.) | Fassung 2.7: Gates R0/R1/R2/3.0, 76 Teilschnitte, virtuelle Rollen, Datensparsamkeit | Fassung 2.8 vom 15.09.: Konto unverändert, Rollen nur Sichten, Phasen mit kleinen Schritten |
| [`roadmap-2.7/clean-core-review-und-roadmap-2026-09-08.md`](roadmap-2.7/clean-core-review-und-roadmap-2026-09-08.md) | `docs/roadmap/` (früher `roadmap_chatgpt.md` auf dem Desktop) | Review vom 08.09.: Befundregister CR-01…CR-30, Epics E01–E16, Releaseplan 2.9–3.5 | Releaseplan durch 2.7, dann 2.8 ersetzt; das **Befundregister gilt weiter** |
| [`roadmap-2.7/ID-BRUECKE.md`](roadmap-2.7/ID-BRUECKE.md) | `docs/roadmap/` | Brücke `UX-Exx` ↔ `Exx` ↔ `CR-nn`, Status der 30 Befunde am 12.09. | Stand 12.09.; die IDs bleiben gültig |
| [`roadmap-2.7/clean-core-backlog-v2_7.md`](roadmap-2.7/clean-core-backlog-v2_7.md) | `docs/roadmap/` | Langfassung: 16 Epics, Verträge, Stories, **Abnahmekataloge W22/C23/QA24/V25** | Gates und Größen ersetzt; Kataloge zitiert, soweit sie der Roadmap nicht widersprechen |
| [`roadmap-2.7/clean-core-roadmap-v2_7-delta.md`](roadmap-2.7/clean-core-roadmap-v2_7-delta.md) | `docs/roadmap/` | Rahmenkorrektur 2.7: virtuelle Rollen, Datensparsamkeit, Spielwiese | Rahmen gilt nicht mehr |
| [`roadmap-2.7/delivery-slices-v2_7.json`](roadmap-2.7/delivery-slices-v2_7.json) | `docs/roadmap/` | Teilschnittgraph, 76 Knoten | Durch die Phasenfolge ersetzt |
| [`roadmap-2.7/SCHNITT-A-NEUBAU-UND-E2E.md`](roadmap-2.7/SCHNITT-A-NEUBAU-UND-E2E.md) | `docs/roadmap/` | Bau- und Prüfplan R1: Fall, Rechte, Rollen, Datensparsamkeit, 70 E2E-Tests | Grundannahmen entfallen (Projekt = Fall, Einsicht statt Rechte, Konto unverändert) |
| [`roadmap-2.7/SCHNITT-B-UMFANG.md`](roadmap-2.7/SCHNITT-B-UMFANG.md) | `docs/roadmap/` | Umfang R2: Standardabdeckung, Ökonomie, Importe | Lebt in Phase 7 weiter; BPMN in die Phasen 2–4 vorgezogen |
| [`roadmap-2.7/SCHNITT-C-UMFANG.md`](roadmap-2.7/SCHNITT-C-UMFANG.md) | `docs/roadmap/` | Umfang 3.0 alt: Entscheidung, Architekturvertrag, Übergabe | Lebt in Phase 8 weiter; Rollen-Mandate entfallen |

Ältere Einträge im CHANGELOG nennen noch die früheren Pfade; die Spalte „Früherer
Pfad" führt von dort hierher.

## Archived on 02.10.2026 (roadmap 3.0.8 / 3.0.14)

The inventory `docs/registers/public-texts.json` decided "archive" for these files: finished concept and plan papers, the raw model reviews of August 2026 and the Phase 0 work packages. They are history and are kept as written (German where they were written in German); they are not maintained. Older entries in the CHANGELOG, the BACKLOG and code comments may still name the former path; the column "Former path" leads from there to here.

| File | Former path | Folder | What it is |
|---|---|---|---|
| [`CLEAN_CORE_ENRICHMENT_CONCEPT.md`](konzepte/CLEAN_CORE_ENRICHMENT_CONCEPT.md) | `docs/CLEAN_CORE_ENRICHMENT_CONCEPT.md` | `konzepte/` | Concept paper |
| [`CODEX-DELTA-2026-07-10-REMEDIATION-PART2.md`](audits/CODEX-DELTA-2026-07-10-REMEDIATION-PART2.md) | `docs/CODEX-DELTA-2026-07-10-REMEDIATION-PART2.md` | `audits/` | Model review / triage (raw) |
| [`CODEX-DELTA-2026-07-10-REMEDIATION.md`](audits/CODEX-DELTA-2026-07-10-REMEDIATION.md) | `docs/CODEX-DELTA-2026-07-10-REMEDIATION.md` | `audits/` | Model review / triage (raw) |
| [`CONCEPT-ADMIN-USAGE-CONSOLE.md`](konzepte/CONCEPT-ADMIN-USAGE-CONSOLE.md) | `docs/CONCEPT-ADMIN-USAGE-CONSOLE.md` | `konzepte/` | Concept paper |
| [`CONCEPT-EINSICHT-PER-EINLADUNG.md`](konzepte/CONCEPT-EINSICHT-PER-EINLADUNG.md) | `docs/CONCEPT-EINSICHT-PER-EINLADUNG.md` | `konzepte/` | Concept paper |
| [`LINKEDIN-CLEAN-CORE-EXPLAINED.md`](kommunikation/LINKEDIN-CLEAN-CORE-EXPLAINED.md) | `docs/LINKEDIN-CLEAN-CORE-EXPLAINED.md` | `kommunikation/` | Communication draft |
| [`PLAN-FIRESTORE-MIGRATION.md`](betrieb/PLAN-FIRESTORE-MIGRATION.md) | `docs/PLAN-FIRESTORE-MIGRATION.md` | `betrieb/` | Plan |
| [`SECURITY-BACKLOG.md`](audits/SECURITY-BACKLOG.md) | `docs/SECURITY-BACKLOG.md` | `audits/` | Model review / triage (raw) |
| [`SEO-GEO-PLAN-2026-07.md`](betrieb/SEO-GEO-PLAN-2026-07.md) | `docs/SEO-GEO-PLAN-2026-07.md` | `betrieb/` | Plan |
| [`WEEK2_AUDIT_INTEGRITY_PLAN.md`](konzepte/WEEK2_AUDIT_INTEGRITY_PLAN.md) | `docs/WEEK2_AUDIT_INTEGRITY_PLAN.md` | `konzepte/` | Plan |
| [`codex-audit-v119.md`](audits/codex-audit-v119.md) | `docs/codex-audit-v119.md` | `audits/` | Model review / triage (raw) |
| [`2026-08-26-BENEFIT-NEXT-STEPS.md`](reviews-2026-08/2026-08-26-BENEFIT-NEXT-STEPS.md) | `docs/reviews/2026-08-26-BENEFIT-NEXT-STEPS.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-TRIAGE.md`](reviews-2026-08/2026-08-26-TRIAGE.md) | `docs/reviews/2026-08-26-TRIAGE.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-benefit-wow-raw.md`](reviews-2026-08/2026-08-26-grok-4.6-benefit-wow-raw.md) | `docs/reviews/2026-08-26-grok-4.6-benefit-wow-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-engine.md`](reviews-2026-08/2026-08-26-grok-4.6-engine.md) | `docs/reviews/2026-08-26-grok-4.6-engine.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-meta.md`](reviews-2026-08/2026-08-26-grok-4.6-meta.md) | `docs/reviews/2026-08-26-grok-4.6-meta.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-security.md`](reviews-2026-08/2026-08-26-grok-4.6-security.md) | `docs/reviews/2026-08-26-grok-4.6-security.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-ui1.md`](reviews-2026-08/2026-08-26-grok-4.6-ui1.md) | `docs/reviews/2026-08-26-grok-4.6-ui1.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-ui2.md`](reviews-2026-08/2026-08-26-grok-4.6-ui2.md) | `docs/reviews/2026-08-26-grok-4.6-ui2.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-26-grok-4.6-ui3.md`](reviews-2026-08/2026-08-26-grok-4.6-ui3.md) | `docs/reviews/2026-08-26-grok-4.6-ui3.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-EXTERNAL-AUDIT-V2.md`](reviews-2026-08/2026-08-27-EXTERNAL-AUDIT-V2.md) | `docs/reviews/2026-08-27-EXTERNAL-AUDIT-V2.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-GLM-INDEX.md`](reviews-2026-08/2026-08-27-GLM-INDEX.md) | `docs/reviews/2026-08-27-GLM-INDEX.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-GLM-TRIAGE.md`](reviews-2026-08/2026-08-27-GLM-TRIAGE.md) | `docs/reviews/2026-08-27-GLM-TRIAGE.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-benefit-consult-glm-5.3.md`](reviews-2026-08/2026-08-27-benefit-consult-glm-5.3.md) | `docs/reviews/2026-08-27-benefit-consult-glm-5.3.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-benefit-consult-grok-4.20.md`](reviews-2026-08/2026-08-27-benefit-consult-grok-4.20.md) | `docs/reviews/2026-08-27-benefit-consult-grok-4.20.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-benefit-consult-r2-glm-5.3.md`](reviews-2026-08/2026-08-27-benefit-consult-r2-glm-5.3.md) | `docs/reviews/2026-08-27-benefit-consult-r2-glm-5.3.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-benefit-consult-r2-grok-4.20.md`](reviews-2026-08/2026-08-27-benefit-consult-r2-grok-4.20.md) | `docs/reviews/2026-08-27-benefit-consult-r2-grok-4.20.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-benefit-visual-glm-5v.md`](reviews-2026-08/2026-08-27-benefit-visual-glm-5v.md) | `docs/reviews/2026-08-27-benefit-visual-glm-5v.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-benefit-visual-grok-4.20.md`](reviews-2026-08/2026-08-27-benefit-visual-grok-4.20.md) | `docs/reviews/2026-08-27-benefit-visual-grok-4.20.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-glm-engine-raw.md`](reviews-2026-08/2026-08-27-glm-engine-raw.md) | `docs/reviews/2026-08-27-glm-engine-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-glm-meta-raw.md`](reviews-2026-08/2026-08-27-glm-meta-raw.md) | `docs/reviews/2026-08-27-glm-meta-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-glm-security-raw.md`](reviews-2026-08/2026-08-27-glm-security-raw.md) | `docs/reviews/2026-08-27-glm-security-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-glm-ui_app-raw.md`](reviews-2026-08/2026-08-27-glm-ui_app-raw.md) | `docs/reviews/2026-08-27-glm-ui_app-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-glm-ui_components-raw.md`](reviews-2026-08/2026-08-27-glm-ui_components-raw.md) | `docs/reviews/2026-08-27-glm-ui_components-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-glm-ui_public-raw.md`](reviews-2026-08/2026-08-27-glm-ui_public-raw.md) | `docs/reviews/2026-08-27-glm-ui_public-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-gpt-5.6-sol-engine-raw.md`](reviews-2026-08/2026-08-27-gpt-5.6-sol-engine-raw.md) | `docs/reviews/2026-08-27-gpt-5.6-sol-engine-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-gpt-5.6-sol-meta-raw.md`](reviews-2026-08/2026-08-27-gpt-5.6-sol-meta-raw.md) | `docs/reviews/2026-08-27-gpt-5.6-sol-meta-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-gpt-5.6-sol-security-raw.md`](reviews-2026-08/2026-08-27-gpt-5.6-sol-security-raw.md) | `docs/reviews/2026-08-27-gpt-5.6-sol-security-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-gpt-5.6-sol-ui_app-raw.md`](reviews-2026-08/2026-08-27-gpt-5.6-sol-ui_app-raw.md) | `docs/reviews/2026-08-27-gpt-5.6-sol-ui_app-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-gpt-5.6-sol-ui_components-raw.md`](reviews-2026-08/2026-08-27-gpt-5.6-sol-ui_components-raw.md) | `docs/reviews/2026-08-27-gpt-5.6-sol-ui_components-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-27-gpt-5.6-sol-ui_public-raw.md`](reviews-2026-08/2026-08-27-gpt-5.6-sol-ui_public-raw.md) | `docs/reviews/2026-08-27-gpt-5.6-sol-ui_public-raw.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-UMSETZUNGSPLAN.md`](reviews-2026-08/2026-08-28-UMSETZUNGSPLAN.md) | `docs/reviews/2026-08-28-UMSETZUNGSPLAN.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-ux-bench-glm-5v-turbo.md`](reviews-2026-08/2026-08-28-ux-bench-glm-5v-turbo.md) | `docs/reviews/2026-08-28-ux-bench-glm-5v-turbo.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-ux-bench-gpt-5.6-sol.md`](reviews-2026-08/2026-08-28-ux-bench-gpt-5.6-sol.md) | `docs/reviews/2026-08-28-ux-bench-gpt-5.6-sol.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-ux-bench-grok-4.6.md`](reviews-2026-08/2026-08-28-ux-bench-grok-4.6.md) | `docs/reviews/2026-08-28-ux-bench-grok-4.6.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-ux-round2-glm-5v-turbo.md`](reviews-2026-08/2026-08-28-ux-round2-glm-5v-turbo.md) | `docs/reviews/2026-08-28-ux-round2-glm-5v-turbo.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-ux-round2-gpt-5.6-sol.md`](reviews-2026-08/2026-08-28-ux-round2-gpt-5.6-sol.md) | `docs/reviews/2026-08-28-ux-round2-gpt-5.6-sol.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`2026-08-28-ux-round2-grok-4.6.md`](reviews-2026-08/2026-08-28-ux-round2-grok-4.6.md) | `docs/reviews/2026-08-28-ux-round2-grok-4.6.md` | `reviews-2026-08/` | Model review / triage (raw) |
| [`SCHNITT-0-UMFANG.md`](roadmap-2.8/SCHNITT-0-UMFANG.md) | `docs/roadmap/SCHNITT-0-UMFANG.md` | `roadmap-2.8/` | Phase 0 work packages |
