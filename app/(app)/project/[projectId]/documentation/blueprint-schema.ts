/**
 * The shape this stage can actually render — checked before anything is stored.
 *
 * The blueprint is written by a language model and parsed with `extractJSON`,
 * which only proves that the text was JSON. It proved nothing about the types,
 * and the page reads several fields as arrays without asking:
 *
 *   - `parsedDoc.l4_tasks.find(…)`          (page.tsx, handleNodeClick)
 *   - `(parsedDoc.l4_tasks || []).map(…)`   (the Confluence export and the L4 grid)
 *   - `(parsedDoc.l2_group?.kpis || []).map(…)` (the KPI pills and the export)
 *   - `(activeTask.inputs || []).map(…)`, `(activeTask.outputs || []).map(…)`,
 *     `(task.inputs || []).join(', ')`      (the task drawer and the export)
 *   - `tasks?.find(…)`, `flow.find/map/forEach` (components/ProcessFlow.tsx)
 *
 * `{}` is truthy, so every `|| []` fallback waves an object through and the
 * next line asks it for `.map`. The result was a `TypeError` during render —
 * and because the document had already been written with `status: 'documented'`,
 * it came back on every reload. The only escape was the "Regenerate" button,
 * which the root error boundary had just taken off the screen with the rest of
 * the page.
 *
 * So the check runs twice, and the earlier of the two is the one that matters:
 * before the write, a document that fails it is a generation failure and is not
 * stored; before the render, the same check turns a document stored by an
 * earlier build into an explained empty state instead of a crash.
 *
 * It checks types, not content. Nothing here judges whether the model wrote a
 * good blueprint — only whether the page can draw what it wrote.
 */

/** A plain `{…}` — not null, not an array. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const typeName = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
};

/** Every field this module insists on, in the words the reader sees. */
export type BlueprintProblem = string;

export interface BlueprintCheck {
  ok: boolean;
  /** Empty when `ok`. One sentence per field that has the wrong type. */
  problems: BlueprintProblem[];
}

/** `inputs`, `outputs`, `systems` on one L4 task — read with `.map` and `.join`. */
const TASK_LIST_FIELDS = ['inputs', 'outputs', 'systems'] as const;

/**
 * Does this parsed blueprint have the shape the documentation stage renders?
 *
 * Absent fields are allowed wherever the page already guards for absence: the
 * complaint is about a field that is *there* and is not what it is read as.
 */
export function checkBlueprintShape(parsed: unknown): BlueprintCheck {
  const problems: BlueprintProblem[] = [];

  if (!isPlainObject(parsed)) {
    return { ok: false, problems: [`The blueprint is ${typeName(parsed)}, not a JSON object.`] };
  }

  if (!isPlainObject(parsed.l1_domain)) {
    problems.push(
      parsed.l1_domain === undefined
        ? 'The business domain (`l1_domain`) is missing.'
        : `The business domain (\`l1_domain\`) is ${typeName(parsed.l1_domain)}, not an object.`,
    );
  }

  if (parsed.l2_group !== undefined) {
    if (!isPlainObject(parsed.l2_group)) {
      problems.push(`The process group (\`l2_group\`) is ${typeName(parsed.l2_group)}, not an object.`);
    } else if (parsed.l2_group.kpis !== undefined && !Array.isArray(parsed.l2_group.kpis)) {
      problems.push(`The KPIs (\`l2_group.kpis\`) are ${typeName(parsed.l2_group.kpis)}, not a list.`);
    }
  }

  if (parsed.l3_flow !== undefined) {
    if (!Array.isArray(parsed.l3_flow)) {
      problems.push(`The process flow (\`l3_flow\`) is ${typeName(parsed.l3_flow)}, not a list.`);
    } else {
      parsed.l3_flow.forEach((node, i) => {
        if (!isPlainObject(node)) {
          problems.push(`Flow element ${i + 1} (\`l3_flow[${i}]\`) is ${typeName(node)}, not an object.`);
          return;
        }
        if (typeof node.id !== 'string' || node.id.trim() === '') {
          problems.push(`Flow element ${i + 1} (\`l3_flow[${i}]\`) has no \`id\`.`);
        }
        if (node.next !== undefined && !Array.isArray(node.next)) {
          problems.push(`The successors of flow element ${i + 1} (\`l3_flow[${i}].next\`) are ${typeName(node.next)}, not a list.`);
        }
      });
    }
  }

  if (parsed.l4_tasks !== undefined) {
    if (!Array.isArray(parsed.l4_tasks)) {
      problems.push(`The task list (\`l4_tasks\`) is ${typeName(parsed.l4_tasks)}, not a list.`);
    } else {
      parsed.l4_tasks.forEach((task, i) => {
        if (!isPlainObject(task)) {
          problems.push(`Task ${i + 1} (\`l4_tasks[${i}]\`) is ${typeName(task)}, not an object.`);
          return;
        }
        for (const field of TASK_LIST_FIELDS) {
          if (task[field] !== undefined && !Array.isArray(task[field])) {
            problems.push(`\`l4_tasks[${i}].${field}\` is ${typeName(task[field])}, not a list.`);
          }
        }
      });
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * What the reader is told when a freshly generated blueprint is refused.
 *
 * It says what was wrong and that generating again is the way forward. It does
 * not say why the model answered like that, because nothing here knows: the
 * model is not asked for a reason and does not give one.
 */
export function blueprintRejectionMessage(problems: BlueprintProblem[]): string {
  const list = problems.slice(0, 4).join(' ');
  const more = problems.length > 4 ? ` (and ${problems.length - 4} more.)` : '';
  return (
    `The model's answer was not a blueprint this stage can display, so nothing was saved. ${list}${more} ` +
    'Why the model answered this way is not recorded. Generate again; the previous blueprint, if there was one, is untouched.'
  );
}

/** The same refusal, for a blueprint an earlier build had already stored. */
export const STORED_BLUEPRINT_REJECTED =
  'A blueprint is stored for this project, but it does not have the shape this stage can display, so it is not shown. ' +
  'Why it was stored in this form is not recorded. Generating again replaces it.';
