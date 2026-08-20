# Screening — Firebase-AI-Studio-Altlasten

**Erstellt:** 2026-08-20 · **Projekt:** `cleancore-491216` · **Stand:** nach der Firestore-Migration

Vollständige Bestandsaufnahme aller Ressourcen, die aus der Firebase-AI-Studio-Herkunft
stammen oder nicht mehr gebraucht werden. **Es wurde noch nichts gelöscht** — die
destruktiven Schritte hat der Sicherheits-Classifier blockiert, die Befehle stehen unten
zum Selbstausführen.

Sortiert nach Nutzen: der erste Abschnitt ist der mit Abstand größte Kostenposten.

---

## 1. Container-Images: 676 Stück in europe-west1

Der grösste Posten im ganzen Projekt, und er wächst mit jedem Deploy.

| Repository | Region | Images |
|---|---|---|
| `cloud-run-source-deploy` | **europe-west1** | **676** |
| `cloud-run-source-deploy` | us-west1 | 14 |
| `cloud-run-source-deploy` | europe-west3 | 10 |

Ursache sind die Cloud-Run-Revisionen: jeder Deploy erzeugt eine neue Revision, jede
Revision hält ihr Image fest, und **gelöscht wird nie**.

| Dienst | Region | Revisionen |
|---|---|---|
| `clean-core` | europe-west1 | **252** |
| `clean-core-dev` | europe-west1 | 48 |
| `clean-core-test` | europe-west1 | 45 |
| `clean-core` | europe-west3 | 6 |
| `cleancore-io` | us-west1 | 10 |

**Nicht einfach alle Images löschen.** Jede noch existierende Revision referenziert ihres;
verschwindet das Image, lässt sich die Revision nicht mehr starten — und damit ist der
Rollback-Weg weg. Die richtige Reihenfolge ist: erst alte *Revisionen* entfernen, dann die
freigewordenen Images.

Diese fünf Images sind aktiv und dürfen nie weg:

```
clean-core       (europe-west1)  …/clean-core@sha256:f31cf8b2…
clean-core-dev   (europe-west1)  …/clean-core-dev@sha256:5c67d31e…
clean-core-test  (europe-west1)  …/clean-core-test@sha256:dd253809…
clean-core       (europe-west3)  …/clean-core@sha256:547c04a7…
cleancore-io     (us-west1)      …/cleancore-io@sha256:2cdfbd2e…
```

**Nachhaltiger als einmaliges Aufräumen** ist eine Cleanup-Policy auf dem Repository, die
alte Versionen automatisch verfallen lässt — sonst steht in einem Jahr dasselbe hier.

---

## 2. Zwei veraltete, öffentlich erreichbare Deployments

Beide antworten mit HTTP 200 und liefern alten Code — auf `/api/health` noch HTML statt
JSON, stammen also von vor der Health-Route.

| Dienst | Region | URL |
|---|---|---|
| `cleancore-io` | **us-west1** | `https://cleancore-io-qcevuoi3uq-uw.a.run.app` |
| `clean-core` | **europe-west3** | `https://clean-core-qcevuoi3uq-ey.a.run.app` |

Keiner hängt an `clean-core.io` — die Domain zeigt auf europe-west1. Der us-west1-Dienst
ist der unangenehmere: eine öffentlich abrufbare Kopie der Anwendung in Oregon, also
dasselbe Residenz-Thema, das wir gerade für die Datenbank gelöst haben.

**Vor dem Löschen prüfen:** ob eine der URLs irgendwo verlinkt ist und ob europe-west3
nicht doch als Failover gedacht war.

---

## 3. Buckets

| Bucket | Region | Objekte | Bewertung |
|---|---|---|---|
| `ai-studio-bucket-819734065839-us-west1` | us-west1 | 19 | reiner Altbestand — enthält nur Build-Artefakte für `cleancore-io` |
| `run-sources-…-us-west1` | us-west1 | 10 | Build-Quellen des us-west1-Dienstes |
| `run-sources-…-europe-west3` | europe-west3 | 11 | Build-Quellen des europe-west3-Dienstes |
| `cleancore-491216-fs-export-uswest1` | us-west1 | 6 | mein Export-Zwischenlager von heute |
| `cleancore-491216-firestore-backup` | europe-west1 | 6 | **Migrations-Backup — behalten** |
| `run-sources-…-europe-west1` | europe-west1 | — | **aktiv, nicht anfassen** |

Die ersten drei können nach den Diensten weg. Das Export-Zwischenlager erst, wenn die
Migration endgültig abgenommen ist.

---

## 4. Firestore-Datenbanken

| Datenbank | Region | Inhalt | Bewertung |
|---|---|---|---|
| `clean-core-eu` | europe-west1 | 402 Dokumente | **Produktion** |
| `ai-studio-e57d33e3…` | us-west1 | 402 Dokumente | **behalten bis ~03.09.** als Rückfalloption |
| `ai-studio-39b46c45…` | us-west1 | — | **in Benutzung** (`release`) |
| `ai-studio-030e1ee1…` | us-west1 | — | **in Benutzung** (`dev`) |
| `ai-studio-d80950ff…` | us-west1 | 1 Dokument | verwaist, an keinen Branch gebunden |
| `clean-core-prod` | europe-west1 | 0 Dokumente | mein erster Anlauf (Standard-Edition) |
| `(default)` | eur3 | 1 Dokument | von der App nie benutzt |

Die letzten drei sind praktisch leer. **Vor dem Löschen** jeweils der Blick hinein, ob das
eine Dokument etwas ist, das jemand vermisst — bei `(default)` ist es ein `users`-Eintrag,
bei `d80950ff` ein `projects`-Eintrag.

Auf `ai-studio-e57d33e3…` und `clean-core-eu` ist der Löschschutz aktiv; er muss vor einer
Löschung ausdrücklich abgeschaltet werden. Das ist Absicht.

---

## 5. API-Schlüssel

| Name | Beschränkt auf | Bewertung |
|---|---|---|
| `Browser key (auto created by Firebase)` | Firebase-Dienste | **in Benutzung** vom Client |
| `Gemini API Key` | `generativelanguage` | vermutlich der Server-Key |
| `Generative Language API Key` | `generativelanguage` | **Dublette** — einer der beiden ist tot |
| `API-Schlüssel 1` | `aiplatform` (Vertex AI) | die App nutzt kein Vertex AI |
| `Cloud Run` | `cloudapis` | Zweck unklar |

**Nicht blind löschen.** Welcher der beiden Generative-Language-Schlüssel im GitHub-Secret
`GEMINI_API_KEY` steckt, lässt sich von hier aus nicht sehen. Der Weg: in der Konsole die
Nutzung der letzten 30 Tage je Schlüssel ansehen, den ungenutzten zuerst deaktivieren
statt löschen, eine Woche warten, dann löschen.

**Sicherheitsnotiz nebenbei:** Der Firebase-Browser-Key hat keine Referrer-Beschränkung.
Er ist konstruktionsbedingt öffentlich, aber eine Einschränkung auf `clean-core.io` und
`*.run.app` kostet nichts und verhindert Fremdnutzung des Kontingents.

---

## 6. Service Account

`vertex-express@cleancore-491216.iam.gserviceaccount.com` — ohne Anzeigenamen, passt zum
Vertex-AI-Schlüssel aus Abschnitt 5. Die App nutzt Vertex AI nicht.

**Erst prüfen**, ob er noch IAM-Bindungen hat, bevor er verschwindet.

---

## Befehle

Ich konnte die Löschungen nicht ausführen — der Sicherheits-Classifier blockiert sie in
diesem Modus. Sie in der Konsole zu klicken ist genauso gut; hier die Befehle für den Weg
über die Shell.

### Reihenfolge 1 — die zwei alten Dienste

```bash
gcloud run services delete cleancore-io --region=us-west1 --project=cleancore-491216
gcloud run services delete clean-core   --region=europe-west3 --project=cleancore-491216
```

### Reihenfolge 2 — deren Buckets und Images

```bash
gcloud storage rm --recursive gs://ai-studio-bucket-819734065839-us-west1
gcloud storage rm --recursive gs://run-sources-cleancore-491216-us-west1
gcloud storage rm --recursive gs://run-sources-cleancore-491216-europe-west3

gcloud artifacts repositories delete cloud-run-source-deploy \
  --location=us-west1 --project=cleancore-491216
gcloud artifacts repositories delete cloud-run-source-deploy \
  --location=europe-west3 --project=cleancore-491216
```

### Reihenfolge 3 — der grosse Posten, alte Revisionen und Images

Erst schauen, was wegginge:

```bash
gcloud run revisions list --service=clean-core --region=europe-west1 \
  --project=cleancore-491216 --sort-by=~metadata.creationTimestamp \
  --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)"
```

Die zehn jüngsten behalten, den Rest entfernen. **Die aktive Revision
`clean-core-00251-llt` niemals.** Danach räumt eine Cleanup-Policy auf dem Repository das
dauerhaft, statt es in einem Jahr erneut aufzulaufen.

### Später — leere Datenbanken

Nach Abnahme der Migration, und jeweils erst nach einem Blick in das eine Dokument:

```bash
gcloud firestore databases delete --database=clean-core-prod --project=cleancore-491216
gcloud firestore databases delete --database=ai-studio-d80950ff-29db-4c7a-a202-688b019c1bf9 \
  --project=cleancore-491216
```

`ai-studio-e57d33e3…` bleibt bis etwa zum **3. September** stehen. Sie ist die einzige
Rückfalloption, falls an der Migration doch noch etwas auffällt.
