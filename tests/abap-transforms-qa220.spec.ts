import { test, expect } from '@playwright/test';
import * as T from './helpers/abap-transforms';

/**
 * `renameLocals` has to rename a local everywhere the program uses it, and the
 * embedded expression of a string template is a use. It used to be classified
 * as literal text with the rest of the template, so the declaration and the
 * assignment were renamed and `|{ lv_price }|` kept the old name — a different
 * program, not the same one renamed (QA full review of fc787674705f,
 * 6d4c7e0b4125).
 */
test('a local inside a string template expression is renamed with the rest', () => {
  const code = ['DATA lv_price TYPE i.', 'lv_price = 1.', 'WRITE |Price: { lv_price } EUR|.'].join('\n');
  const renamed = T.renameLocals(code).code;
  expect(renamed).not.toMatch(/lv_price/i);
  const fresh = /DATA (\w+) TYPE i\./.exec(renamed)?.[1];
  expect(fresh, 'the declaration was not renamed').toBeTruthy();
  expect(renamed).toContain(`WRITE |Price: { ${fresh} } EUR|.`);
});

test('the text of a template, and a literal, stay as they are', () => {
  const code = ['DATA lv_price TYPE i.', "WRITE |lv_price \\{ lv_price \\}|.", "WRITE 'lv_price'."].join('\n');
  const renamed = T.renameLocals(code).code.split('\n');
  expect(renamed[1]).toBe("WRITE |lv_price \\{ lv_price \\}|.");
  expect(renamed[2]).toBe("WRITE 'lv_price'.");
});

test('the default classification is unchanged: the whole template is literal', () => {
  const line = 'WRITE |{ lv_price }|.';
  expect(T.classify(line).join('')).toBe('cccccc' + 'l'.repeat(14) + 'c');
  expect(T.classify(line, { embedsAsCode: true }).join('')).toBe('cccccc' + 'll' + 'c'.repeat(10) + 'll' + 'c');
});

test('an ENDEXEC inside a SQL literal does not end the native-SQL block (carried QA findings 44b6a590cb7b / fb183e608b15 / d7046ed7b4db)', () => {
  const lines = ['EXEC SQL.', "  SELECT 'ENDEXEC' FROM dual", '  UPDATE t SET c = c * 2', 'ENDEXEC.', 'WRITE lv_x.'];
  expect([...T.nativeSqlLines(lines)].sort()).toEqual([0, 1, 2, 3]);
});
