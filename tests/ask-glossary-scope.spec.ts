/**
 * "Ask this case" — the glossary answers only what it is asked (roadmap 3.5.4, item 1).
 *
 * The glossary used to answer any question that *contained* a term: "Explain RAP
 * vs CAP" got the RAP entry, "How does TCO analysis work?" the TCO definition,
 * and a question about this project's code that named a term got the glossary
 * instead of the project's evidence. Now only an explicit "What is …?" /
 * "What does … mean?" whose subject is exactly a glossary name, or the bare
 * name, is a glossary question.
 *
 * Server-free: pure functions.
 */
import { test, expect } from '@playwright/test';
import { GLOSSARY_ITEMS } from '../lib/glossary';
import { findGlossaryTermExact, glossaryAnswerFor, glossaryAnswerText, parseWhatIsQuestion } from '../lib/glossary-lookup';

test.describe('a glossary question is an explicit one', () => {
  for (const [question, key] of [
    ['What is RAP?', 'RAP'],
    ['what is clean core', 'Clean Core'],
    ["What's CAP?", 'CAP'],
    ['What is a released API?', 'Released API'],
    ['What are BAdIs?', 'BAdI'],
    ['What does BAdI mean?', 'BAdI'],
    ['What does TCO stand for?', 'TCO'],
    ['RAP', 'RAP'],
    ['  Clean   Core? ', 'Clean Core'],
  ] as const) {
    test(`"${question}" is answered from the ${key} entry`, () => {
      const answer = glossaryAnswerFor(question);
      expect(answer?.key).toBe(key);
      expect(answer?.answer).toBe(glossaryAnswerText(GLOSSARY_ITEMS[key]));
    });
  }
});

test.describe('a question that only mentions a term gets no glossary entry', () => {
  for (const question of [
    'Explain RAP vs CAP',
    'How does TCO analysis work?',
    'Does this program call a released API?',
    'Where does this program write to the database, and is that Clean Core?',
    'What is the difference between RAP and CAP?',
    'Tell me about SAP BTP please',
    'What is Clean Core compliance?',
    'core',
  ]) {
    test(`"${question}"`, () => {
      expect(glossaryAnswerFor(question)).toBeNull();
    });
  }
});

test('the explicit shapes parse to their subject, and nothing else parses', () => {
  expect(parseWhatIsQuestion('What does CDS View mean?')).toBe('CDS View');
  expect(parseWhatIsQuestion('What do BAdIs stand for?')).toBe('BAdIs');
  expect(parseWhatIsQuestion('Explain RAP vs CAP')).toBeNull();
  expect(parseWhatIsQuestion('How does TCO analysis work?')).toBeNull();
});

test('the exact lookup matches a whole name, never a part of one', () => {
  expect(findGlossaryTermExact('RAP vs CAP')).toBeNull();
  expect(findGlossaryTermExact('TCO analysis')).toBeNull();
  expect(findGlossaryTermExact('tco')?.key).toBe('TCO');
  // A short name is not plural-stripped into another entry.
  expect(findGlossaryTermExact('abs')).toBeNull();
});
