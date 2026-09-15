import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { finished } from 'node:stream/promises';

/**
 * Running the headless CLI and reading what it returned — without any of it
 * reaching the public Actions log.
 */

/**
 * Runs a command with stdout and stderr going to files, never to this process's
 * own output. Resolves with the exit code only once both files are flushed: the
 * child's `close` comes before the write streams finish, and a report read at
 * that moment can be empty or cut (QA review of 52b34aba4cb8, finding 9755c9d18aa8).
 */
export function runToFiles({ command, args, env, stdoutPath, stderrPath }) {
  const stdout = createWriteStream(stdoutPath);
  const stderr = createWriteStream(stderrPath);
  const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  // pipe() ends each file when the child's stream ends.
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  return Promise.all([exited, finished(stdout), finished(stderr)]).then(([code]) => code);
}

/** The final result record of a --output-format json run, or null. */
export function resultRecord(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const records = Array.isArray(parsed) ? parsed : [parsed];
  return records.filter((r) => r?.type === 'result').at(-1) || null;
}

/**
 * Why an API call failed, as one of a fixed set of labels. The error text itself
 * never reaches the log — an API error can quote the request — but "HTTP 400"
 * alone cannot tell an empty credit balance from an unsupported parameter (the
 * first self-test, 15.09.2026). Most specific first; anything else is
 * `unrecognised`.
 */
const API_ERROR_HINTS = [
  [/credit balance is too low/i, 'credit balance too low'],
  [/authentication_error|invalid x-api-key/i, 'authentication failed'],
  [/permission_error/i, 'key lacks permission'],
  [/not_found_error/i, 'model or resource not found'],
  [/prompt is too long|context window|too many tokens/i, 'input too long'],
  [/rate_limit_error|overloaded_error/i, 'rate limited or overloaded'],
  [/not supported|does not support|unsupported|extra inputs are not permitted/i, 'a request parameter is not supported'],
  [/invalid_request_error/i, 'invalid request (other)'],
];

export function apiErrorHint(record) {
  if (!record?.is_error) return 'none';
  const text = typeof record.result === 'string' ? record.result : '';
  return API_ERROR_HINTS.find(([re]) => re.test(text))?.[1] || 'unrecognised';
}
