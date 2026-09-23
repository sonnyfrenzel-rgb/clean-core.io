import { test, expect } from '@playwright/test';
import { compareAll, type SkeletonMutation } from './helpers/korpus-comparison';
import type { SkeletonEdge, SkeletonNode, ProcessSkeleton } from '../lib/abap/process-skeleton';

/**
 * Empfindlichkeitsprobe des Korpus-Vergleichers (Roadmap 1.9).
 *
 * Ein Vergleicher, der bei verfälschter Engine-Antwort grün bleibt, misst
 * nichts — und genau das war der Zustand bis zum 22.09.2026: `compareSkeleton`
 * rief `buildProcessFacts` und verglich zeilenweise gegen Verzweigungen und
 * Blöcke, weder Knotenart noch Kante. Eine Änderung am Skelett konnte dort
 * nicht rot werden.
 *
 * Diese Datei dreht die Frage um: sie verfälscht **das Gelesene**, nicht die
 * Engine (`lib/` wird nicht angefasst), und besteht darauf, dass jede
 * Verfälschung in der Facette `skelett` rot wird. Fällt einer dieser Tests, ist
 * nicht die Engine kaputt, sondern der Vergleicher blind geworden.
 *
 * **Was diese Proben nicht sind.** Die Roadmap 1.9 nennt „die sechs Mutanten
 * M01–M06 des Gegenreviews". Die liegen im privaten Prüfpaket
 * `clean-core-review-c5085bb.zip` (§15) und **nicht in diesem Repository**;
 * eine Suche über `tests/`, `docs/` und `scripts/` findet sie nirgends. Sie
 * hier nach Gutdünken nachzubauen hieße, sechs erfundene Proben unter ihrem
 * Namen zu führen und die Abnahme an der eigenen Erfindung zu messen. Die
 * sieben Proben unten sind deshalb eigene, benannte Verfälschungen; M01–M06
 * bleiben offen, bis das Prüfpaket vorliegt.
 */

type Probe = {
  name: string;
  why: string;
  mutate: SkeletonMutation;
  /**
   * Auf `false`, wenn die Verfälschung keinen übereinstimmenden Fall mehr zum
   * Fallen bringen **kann**, weil keiner der grünen Fälle das Konstrukt noch
   * enthält. Die Probe misst dann, dass der Vergleicher die Verfälschung
   * überhaupt sieht — schwächer, und mit einer Begründung an der Probe, die
   * sagt warum.
   */
  green?: false;
};

const withNodes = (skeleton: ProcessSkeleton, nodes: SkeletonNode[]): ProcessSkeleton => ({ ...skeleton, nodes });
const withEdges = (skeleton: ProcessSkeleton, edges: SkeletonEdge[]): ProcessSkeleton => ({ ...skeleton, edges });

const PROBES: Probe[] = [
  {
    name: 'S1 — die Rücksprungkante wird eine gewöhnliche Sequenz',
    why: 'Ohne `loop-back` ist eine Schleife im Export ein Faden, der zurückzeigt, und kein Zyklus (2.17 b).',
    // **Seit Roadmap 2.17 (b) kann diese Probe keinen grünen Fall mehr fällen,
    // und das ist gemessen, nicht vermutet.** Ein `LOOP AT` über eine Tabelle,
    // dessen Körper den Block nicht verlässt, ist keine Schleife mit
    // Rücksprungkante mehr, sondern eine Mehrfach-Instanz-Aktivität, die ihren
    // Körper enthält. Im Korpus bleiben genau vier `loop-back`-Kanten übrig, in
    // CC-030 und CC-048 — beide stimmen in der Facette `skelett` ohnehin nicht
    // überein. Von den 16 grünen Fällen trägt **keiner** noch einen
    // Schleifenknoten; der einzige, der einen trug, war CC-007, und der ist mit
    // 2.17 (b) selbst auf `disagree` gegangen (siehe `tests/korpus/baseline.json`).
    // Die Probe misst deshalb, dass der Vergleicher die Verfälschung überhaupt
    // noch sieht. Sie hier grün zu machen, indem man eine andere Verfälschung
    // unter denselben Namen setzt, wäre die Empfindlichkeitsprobe an der eigenen
    // Erfindung gemessen — genau das, was der Kopf dieser Datei verbietet.
    green: false,
    mutate: (skeleton) =>
      withEdges(
        skeleton,
        skeleton.edges.map((edge) => (edge.kind === 'loop-back' ? { ...edge, kind: 'sequence' } : edge)),
      ),
  },
  {
    name: 'S2 — jedes Gateway wird eine Aktivität',
    why: 'Genau die Änderung, die 2.15 an technischen Gateways vornimmt: sie muss am Korpus sichtbar werden.',
    mutate: (skeleton) =>
      withNodes(
        skeleton,
        skeleton.nodes.map((node) => (node.kind === 'gateway' ? { ...node, kind: 'task' } : node)),
      ),
  },
  {
    name: 'S3 — der Leseknoten entfällt',
    why: 'Ein verschwundener Datenspeicher ist die Art Verlust, die eine Ampel melden muss.',
    mutate: (skeleton) => withNodes(skeleton, skeleton.nodes.filter((node) => node.kind !== 'read')),
  },
  {
    name: 'S4 — die bedingte Kante verliert ihre Bedingung',
    why: 'Eine Entscheidung ohne bedingte Ausgänge ist keine Entscheidung mehr.',
    mutate: (skeleton) =>
      withEdges(
        skeleton,
        skeleton.edges.map((edge) => (edge.kind === 'conditional' ? { ...edge, kind: 'sequence' } : edge)),
      ),
  },
  {
    name: 'S5 — jeder Anker verrutscht um drei Zeilen',
    why: 'Der Anker ist die halbe Identität eines Knotens (Regel 7); ein verrutschter Anker ist ein falscher Beleg.',
    mutate: (skeleton) =>
      withNodes(
        skeleton,
        skeleton.nodes.map((node) =>
          node.anchor
            ? { ...node, anchor: { ...node.anchor, lineStart: node.anchor.lineStart + 3, lineEnd: node.anchor.lineEnd + 3 } }
            : node,
        ),
      ),
  },
  {
    name: 'S6 — eine Kante fehlt',
    why: 'Der Fluss ist die Aussage des Skeletts; ein fehlender Fluss zerlegt den Prozess still in Teile.',
    mutate: (skeleton) => withEdges(skeleton, skeleton.edges.slice(1)),
  },
  {
    name: 'S7 — der Endknoten entfällt',
    why: 'Ein Prozess ohne Ende ist in BPMN kein Prozess, und der Korpus zeichnet je Abbruch ein Ende.',
    mutate: (skeleton) => withNodes(skeleton, skeleton.nodes.filter((node) => node.kind !== 'end')),
  },
];

const BASE = compareAll().filter((result) => result.class === 'skelett');
const GREEN = new Set(BASE.filter((result) => result.state === 'agree').map((result) => result.case));

test('der ungestörte Lauf hat überhaupt etwas Grünes, an dem sich rot werden lässt', () => {
  expect(GREEN.size, 'ohne einen einzigen übereinstimmenden Fall misst diese Probe nichts').toBeGreaterThan(5);
});

const BASE_BY_CASE = new Map(BASE.map((result) => [result.case, result]));

for (const probe of PROBES) {
  test(`${probe.name} wird in der Facette skelett rot`, () => {
    const mutated = compareAll(probe.mutate).filter((result) => result.class === 'skelett');

    if (probe.green === false) {
      // Kein grüner Fall trägt das Konstrukt mehr. Gemessen wird, dass der
      // Vergleicher die Verfälschung sieht: mindestens ein Fall berichtet nach
      // der Verfälschung etwas anderes als davor.
      const moved = mutated.filter((result) => {
        const before = BASE_BY_CASE.get(result.case);
        return before != null && (before.state !== result.state || before.evidence !== result.evidence);
      });
      expect(
        moved.map((result) => result.case),
        `${probe.why}\nDer Vergleicher sieht diese Verfälschung an keinem einzigen Fall mehr — weder an ` +
          `einem übereinstimmenden noch an einem abweichenden. Dann misst diese Probe nichts.`,
      ).not.toEqual([]);
      return;
    }

    const fell = mutated.filter((result) => GREEN.has(result.case) && result.state === 'disagree');
    expect(
      fell.length,
      `${probe.why}\nKein einziger übereinstimmender Fall ist gefallen — der Vergleicher sieht diese ` +
        `Verfälschung nicht. Das ist ein Defekt in tests/helpers/korpus-comparison.ts, nicht in lib/abap/.`,
    ).toBeGreaterThan(0);
  });
}
