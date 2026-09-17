# Fundstellen in öffentlichen Repositories — warum der Bericht hier nicht steht

Der Fundstellen-Durchgang vom 17.09.2026 hat neun Fälle des Korpus an echtem Produktivcode belegt: dieselben Konstrukte, die die Fälle konstruieren, stehen so in fremden Repositories. Das ist der Unterschied zwischen „konstruiert" und „verifiziert" und steht als Beleggrad an den betroffenen Fällen.

**Der Bericht selbst liegt außerhalb dieses Repositories.** Vierzehn der fünfzehn Quellen tragen keine Lizenzdatei, und die tragenden sind nach allen Indizien — Transportnummern, Entwicklernamen, Arbeitgebernamen im Pfad — unautorisiert hochgeladene Arbeitgeberbestände. Dieses Repository ist öffentlich, und Git vergisst nichts: ein URL mit Commit und Zeilennummer wäre ein dauerhafter, indizierter Zeiger auf eine fremde Offenlegung, auch nachdem jemand ihn wieder herausnimmt. Ein Beleg, der die Sache einer anderen Person verschlimmert, ist kein Beleg, den wir führen.

Im Fallbuch steht deshalb je Fundstelle nur der SHA-256 des Ausschnitts und die Zeilenzahl. Der vollständige Nachweis — Quelle, Commit, Pfad, Zeilen und der Ausschnitt — wird einem Prüfer auf Anfrage gezeigt. §9.2 des Fallbuchs erklärt das Verfahren.

`tests/korpus-engine.spec.ts` hält die Linie: ein Test liest `docs/korpus/` und macht den Lauf rot, sobald dort ein Hostname oder eine vierzigstellige Commit-ID auftaucht. Die Quellenhashes des Korpus sind vierundsechzigstellig und treffen die Regel nicht.
