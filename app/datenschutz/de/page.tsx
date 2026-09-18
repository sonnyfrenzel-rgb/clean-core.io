import type { Metadata } from 'next';
import { withTwitterCard } from '@/lib/page-metadata';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { APP_VERSION, APP_RELEASE_DATE_DE } from '@/lib/version';

/**
 * Die deutsche Fassung der Datenschutzerklärung.
 *
 * Warum es sie gibt: Art. 12 Abs. 1 DSGVO verlangt die Information „in
 * präziser, transparenter, verständlicher und leicht zugänglicher Form, in
 * klarer und einfacher Sprache". Verantwortlicher, Aufsichtsbehörde und der
 * überwiegende Teil der Community sind deutschsprachig; eine ausschließlich
 * englische Erklärung mit deutschem Titel ist an dieser Stelle angreifbar
 * (Rechtsprüfung 18.09.2026).
 *
 * Warum die englische Fassung unter `/datenschutz` bleibt und diese hier unter
 * `/datenschutz/de` liegt: an der englischen Adresse hängen die kanonische URL,
 * jeder Verweis im Produkt und die Vertrauenskarte vor dem Hochladen, die ihre
 * Aussagen wörtlich aus `app/datenschutz/page.tsx` belegt
 * (`tests/trust-card-guard.spec.ts`). Die Adresse zu tauschen hätte all das
 * gleichzeitig bewegt, ohne dass ein Leser etwas davon hat, das ein
 * Sprachumschalter nicht auch gibt.
 *
 * **Beide Fassungen sind gleichrangig.** Keine ist eine Zusammenfassung der
 * anderen: `tests/privacy-policy-parity.spec.ts` vergleicht Abschnittszahl,
 * Nummerierung und Anker und wird rot, sobald eine Fassung einen Abschnitt hat,
 * den die andere nicht hat. Wer hier etwas ändert, ändert es drüben mit.
 */

export const metadata: Metadata = withTwitterCard({
  title: 'Datenschutzerklärung | Clean-Core.io',
  description:
    'Datenschutzerklärung von Clean-Core.io: Verarbeitung nach DSGVO, Ihre Rechte nach Art. 15–21 DSGVO, Widerspruchsrecht und Löschung (Art. 17).',
  alternates: {
    canonical: 'https://clean-core.io/datenschutz/de',
    languages: {
      de: 'https://clean-core.io/datenschutz/de',
      en: 'https://clean-core.io/datenschutz',
    },
  },
  openGraph: {
    title: 'Datenschutzerklärung | Clean-Core.io',
    description: 'Verarbeitung nach DSGVO, Ihre Rechte nach Art. 15–21 DSGVO und Löschung (Art. 17).',
    url: 'https://clean-core.io/datenschutz/de',
    type: 'website',
  },
});

export default function DatenschutzDePage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-green-600 hover:opacity-80 transition-opacity">
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-lg tracking-tight text-gray-900">Clean-Core<span className="text-green-600">.io</span></span>
          </Link>
          <Link
            href="/datenschutz"
            hrefLang="en"
            data-privacy-language-switch="en"
            className="text-xs font-black uppercase tracking-wider text-gray-500 hover:text-green-600 transition-colors"
          >
            English version
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <h1 className="text-3xl md:text-5xl font-black text-gray-950 tracking-tighter mb-4">
          Datenschutzerklärung
        </h1>
        <p className="text-sm text-gray-500 mb-12">
          Diese deutsche Fassung und die{' '}
          <Link href="/datenschutz" hrefLang="en" className="text-green-600 hover:underline font-semibold">
            englische Fassung
          </Link>{' '}
          sagen dasselbe. Sollten sie je voneinander abweichen, <strong>ist die deutsche Fassung ma&szlig;geblich</strong> &mdash; wir sind ein deutscher Verantwortlicher unter einer deutschen Aufsichtsbeh&ouml;rde, und eine &Uuml;bersetzung soll nicht &auml;ndern k&ouml;nnen, was wir Ihnen schulden.
        </p>

        <div className="space-y-10 text-gray-700 leading-relaxed">
          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              1. Datenschutz auf einen Blick
            </h2>
            <p className="text-base mb-3">
              Der Schutz Ihrer personenbezogenen Daten hat für uns Vorrang. Nachfolgend informieren wir Sie darüber, welche Daten wir bei Ihrem Besuch und bei der Nutzung unserer Plattform (Free Community Edition) erheben, verarbeiten und speichern.
            </p>
            <p className="text-sm text-gray-500 mb-3">
              <strong>Verantwortlicher:</strong> Felix Frenzel, Hellerstraße 9, 96047 Bamberg, Deutschland, E-Mail: <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
            </p>
            <p className="text-sm text-gray-500">
              <strong>Datenschutzbeauftragter:</strong> es ist keiner bestellt. Clean-Core.io wird von einer Person betrieben; die Schwellen des Art. 37 DSGVO und des § 38 BDSG sind nicht erreicht — es sind nicht zwanzig oder mehr Personen ständig mit der Verarbeitung beschäftigt, die Kerntätigkeit ist keine umfangreiche regelmäßige Überwachung, und besondere Datenkategorien verarbeiten wir nicht. Fragen zum Datenschutz richten Sie an die Adresse oben; sie erreichen den Verantwortlichen unmittelbar.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              2. Datenerhebung und Verarbeitungszwecke
            </h2>
            <p className="text-base mb-4">
              Wir verarbeiten personenbezogene Daten unserer Nutzer nur, soweit dies für eine funktionsfähige Plattform sowie für unsere Inhalte und Leistungen erforderlich ist.
            </p>
            <ul className="list-disc pl-5 space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-800">Google-Anmeldung (Firebase Auth):</strong> Für die Anmeldung nutzen wir Google Sign-In. Dabei werden Name, E-Mail-Adresse und Profilbild aus Ihrem Google-Konto sicher ausgelesen, um Ihre Sitzung zu authentifizieren und Ihre Zugriffsrechte festzulegen. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</em>
              </li>
              <li>
                <strong className="text-gray-800">E-Mail und Passwort (Firebase Auth):</strong> Sie können sich statt über Google auch mit E-Mail-Adresse und Passwort registrieren. In diesem Fall verarbeiten wir die E-Mail-Adresse sowie den Vor- und Nachnamen, den Sie angeben. Das Passwort selbst verwaltet Firebase Authentication; für uns ist es zu keinem Zeitpunkt sichtbar. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.</em>
              </li>
              <li>
                <strong className="text-gray-800">Ihre Motivation (freiwillig):</strong> der Freitext, den Sie bei der Registrierung ergänzen können. Er ist freiwillig, hat keinen Einfluss darauf, ob Sie Zugang erhalten, und eine Zeile an <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a> genügt, damit er gelöscht wird — wir fragen nicht nach dem Grund. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO — Ihre Einwilligung, die Sie jederzeit mit Wirkung für die Zukunft widerrufen können.</em>
              </li>
              <li>
                <strong className="text-gray-800">Transaktionale E-Mails (Resend):</strong> Wir versenden die Mails, die der Dienst selbst erfordert — die Bestätigung einer Adresse, eine Einladung, um deren Versand Sie gebeten haben, einen Hinweis zu Ihrem Konto. Einen Newsletter gibt es nicht und Werbemails gibt es nicht. Ihre Adresse geht zur Zustellung an unseren Mailanbieter und sonst nirgendwohin. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO für die Mails, die Teil der Leistung sind, und Art. 6 Abs. 1 lit. f DSGVO für die, die sie sicher halten.</em>
              </li>
              <li>
                <strong className="text-gray-800">Nutzerprofile in Firestore:</strong> Wir speichern Metadaten zu Ihrer Nutzung (etwa die Zahl durchgeführter Code-Transformationen, Systemgrenzen sowie Ihren Vor- und Nachnamen) in unserer gesicherten Datenbank. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO für die Zähler, ohne die das kostenlose Kontingent nicht funktioniert, und Art. 6 Abs. 1 lit. f DSGVO für Betrieb und Sicherheit der Plattform.</em>
              </li>
              <li>
                <strong className="text-gray-800">Eigener Schlüssel (BYOK):</strong> Ein eigener Schlüssel ist freiwillig; ohne ihn laufen Transformationen über einen gemeinsamen Community-Schlüssel im Rahmen Ihres kostenlosen Kontingents. Hinterlegen Sie in den Einstellungen Ihren eigenen Google-Gemini-API-Schlüssel, wird dieser verschlüsselt in unserer gesicherten Firestore-Instanz gespeichert. Er dient ausschließlich dazu, Ihre Transformationsanfragen über einen gesicherten Server-Proxy an die Gemini-API weiterzuleiten; im Browser erscheint er nie. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO — Sie stellen den Schlüssel bereit, damit wir die Leistung damit erbringen.</em>
              </li>
              <li>
                <strong className="text-gray-800">Sicherheits-Protokoll:</strong> administrative Handlungen an einem Konto — Freigabe, Entzug des Zugangs, Löschung — werden mit handelndem Administrator, betroffenem Konto und Zeitpunkt aufgezeichnet, damit privilegierte Eingriffe nachvollziehbar bleiben. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.</em> Zur Speicherdauer siehe Abschnitt 6.
              </li>
              <li>
                <strong className="text-gray-800">Einladungen, die Sie versenden:</strong> Laden Sie jemanden zum Lesen eines Projekts ein, speichern wir die von Ihnen eingegebene E-Mail-Adresse, um den Link zu versenden und ihn bei der Anmeldung dieser Person zu prüfen. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO — Betrieb der Teilen-Funktion, um die ein Nutzer gebeten hat.</em> Die eingeladene Person wird darüber in der Einladungsmail selbst informiert (Art. 14 DSGVO); Abschnitt 8 beschreibt den Ablauf vollständig.
              </li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              <strong>Müssen Sie diese Daten bereitstellen?</strong> Eine gesetzliche Pflicht besteht nicht, und zur Registrierung sind Sie vertraglich nicht verpflichtet. Unsere öffentlichen Seiten, die Dokumentation und der Offline-Prüfer funktionieren ohne Konto. Für die Nutzung der Plattform selbst ist die Anmeldung jedoch technisch erforderlich: ohne E-Mail-Adresse und Namen können wir kein Konto anlegen, Ihre Projekte nicht von denen anderer trennen und das kostenlose Kontingent nicht durchsetzen — ohne diese Angaben ist die Plattform also nicht nutzbar. Alles oben als freiwillig Bezeichnete (Motivation, eigener Schlüssel) können Sie weglassen; die einzige Folge ist, dass die jeweilige Funktion entfällt.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Mindestalter:</strong> Clean-Core.io ist ein Werkzeug für professionelle Softwarearbeit und richtet sich nicht an Kinder und Jugendliche. Für ein Konto müssen Sie mindestens 18 Jahre alt sein; die Nutzungsbedingungen sagen dasselbe. Wir prüfen das Alter nicht — ein Nachweis hieße, mehr personenbezogene Daten zu erheben, nicht weniger —, löschen ein Konto aber auf Hinweis, dass es einer jüngeren Person gehört.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Bitte laden Sie keine personenbezogenen Daten hoch.</strong> ABAP trägt sie oft mit, ohne dass jemand es beabsichtigt: die Benutzerkennung eines Entwicklers, ein Name in einem Kommentar, eine echte Kundennummer, ein Testdatensatz aus der Produktion. Entfernen Sie das vor dem Hochladen. Wir bieten keinen Auftragsverarbeitungsvertrag nach Art. 28 DSGVO an, und die Plattform ist nicht für die Verarbeitung personenbezogener Daten gedacht — die Nutzungsbedingungen machen daraus eine Pflicht, und Abschnitt 3 erklärt, was mit dem geschieht, was Sie hochladen. Das ist eine Regel, um die wir bitten; die Plattform erkennt und blockiert nichts davon.
            </p>
          </section>

          <section id="source-code" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              3. Verarbeitung von Quellcode und Projektdaten
            </h2>
            <p className="text-base mb-3">
              Die von Ihnen hochgeladenen ABAP-Quelldateien und die erzeugten Modernisierungsartefakte (etwa Lösungsentwürfe, TypeScript-Code und Testfälle) werden in unserer gesicherten Google-Firebase-Umgebung in Europa gespeichert.
            </p>
            <p className="text-base mb-3">
              <strong className="text-gray-800">Wer Ihr Projekt lesen kann:</strong> das Konto, das es angelegt hat, und wen dieses Konto zum Lesen einlädt — sonst niemand, und seit dem 16.&nbsp;September&nbsp;2026 auch nicht unser Administrator. Es gibt eine Ausnahme, den Notfall, und sie ist in{' '}
              <a href="#project-access" className="text-green-700 underline underline-offset-2 hover:text-green-800">
                Abschnitt 8
              </a>{' '}
              beschrieben, der auch das ganze Bild ausführt und die Regeln nennt, die Sie selbst nachlesen können.
            </p>
            <div className="p-4 bg-green-50 border border-green-200 rounded-2xl">
              <p className="text-sm text-green-800">
                <strong>Wichtiger Sicherheitshinweis:</strong> Wir verkaufen, vermieten oder verwerten Ihren hochgeladenen Quellcode nicht kommerziell. Für die KI-gestützte Modernisierung wird Quellcode über gesicherte, authentifizierte Verbindungen mit zustandslosen Anfragen an die <strong>Google-Gemini-API</strong> übermittelt. Welche Datennutzungsbedingungen von Google gelten, hängt davon ab, welcher Schlüssel die Anfrage stellt. Der gemeinsame Community-Schlüssel ist ein kostenpflichtiger Gemini-API-Schlüssel; für jede damit gestellte Anfrage gelten die Bedingungen der kostenpflichtigen Gemini-API: Google nutzt Ihren Code nicht zum Training seiner Modelle. Nutzen Sie Ihren eigenen Schlüssel (BYOK), gelten die Bedingungen Ihres eigenen Google-Kontos — ein Schlüssel im kostenlosen Tarif unterliegt den davon abweichenden Free-Tier-Bedingungen. Welche Bedingungen gelten, hängt also vom verwendeten Schlüssel ab; in den Einstellungen ist sichtbar, welcher gerade aktiv ist.
              </p>
            </div>
          </section>

          <section id="hosting" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              4. Hosting und Auftragsverarbeiter
            </h2>
            <p className="text-base mb-4">
              Für den Betrieb dieses Dienstes setzen wir die folgenden Auftragsverarbeiter ein:
            </p>
            <ul className="list-disc pl-5 space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-800">Google Cloud Platform und Firebase:</strong> Hosting, Authentifizierung und Datenbankbetrieb auf europäischen Servern in der Region <strong>Belgien (europe-west1)</strong> — Datenhaltung in der EU, betrieben nach den Anforderungen der DSGVO.
              </li>
              <li>
                <strong className="text-gray-800">Google-Gemini-API:</strong> generative KI-Modelle, ausschließlich für die Code-Transformation, über gesicherte zustandslose Proxy-Schichten.
              </li>
              <li>
                <strong className="text-gray-800">Resend:</strong> Versand transaktionaler E-Mails (etwa Freigabe- und Statusbenachrichtigungen). Ihre E-Mail-Adresse wird verarbeitet, um diese Nachrichten zu versenden.
              </li>
            </ul>
            <p className="text-sm text-gray-500 mt-4">
              <strong>Drittlandübermittlung:</strong> Google und Resend sind US-amerikanische Anbieter. Beide sind unter dem EU-U.S. Data Privacy Framework zertifiziert; eine Übermittlung an sie stützt sich daher auf den Angemessenheitsbeschluss der Europäischen Kommission vom 10.&nbsp;Juli&nbsp;2023 (Art. 45 DSGVO). Soweit eine Übermittlung davon nicht erfasst ist, ist sie durch die EU-Standardvertragsklauseln (Art. 46 DSGVO) zusammen mit den Auftragsverarbeitungsbedingungen der Anbieter abgesichert. Eine Kopie dieser Garantien können Sie jederzeit anfordern (Art. 13 Abs. 1 lit. f DSGVO) — schreiben Sie an <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>. Hosting und Speicherung Ihrer Projekte verbleiben in der EU (europe-west1).
            </p>
          </section>

          <section id="your-rights" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              5. Ihre Rechte nach der DSGVO (einschließlich Löschung nach Art. 17)
            </h2>
            <p className="text-base mb-4">
              Da unsere Plattform nach den Vorgaben der EU betrieben wird, stehen Ihnen sämtliche Rechte der Datenschutz-Grundverordnung zu:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600">
              <li>Recht auf Auskunft (Art. 15 DSGVO)</li>
              <li>Recht auf Berichtigung (Art. 16 DSGVO)</li>
              <li>Recht auf Löschung / „Recht auf Vergessenwerden" (Art. 17 DSGVO)</li>
              <li>Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO)</li>
              <li>Recht auf Datenübertragbarkeit (Art. 20 DSGVO)</li>
              <li><strong className="text-gray-800">Widerspruchsrecht (Art. 21 DSGVO)</strong> — siehe den Kasten unten</li>
              <li>Recht auf Widerruf einer Einwilligung (Art. 7 Abs. 3 DSGVO)</li>
              <li>Recht auf Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO)</li>
            </ul>
            <div className="mt-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
              <p className="text-sm text-amber-900 font-black uppercase tracking-wider mb-2">
                Ihr Widerspruchsrecht (Art. 21 DSGVO)
              </p>
              <p className="text-sm text-amber-900">
                Soweit wir Ihre Daten auf Grundlage unseres berechtigten Interesses verarbeiten (Art. 6 Abs. 1 lit. f DSGVO — Betrieb und Sicherheit der Plattform, das Sicherheits-Protokoll und die von Ihnen versandten Einladungen), <strong>haben Sie das Recht, jederzeit aus Gründen, die sich aus Ihrer besonderen Situation ergeben, Widerspruch einzulegen</strong>. Richten Sie den Widerspruch an <a href="mailto:info@clean-core.io" className="underline font-semibold">info@clean-core.io</a>; ein Satz, der die betroffene Verarbeitung benennt, genügt. Wir stellen die Verarbeitung dann ein, es sei denn, wir können zwingende schutzwürdige Gründe nachweisen, die Ihre Interessen, Rechte und Freiheiten überwiegen, oder die Verarbeitung dient der Geltendmachung, Ausübung oder Verteidigung von Rechtsansprüchen. Direktwerbung betreiben wir nicht; der voraussetzungslose Widerspruch nach Art. 21 Abs. 2 DSGVO kommt hier daher nicht zum Tragen.
              </p>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              Zur Ausübung dieser Rechte, insbesondere zur Löschung Ihrer Daten, können Sie die Kontolöschung unmittelbar in Ihren Profileinstellungen unter <strong>Danger Zone</strong> auslösen. Sie löscht Ihre Einträge in der Live-Datenbank und in der Authentifizierung sofort, einschließlich sämtlicher Projekte und des darin enthaltenen Quellcodes. Ein einzelnes Projekt können Sie jederzeit über Ihr Dashboard löschen. Restkopien in verschlüsselten Sicherungen laufen binnen 30 Tagen aus (siehe Abschnitt 6). Alternativ erreichen Sie uns unter <a href="mailto:info@clean-core.io" className="text-green-600 hover:underline font-semibold">info@clean-core.io</a>.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Was die Löschung nicht erreicht:</strong> zwei Dinge überdauern sie, und das zu sagen ist nützlicher als ein sauberer Satz. Das Sicherheits-Protokoll hält die administrativen Handlungen an einem Konto fest — Freigabe, Entzug, Löschung — samt betroffenem Konto, und zwar 24 Monate ab der Handlung; ohne es ließe sich eine privilegierte Handlung niemandem mehr zuordnen, und wir dürfen es nach Art. 17 Abs. 3 lit. e und Art. 6 Abs. 1 lit. f DSGVO behalten. Und „sofort" meint die Live-Datenbank und die Anmeldung: Kopien in verschlüsselten Sicherungen laufen nach ihrem eigenen Rhythmus aus, binnen 30 Tagen, und werden nicht gezielt wiederhergestellt. Alles Übrige geht sofort.
            </p>
            <p className="text-sm text-gray-500 mt-3">
              <strong>Aufsichtsbehörde:</strong> Sie können sich bei jeder Aufsichtsbehörde beschweren, insbesondere in dem Mitgliedstaat Ihres Aufenthaltsorts, Ihres Arbeitsplatzes oder des Orts des mutmaßlichen Verstoßes. Für uns zuständig ist das <a href="https://www.lda.bayern.de" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-semibold">Bayerische Landesamt für Datenschutzaufsicht (BayLDA)</a>, Promenade 18, 91522 Ansbach, Deutschland.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              6. Rechtsgrundlagen und Speicherdauer
            </h2>
            <p className="text-base mb-3">
              <strong>Rechtsgrundlage (Art. 6 DSGVO):</strong> Die Rechtsgrundlage ist in Abschnitt 2 bei jedem Zweck einzeln genannt, weil ein pauschaler Satz Ihnen nicht sagt, welche Norm welche Verarbeitung trägt. Zusammengefasst: Erfüllung der von Ihnen angeforderten Leistung (Art. 6 Abs. 1 lit. b), Betrieb und Sicherheit der Plattform als berechtigtes Interesse (Art. 6 Abs. 1 lit. f) sowie Ihre Einwilligung, wo etwas freiwillig ist (Art. 6 Abs. 1 lit. a), die Sie jederzeit mit Wirkung für die Zukunft widerrufen können. Der in Abschnitt 8 beschriebene Notfallzugriff stützt sich auf Art. 6 Abs. 1 lit. f DSGVO — den Schutz der Plattform und ihrer Nutzer vor schädlichen Inhalten.
            </p>
            <p className="text-base mb-3">
              <strong>Speicherdauer:</strong> Personenbezogene Daten werden für die Dauer Ihres Kontos gespeichert und mit der Kontolöschung entfernt (Art. 17); Restkopien in verschlüsselten Sicherungen laufen binnen 30 Tagen aus. Die Fristen, die nicht einfach „solange das Konto besteht" lauten:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-sm text-gray-600 mb-3">
              <li><strong className="text-gray-800">Server- und Zugriffsprotokolle:</strong> 30 Tage (siehe Abschnitt 9).</li>
              <li><strong className="text-gray-800">Verschlüsselte Sicherungen:</strong> eine tägliche Kopie 7 Tage lang und eine wöchentliche 28 Tage lang, sodass nichts über 30 Tage hinaus überdauert.</li>
              <li><strong className="text-gray-800">Sicherheits-Protokoll:</strong> 24 Monate ab der protokollierten Handlung, danach gelöscht. Die Frist deckt zwei Jahresprüfungen ab und hält privilegierte Handlungen lange genug nachvollziehbar, ohne Identitäten von Administratoren unbefristet vorzuhalten.</li>
              <li><strong className="text-gray-800">Zähler des Ratenlimits:</strong> sie laufen mit ihrem eigenen Zeitfenster ab, Minuten bis Stunden. Der Schlüssel ist ein gesalzener Hash; eine Adresse steht dort in lesbarer Form nicht.</li>
              <li><strong className="text-gray-800">Ihr eigener Gemini-Schlüssel und Ihr Google-Profilbild:</strong> solange Sie sie behalten — der Schlüssel, bis Sie ihn in den Einstellungen löschen oder das Konto geht, der Verweis auf das Bild, bis das Konto geht.</li>
            </ul>
            <p className="text-base mb-3">
              Die Speicherdauer je Sammlung ist in <a href="https://github.com/sonnyfrenzel-rgb/clean-core.io/blob/main/docs/DATA-RETENTION.md" target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline font-semibold">docs/DATA-RETENTION.md</a> in unserem öffentlichen Quellcode-Repository dokumentiert — als zusätzliche Transparenz, nicht als die Stelle, an der Sie nachsehen müssen.
            </p>
            <p className="text-base">
              <strong>Keine automatisierte Entscheidung im Einzelfall (Art. 22 DSGVO):</strong> Wir setzen KI-Modelle ein, um den von Ihnen hochgeladenen Code zu analysieren und zu transformieren. Sie erzeugen Text, Diagramme und Code — über Sie entscheiden sie nicht. Eine automatisierte Entscheidungsfindung einschließlich Profiling, die Ihnen gegenüber rechtliche Wirkung entfaltet oder Sie in ähnlicher Weise erheblich beeinträchtigt, findet nicht statt. Ob ein Konto freigegeben, eingeschränkt oder gelöscht wird, entscheidet ein Mensch.
            </p>
          </section>

          <section id="cookies" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              7. Cookies und Tracking
            </h2>
            <p className="text-base">
              <strong className="text-gray-800">Wir setzen überhaupt keine Cookies.</strong> Rufen Sie eine Seite auf, ohne sich anzumelden, bleibt Ihr Browser genau so, wie er war: kein Cookie, keine lokale Speicherung, keine Sitzungsspeicherung und keine Anfrage an irgendjemanden außer uns. Wir setzen keine Analyse-, Werbe- oder Tracking-Cookies ein und binden keine Marketing- oder Profiling-Tracker Dritter ein — kein reCAPTCHA, kein App Check, keine Leistungs- oder Nutzungsmessung.
            </p>
            <p className="text-base mb-3">
              Mit der Anmeldung kommen zwei Dinge hinzu, beide auf Ihrem eigenen Gerät. Google Firebase Authentication hält Ihre Sitzung in der <strong>IndexedDB</strong> Ihres Browsers, damit Sie zwischen Besuchen angemeldet bleiben; ohne sie müssten Sie sich auf jeder Seite neu anmelden. Und die Oberfläche merkt sich Ihre eigenen Entscheidungen in der lokalen Speicherung: welche Hinweise Sie weggeklickt haben (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.workspace.coachMarks.dismissed</code>), ob Sie den ersten Blick gesehen haben (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.workspace.firstLook.seen</code>) und die Einführung im Projektdialog (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.newProject.introSeen</code>), wie Sie die Demo verlassen haben (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cleancore.demo.v1</code>) und welches Bestätigungsband Sie geschlossen haben (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">signoff-banner-dismissed-…</code>). In der Sitzungsspeicherung, die Ihr Browser beim Schließen verwirft: ein weggeklicktes Hinweisband, eine Sperre, die eine fehlgeschlagene Seite nicht in eine Neuladeschleife laufen lässt, und — falls Sie einen Hinweis auf geänderte Nutzungsbedingungen zurückgestellt haben — welche Fassung Sie zurückgestellt haben (<code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">cc.terms.declined.…</code>), damit Sie erst bei der nächsten Anmeldung wieder gefragt werden und nicht auf jeder Seite.
            </p>
            <p className="text-base">
              Nichts aus dieser zweiten Gruppe verlässt jemals Ihren Browser: wir lesen es nicht, es wird nicht an unseren Server gesendet und mit niemandem geteilt. Nach unserer Bewertung handelt es sich um Speicherung, die für die von Ihnen ausdrücklich gewünschte Leistung unbedingt erforderlich ist, sodass kein Cookie-Banner erforderlich ist (§ 25 Abs. 2 TDDDG / ePrivacy-Richtlinie) — und da es nichts gibt, womit sich nachverfolgen ließe, gibt es auch nichts, wovor ein Banner Sie schützen würde.
            </p>
          </section>

          <section id="project-access" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              8. Wer Ihre Projekte öffnen kann
            </h2>
            <p className="text-base mb-3">
              Nur das Konto, das ein Projekt angelegt hat, kann es öffnen — einschließlich des darin enthaltenen ABAP-Quellcodes — und wen dieses Konto zum Lesen eingeladen hat. Kein Konto, das Sie nicht eingeladen haben, hat stehenden Zugriff, und unser Administratorkonto ebenfalls nicht: die Sicherheitsregeln, die jeden Lesezugriff aus dem Browser bestimmen — veröffentlicht als <code className="text-sm font-mono bg-gray-100 px-1.5 py-0.5 rounded">firestore.rules</code> in unserem öffentlichen Quellcode-Repository, wo Sie sie selbst nachlesen können —, gewähren den Zugriff dem Eigentümer und den von ihm eingeladenen Konten, sonst niemandem.
            </p>
            <p className="text-base mb-3">
              <strong className="text-gray-800">Eine Einladung erlaubt nur das Lesen, und Sie können sie zurücknehmen.</strong> Sie laden jemanden ein, indem Sie dessen E-Mail-Adresse eingeben; wir senden einen Link an diese Adresse. Der Link öffnet sich ausschließlich für ein angemeldetes Konto, dessen eigene, bestätigte E-Mail-Adresse die von Ihnen eingeladene ist — ein weitergeleiteter Link öffnet für niemanden sonst etwas. Gewährt wird das Lesen des gesamten Projekts, <strong>einschließlich des von Ihnen hochgeladenen ABAP-Quellcodes</strong>, und nichts darüber hinaus: Analysieren, Bestätigen, Signieren und Exportieren bleiben bei Ihnen. Eine Einladung läuft von selbst ab — nach vierzehn Tagen, sofern Sie nichts anderes wählen, und spätestens nach neunzig. Je Projekt können höchstens drei Einladungen gleichzeitig offen sein, und Sie sehen jederzeit, wer Zugriff hat, und können ihn entziehen. Ein Entzug wirkt unmittelbar in den Sicherheitsregeln selbst, nicht nur in dem, was der Bildschirm zeigt. Was die andere Person bereits gelesen oder heruntergeladen hat, ist bei ihr — wie bei jedem Dokument, das man jemandem aushändigt.
            </p>
            <p className="text-base mb-3">
              Die von Ihnen eingegebene Adresse speichern wir zusammen mit der Einladung, weil der Link gegen sie geprüft werden muss und weil Sie sehen können müssen, wen Sie eingeladen haben. Kein Browser kann sie lesen, auch Ihrer nicht — Ihre Übersicht darüber, wer Zugriff hat, beantwortet unser Server, und sie nennt nur die Personen, die tatsächlich angenommen haben. Die Einladung wird mit dem Projekt gelöscht, und sie wird gelöscht, wenn die darin genannte Person ihr Clean-Core.io-Konto löscht. Da wir diese Adresse nicht bei der betroffenen Person selbst erhoben haben, informiert die Einladungsmail sie darüber, was wir speichern, warum, auf welcher Grundlage und wie lange (Art. 14 DSGVO), und nennt die Rechte aus Abschnitt 5 — einschließlich des Widerspruchsrechts nach Art. 21. Die Adresse verarbeiten wir auf Grundlage unseres berechtigten Interesses am Betrieb der Teilen-Funktion, um die ein Nutzer gebeten hat (Art. 6 Abs. 1 lit. f DSGVO).
            </p>
            <p className="text-base">
              Die einzige Ausnahme ist ein Notfall, etwa ein begründeter Hinweis, dass ein Upload Schadcode enthält. Der Zugriff auf ein Projekt ist dann eine bewusste Handlung des Betreibers auf dem Server, keine dauerhaft offenstehende Berechtigung, und er wird protokolliert. Administrative Handlungen an einem Konto — Freigabe, Entzug des Zugangs und Löschung — werden ebenfalls in einem Protokoll mit handelndem Administrator, betroffenem Konto und Zeitpunkt festgehalten. Abgesehen von den Personen, die Sie selbst einladen, geben wir Projektinhalte an niemanden weiter außer an die in Abschnitt 4 genannten Auftragsverarbeiter.
            </p>
          </section>

          <section id="server-logs" className="scroll-mt-20">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-wider mb-3">
              9. Serverprotokolle
            </h2>
            <p className="text-base mb-3">
              Alles Bisherige betrifft Menschen mit einem Konto. Dieser Abschnitt betrifft alle, denn ein Webserver kann eine Anfrage nicht beantworten, ohne zu sehen, wohin er antworten soll.
            </p>
            <p className="text-base mb-3">
              Wenn Sie eine Seite öffnen oder unser Server in Ihrem Auftrag ein Modell aufruft, protokolliert unser Hosting die Anfrage: Ihre <strong>IP-Adresse</strong>, Datum und Uhrzeit, den angefragten Pfad, den Antwortstatus, die übertragene Datenmenge, die verweisende Seite und die Kennung Ihres Browsers. Diese Protokolle gibt es, um den Dienst am Laufen und sicher zu halten — um einen Fehler zu finden, in den Sie geraten sind, um zu sehen, dass eine Route scheitert, und um Missbrauch zu erkennen. Wir bilden damit kein Profil, und sie werden nicht mit Ihrem Konto verknüpft, um Ihr Verhalten auszuwerten. <em>Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO — unser berechtigtes Interesse an Betrieb und Sicherheit der Plattform.</em>
            </p>
            <p className="text-base mb-3">
              Sie werden <strong>30 Tage</strong> aufbewahrt und danach von Google Cloud Logging automatisch gelöscht. Dasselbe gilt für die Fehlerberichte, die unsere Anwendung schreibt, wenn etwas schiefgeht.
            </p>
            <p className="text-base">
              Ein verwandter Datensatz: Damit ein einzelner Aufrufer weder das kostenlose Kontingent noch den Mailweg erschöpft, zählen wir Anfragen je Aufrufer in einem kurzen gleitenden Fenster. Die Kennung dieses Zählers ist ein <strong>gesalzener Hash</strong> aus Konto und IP-Adresse, nie die Adresse selbst, und der Datensatz läuft mit seinem Fenster ab — Minuten bis Stunden. Der Verarbeitung in diesem Abschnitt können Sie jederzeit nach Art. 21 DSGVO widersprechen; siehe Abschnitt 5.
            </p>
          </section>

          <div className="pt-8 border-t border-gray-100 text-center text-[10px] text-gray-400 font-black font-mono uppercase tracking-wider">
            Clean-Core.io {APP_VERSION} ({APP_RELEASE_DATE_DE})
          </div>
        </div>
      </main>
    </div>
  );
}
