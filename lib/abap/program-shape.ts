import { readStatements } from './statement-reader';

/**
 * What kind of program a source is, read off the constructs SAP gives that kind (concept "Business-Lesbarkeit" H8) —
 * from engine 3.0.22 the purpose line of "In short" when the program's names support none (`program-domain.ts`).
 *
 * The concept measured that names carry a purpose for 6 of 7 examples but 4 of 150 benchmark programs: customer
 * programs are named in German or in codes. The constructs do not depend on the language. Each shape says only what
 * the construct itself means in SAP — who calls the code and when — never what it is for in the company:
 *
 *   - a BAdI implementation (`INTERFACES if_ex_…`, `METHOD if_ex_…~…`) and a customer exit (`FUNCTION exit_…`,
 *     `FORM userexit_…`) are enhancements SAP calls inside its own processing;
 *   - an output program (`FORM entry USING return_code us_screen`, the `NAST` record) is what SAP runs to print or
 *     send an output message;
 *   - an inbound IDoc function (`TABLES idoc_contrl … idoc_data`) processes incoming IDocs;
 *   - a BW extractor (`i_dsource`, `e_t_data`) hands data to SAP BW when a load asks for it.
 *
 * Null for anything else: a plain report is said by what it reads and changes. Pure.
 */

export interface ProgramShape {
  kind: 'badi' | 'customer-exit' | 'user-exit' | 'output-program' | 'idoc-inbound' | 'bw-extractor';
  /** The purpose sentence, sentence case, with the construct's name. */
  text: string;
  /** The lines it was read from. */
  lines: number[];
}

export function readProgramShape(source: string): ProgramShape | null {
  let statements;
  try {
    statements = readStatements(source);
  } catch {
    return null;
  }
  const find = (re: RegExp) => statements.find((s) => re.test(s.text));

  const badi = find(/^INTERFACES\s+(?:\/\w+\/)?if_ex_\w+/i) ?? find(/^METHOD\s+(?:\/\w+\/)?if_ex_\w+~/i);
  if (badi) {
    const name = /if_ex_(\w+?)(?:~|\s|$)/i.exec(badi.text)?.[1]?.toUpperCase() ?? '';
    return { kind: 'badi', text: `An enhancement SAP calls during its own processing (BAdI ${name}).`, lines: [badi.lineStart] };
  }
  const exit = find(/^FUNCTION\s+exit_\w+/i);
  if (exit) {
    const name = /^FUNCTION\s+(exit_\w+)/i.exec(exit.text)?.[1]?.toUpperCase() ?? '';
    return { kind: 'customer-exit', text: `An enhancement SAP calls during its own processing (customer exit ${name}).`, lines: [exit.lineStart] };
  }
  const userExit = find(/^FORM\s+userexit_\w+/i);
  if (userExit) {
    const name = /^FORM\s+(userexit_\w+)/i.exec(userExit.text)?.[1]?.toUpperCase() ?? '';
    return { kind: 'user-exit', text: `An enhancement SAP calls during its own processing (user exit ${name}).`, lines: [userExit.lineStart] };
  }
  const entry = find(/^FORM\s+\w+\s+USING\s+(?:VALUE\()?\s*\w*return_code\b[\s\S]*\bus_screen\b/i);
  const nast = find(/^TABLES\b[\s\S]*\bnast\b/i);
  if (entry && (nast || statements.some((s) => /\bnast-(?:objky|kschl|kappl)\b/i.test(s.text)))) {
    return {
      kind: 'output-program',
      text: 'An output program: SAP runs it to print or send an output message for a document.',
      lines: [entry.lineStart, ...(nast ? [nast.lineStart] : [])],
    };
  }
  const idoc = statements.find((s) => /^FUNCTION\b/i.test(s.text)) && statements.find((s) => /\bidoc_contrl\b/i.test(s.text))
    && statements.find((s) => /\bidoc_data\b/i.test(s.text));
  if (idoc) {
    const first = statements.find((s) => /\bidoc_contrl\b/i.test(s.text))!;
    return { kind: 'idoc-inbound', text: 'Processes incoming IDocs: SAP calls it for each IDoc that arrives for its process.', lines: [first.lineStart] };
  }
  const bw = find(/\bi_dsource\b/i);
  if (bw && statements.some((s) => /\be_t_data\b/i.test(s.text))) {
    return { kind: 'bw-extractor', text: 'A BW extractor: it hands data to SAP BW when a data load asks for it.', lines: [bw.lineStart] };
  }
  return null;
}
