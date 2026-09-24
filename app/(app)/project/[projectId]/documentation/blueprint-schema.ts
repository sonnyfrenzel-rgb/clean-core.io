/**
 * The shape of a **legacy** blueprint this stage can still render.
 *
 * Roadmap 3.0.5: nothing writes this form any more. The documentation is read
 * out of the code (`lib/process-documentation.ts`), and the model generator
 * that produced L1–L4 JSON is gone. Projects that stored one before keep it —
 * it is shown under a notice that says what it is — so this check now guards
 * only the read side: a stored legacy blueprint that the page cannot draw
 * becomes an explained empty state instead of a crash. The write-side half
 * described below went with the generator.
 *
 * The history, as it was:
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
 * A value React can put on the screen.
 *
 * The outer shapes were checked and the leaves inside them were not, which
 * leaves exactly the defect this module exists to prevent one level down: a
 * flow node with a string `id` and an array `next` passes, and then
 * `<span>{data.label}</span>` is handed an object and React throws *Objects are
 * not valid as a React child* — same crash, same unusable stage, same stored
 * document (QA review of 0cb64a5bd6e5, bc2a0948dafe).
 *
 * Only the leaves that really are React children are checked. `task.inputs`
 * elements go through `.join(', ')` and `stepId` through a template literal;
 * both turn an object into `[object Object]`, which is wrong on screen but does
 * not take the page down, and rejecting a whole blueprint over it would refuse
 * documents the stage can draw. Numbers are fine — React renders them.
 */
const isRenderable = (value: unknown): boolean => typeof value === 'string' || typeof value === 'number';

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
    } else if (Array.isArray(parsed.l2_group.kpis)) {
      // Each KPI is rendered on its own, `{kpi}` inside a pill — an object there
      // is the React-child crash, not a cosmetic wrong value.
      parsed.l2_group.kpis.forEach((kpi, i) => {
        if (!isRenderable(kpi)) {
          problems.push(`KPI ${i + 1} (\`l2_group.kpis[${i}]\`) is ${typeName(kpi)}, not text.`);
        }
      });
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
        } else if (Array.isArray(node.next)) {
          // Each one is looked up with `flow.find(n => n.id === nextId)` and used
          // as a key in the level map. A non-string never matches any node, so
          // the diagram silently loses an edge rather than crashing — still not
          // something to store as a drawing of this process.
          node.next.forEach((nextId, k) => {
            if (typeof nextId !== 'string') {
              problems.push(`Successor ${k + 1} of flow element ${i + 1} (\`l3_flow[${i}].next[${k}]\`) is ${typeName(nextId)}, not a name.`);
            }
          });
        }
        // `name` is the element's caption and `role` becomes its swimlane label
        // — both go straight into JSX in `components/ProcessFlow.tsx`.
        for (const field of ['name', 'role'] as const) {
          if (node[field] !== undefined && !isRenderable(node[field])) {
            problems.push(`The ${field === 'name' ? 'caption' : 'role'} of flow element ${i + 1} (\`l3_flow[${i}].${field}\`) is ${typeName(node[field])}, not text.`);
          }
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

/** The refusal, for a blueprint an earlier build had already stored. */
export const STORED_BLUEPRINT_REJECTED =
  'A blueprint is stored for this project, but it does not have the shape this stage can display, so it is not shown. ' +
  'Why it was stored in this form is not recorded. Generating again replaces it.';
