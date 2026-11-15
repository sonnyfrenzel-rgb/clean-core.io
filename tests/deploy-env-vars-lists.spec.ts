import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * A list value reaches Cloud Run as one variable.
 *
 * The deploy action (google-github-actions/deploy-cloudrun) reads `env_vars`
 * as KEY=VALUE pairs split at newlines and at commas; a comma that belongs to
 * a value must arrive as "\,". Read on both services on 14.11.2026:
 * S4_HOST_ALLOWLIST held only its first host, and every further host had
 * become a variable of its own without a value. GEMINI_STAGE_MODELS, a list
 * too, would have kept only its first stage. Both now pass through one escape
 * step (`kv-escape`) before the deploy.
 */

const deploy = fs.readFileSync(path.resolve(__dirname, '..', '.github', 'workflows', 'deploy.yml'), 'utf8');

/** The KEY=VALUE lines of the deploy step's `env_vars` block. */
function envVarLines(): string[] {
  const step = deploy.slice(deploy.indexOf('- name: Deploy to Google Cloud Run'));
  const block = step.slice(step.indexOf('env_vars: |') + 'env_vars: |'.length);
  const lines: string[] = [];
  for (const line of block.split(/\r?\n/).slice(1)) {
    if (!/^\s{12}\S/.test(line)) break;
    lines.push(line.trim());
  }
  return lines;
}

/** The splitting rule the action applies: newlines and unescaped commas separate pairs. */
function parsePairs(input: string): Map<string, string> {
  const out = new Map<string, string>();
  let current = '';
  const flush = () => {
    const trimmed = current.trim();
    current = '';
    if (!trimmed) return;
    const eq = trimmed.indexOf('=');
    out.set(eq < 0 ? trimmed : trimmed.slice(0, eq), eq < 0 ? '' : trimmed.slice(eq + 1));
  };
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '\\' && (input[i + 1] === ',' || input[i + 1] === '\n')) {
      current += input[i + 1];
      i += 1;
    } else if (ch === ',' || ch === '\n') {
      flush();
    } else {
      current += ch;
    }
  }
  flush();
  return out;
}

test('the list values reach the deploy step through the escape step', () => {
  const lines = envVarLines();
  expect(lines.length).toBeGreaterThan(10);
  expect(lines).toContain('S4_HOST_ALLOWLIST=${{ steps.kv-escape.outputs.s4_host_allowlist }}');
  expect(lines).toContain('GEMINI_STAGE_MODELS=${{ steps.kv-escape.outputs.gemini_stage_models }}');
  // No other line carries a literal comma the action would split at.
  for (const line of lines) expect(line.replace(/\\,/g, ''), line).not.toContain(',');
});

test('the escape step runs before the deploy, under the same condition, and escapes every comma', () => {
  const escape = deploy.indexOf('- name: Escape list values for the deploy action');
  expect(escape).toBeGreaterThan(0);
  expect(escape).toBeLessThan(deploy.indexOf('- name: Deploy to Google Cloud Run'));
  const step = deploy.slice(escape, deploy.indexOf('- name: Deploy to Google Cloud Run'));
  expect(step).toContain('id: kv-escape');
  expect(step).toContain("if: steps.fresh.outputs.current == 'true'");
  expect(step).toContain('S4_HOST_ALLOWLIST: ${{ secrets.S4_HOST_ALLOWLIST }}');
  expect(step).toContain('STAGE_MODELS: ${{ steps.env-ctx.outputs.gemini_stage_models }}');
  expect(step.split("sed 's/,/\\\\,/g'").length - 1).toBe(2);
  // The escaped allowlist is masked as the secret it comes from would be.
  expect(step).toContain('echo "::add-mask::$s4"');
});

test('escaped, a list stays one variable; unescaped, it falls apart as it did', () => {
  const hosts = '.s4hana.cloud,.hana.ondemand.com,.sapcloud.cn';
  const stages = 'statements=gemini-4-hydrogen,analyze=gemini-4-hydrogen';
  const escape = (v: string) => v.replace(/,/g, '\\,');

  const broken = parsePairs(`S4_HOST_ALLOWLIST=${hosts}\nGEMINI_STAGE_MODELS=${stages}`);
  expect(broken.get('S4_HOST_ALLOWLIST')).toBe('.s4hana.cloud');
  expect(broken.has('.hana.ondemand.com')).toBe(true);
  expect(broken.get('GEMINI_STAGE_MODELS')).toBe('statements=gemini-4-hydrogen');

  const fixed = parsePairs(`S4_HOST_ALLOWLIST=${escape(hosts)}\nGEMINI_STAGE_MODELS=${escape(stages)}`);
  expect(fixed.get('S4_HOST_ALLOWLIST')).toBe(hosts);
  expect(fixed.get('GEMINI_STAGE_MODELS')).toBe(stages);
  expect(fixed.size).toBe(2);
});
