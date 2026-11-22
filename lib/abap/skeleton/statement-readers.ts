import type { AbapStatement } from '../statement-reader';
import type { BlockStructure } from '../block-structure';

/**
 * Readers over one statement (or one statement and the blocks around it) that more than one skeleton pass asks —
 * engine 4 phase 3. Moved out of `process-skeleton.ts` unchanged; each is a pure function of its arguments.
 */

/**
 * `LEAVE SCREEN`, `LEAVE TO SCREEN n` and `LEAVE LIST-PROCESSING` — the words
 * of the statement that leaves, or `null`.
 *
 * All three end the processing of the current dialog step on the spot: the
 * runtime goes on with the next screen (or back to the caller for screen 0),
 * resp. with the screen list processing was started from — never with the
 * statement after it. Until 27.09.2026 they fell through to the branch for
 * moves and calculations, and the walk carried on as if the module went on:
 * `WHEN 'BACK'. LEAVE TO SCREEN 0.` led straight into the save of the next arm.
 * They leave the block from wherever they stand, exactly as a `RETURN` does, so
 * they end the same way (ADR-054, `leaveEarly`).
 *
 * `LEAVE TO LIST-PROCESSING` is the opposite and is not here: it only switches
 * the output of the current step to a list, and the statement after it runs.
 */
export function leavesDialogStep(text: string): string | null {
  const m = /^LEAVE\s+(TO\s+SCREEN|SCREEN|LIST-PROCESSING)\b/i.exec(text);
  return m ? `LEAVE ${m[1].replace(/\s+/g, ' ').toUpperCase()}` : null;
}

/** The words that open or close a parameter section of a `FORM` or `METHODS` signature. */
const SIGNATURE_WORDS = /\b(?:IMPORTING|EXPORTING|CHANGING|RETURNING|RAISING|EXCEPTIONS|USING|TABLES|REDEFINITION|ABSTRACT|FINAL)\b/gi;

/**
 * ADR-066 — the parameter names, upper-cased, in the signature sections whose
 * opening word `sections` matches (`CHANGING` of a FORM; `EXPORTING`,
 * `CHANGING`, `RETURNING` of a method). A typed section is read by its
 * `TYPE`/`LIKE`/`STRUCTURE` words; an untyped one (`CHANGING cv_ok cv_msg`)
 * is all names.
 */
export function resultParameters(signature: string, sections: RegExp): string[] {
  const text = signature.replace(/\.\s*$/, '');
  const marks = [...text.matchAll(SIGNATURE_WORDS)];
  const out: string[] = [];
  marks.forEach((mark, k) => {
    if (!sections.test(mark[0])) return;
    const from = (mark.index ?? 0) + mark[0].length;
    const body = text.slice(from, k + 1 < marks.length ? marks[k + 1].index : text.length);
    if (/\b(?:TYPE|LIKE|STRUCTURE)\b/i.test(body)) {
      for (const p of body.matchAll(/(?:^|\s)(?:(?:VALUE|REFERENCE)\(\s*([\w/]+)\s*\)|([\w/]+))\s+(?:TYPE|LIKE|STRUCTURE)\b/gi)) {
        out.push((p[1] ?? p[2]).toUpperCase());
      }
      return;
    }
    for (const token of body.trim().split(/\s+/)) {
      const name = /^(?:(?:VALUE|REFERENCE)\(\s*)?([\w/]+)\)?$/i.exec(token)?.[1];
      if (name) out.push(name.toUpperCase());
    }
  });
  return out;
}

/**
 * ADR-066 — the data object a statement assigns as a whole or in a component,
 * upper-cased, or `null`: `x = …`, `x-comp = …`, `APPEND … TO x`, `INSERT …
 * INTO [TABLE] x`, `COLLECT … INTO x`, `MOVE … TO x`, `CLEAR x`.
 */
export function assignmentTarget(text: string): string | null {
  const direct = /^([\w/]+)(?:-[\w/-]+)?\s*\??=(?!=)/.exec(text);
  if (direct) return direct[1].toUpperCase();
  const into = /^(?:APPEND|INSERT|COLLECT)\b[\s\S]*?\b(?:TO|INTO(?:\s+TABLE)?)\s+([\w/]+)/i.exec(text);
  if (into) return into[1].toUpperCase();
  const move = /^MOVE(?:-CORRESPONDING)?\b[\s\S]*\bTO\s+([\w/]+)/i.exec(text);
  if (move) return move[1].toUpperCase();
  const clear = /^(?:CLEAR|FREE|REFRESH)\s+([\w/]+)/i.exec(text);
  return clear ? clear[1].toUpperCase() : null;
}

/** The class whose `IMPLEMENTATION` encloses this statement, upper-cased, or `null`. */
export function classOf(statements: readonly AbapStatement[], structure: BlockStructure, index: number): string | null {
  const enclosing = structure.enclosing[index] ?? [];
  for (let i = enclosing.length - 1; i >= 0; i--) {
    if (enclosing[i].kind !== 'class') continue;
    const m = /^CLASS\s+([\w/]+)\s+IMPLEMENTATION\b/i.exec(statements[enclosing[i].openIndex].text);
    return m ? m[1].toUpperCase() : null;
  }
  return null;
}
