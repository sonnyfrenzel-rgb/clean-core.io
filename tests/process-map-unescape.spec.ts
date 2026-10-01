import { test, expect } from '@playwright/test';
import { parseBpmn } from '../lib/process-map';

/**
 * Attribute values are decoded once, the way an XML parser does — QA review of
 * 072f79996d01 (cc53c3550d3f).
 *
 * The numeric references were decoded before `&amp;`, so `&#38;amp;` (the
 * literal text "&amp;") came out as "&": a reference decoded twice. And a
 * reference into the surrogate range produced a lone surrogate that a later
 * serialisation writes as ill-formed XML.
 */

const named = (name: string) =>
  parseBpmn(`<bpmn:definitions><bpmn:process id="P" name="${name}"></bpmn:process></bpmn:definitions>`).processName;

test('each reference is decoded exactly once', () => {
  expect(named('a &#38;amp; b')).toBe('a &amp; b');
  expect(named('a &amp;lt; b')).toBe('a &lt; b');
  expect(named('&#x26;quot;')).toBe('&quot;');
});

test('the forms bpmn-moddle writes still read back', () => {
  expect(named('x &#60; 5 &amp;&amp; y &gt; 2')).toBe('x < 5 && y > 2');
  expect(named('&quot;A&quot; &apos;B&apos;&#10;C')).toBe('"A" \'B\'\nC');
  expect(named('&#x1F600;')).toBe('\u{1F600}');
});

test('a reference into the surrogate range or past Unicode is dropped, not passed on', () => {
  expect(named('a&#xD800;b')).toBe('ab');
  expect(named('a&#57343;b')).toBe('ab');
  expect(named('a&#x110000;b')).toBe('ab');
});
