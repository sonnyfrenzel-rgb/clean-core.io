import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';
import { getClientIp } from '../lib/rate-limit';

/**
 * The address a rate limit is keyed on is the one the client did not choose
 * (QA review of 85e767799587).
 *
 * `getClientIp` took the first `X-Forwarded-For` entry, which is the part of
 * the header the client writes. On Cloud Run the front end appends the
 * connecting address last, so the last entry is the peer it actually saw.
 */
const requestWith = (headers: Record<string, string>) =>
  new NextRequest('http://localhost/api/export/verify', { headers });

test('a spoofed prefix does not move the key', () => {
  // Two requests from the same peer, each with a different made-up prefix,
  // used to land in two different windows.
  const first = getClientIp(requestWith({ 'x-forwarded-for': '198.51.100.7, 203.0.113.9' }));
  const second = getClientIp(requestWith({ 'x-forwarded-for': '198.51.100.8, 203.0.113.9' }));
  expect(first).toBe('203.0.113.9');
  expect(second).toBe(first);
});

test('the last entry is taken as the front end wrote it, whitespace and empty entries aside', () => {
  expect(getClientIp(requestWith({ 'x-forwarded-for': ' 198.51.100.7 ,203.0.113.9 , ' }))).toBe('203.0.113.9');
  expect(getClientIp(requestWith({ 'x-forwarded-for': '2001:db8::1, 2001:db8::9' }))).toBe('2001:db8::9');
});

test('a single entry is the client', () => {
  expect(getClientIp(requestWith({ 'x-forwarded-for': '203.0.113.9' }))).toBe('203.0.113.9');
});

test('without the header: x-real-ip, then the placeholder', () => {
  expect(getClientIp(requestWith({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  expect(getClientIp(requestWith({}))).toBe('0.0.0.0');
  // An empty forwarded header is no address either.
  expect(getClientIp(requestWith({ 'x-forwarded-for': ' , ' }))).toBe('0.0.0.0');
});

test('the shared Gemini key is metered per account, not per account and address', () => {
  // The header of `/api/gemini` calls this limiter "the primary cost guard on
  // the shared community Gemini key". A key of account *and* address is a
  // ceiling per pair, so the same account reaching the route through a second
  // address gets a second allowance of 20 an hour, and a third, and the stated
  // ceiling bounds nothing. The account is what is being metered and the
  // verified token already establishes it; a limit on the address is a separate
  // question with a separate key.
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'app/api/gemini/route.ts'), 'utf8');
  expect(src, 'the per-account ceiling is gone').toContain('assertRateLimit(`gemini:${decodedToken.uid}`');
  expect(src, 'the address is back in the cost-guard key').not.toContain('gemini:${decodedToken.uid}:');
});
