/**
 * What the live region of `CcRunIndicator` says after a render — rule 3 of
 * `DESIGN.md` §2.8: one announcement per stage, on its transition into `done`.
 *
 * Every stage that became `done` since the last call is named, in stage order,
 * in one sentence. Setting the region once per stage inside a loop let React
 * batch the updates into the last one: two stages finishing in the same render
 * (or already done on mount) announced only the second, and the `announced` set
 * then kept the first from ever being said (QA full review of v2.20.0,
 * 861649f16b0f).
 *
 * `announced` is mutated: the ids named here are added, so a re-render — or a
 * counter ticking — cannot name them again. Returns `null` when nothing new
 * finished, so the caller leaves the region as it is.
 */
export function newlyDoneAnnouncement(
  stages: readonly { id: string; label: string; status: string; result?: string }[],
  announced: Set<string>,
): string | null {
  const said: string[] = [];
  for (const stage of stages) {
    if (stage.status !== 'done' || announced.has(stage.id)) continue;
    announced.add(stage.id);
    said.push(stage.result ? `${stage.label}: ${stage.result}` : stage.label);
  }
  return said.length > 0 ? said.join('. ') : null;
}
