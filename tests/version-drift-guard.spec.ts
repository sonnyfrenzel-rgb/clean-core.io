/**
 * Version Drift Guard — Automated Regression Test
 * 
 * Prevents hardcoded version strings from going stale during version bumps.
 * Scans all source files for version-like patterns (e.g. "v1.18.1") and
 * ensures they either match the current APP_VERSION or are in an allowlisted
 * context (e.g. changelog history, dependency versions, SAP API catalog refs).
 * 
 * This test was added after v1.18.1 where 8 stale "v1.13.2" references
 * were found across 5 files — missed across 5 major releases.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { APP_VERSION } from '../lib/version';

const ROOT = path.resolve(__dirname, '..');

// --- Scan Configuration ---

/** Files/directories to scan for version strings */
const SCAN_DIRS = [
  'app',
  'components',
  'lib',
];

/** File extensions to check */
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);

/** 
 * Files that are ALLOWED to contain old version strings.
 * These are contexts where historical versions are intentional.
 */
const ALLOWLISTED_FILES = new Set([
  // Changelog pages list ALL historical versions — that's their purpose
  path.resolve(ROOT, 'app/(app)/changelog/page.tsx'),
  // The version.ts file itself defines the version
  path.resolve(ROOT, 'lib/version.ts'),
]);

/**
 * Regex patterns in a line that indicate the version string is contextual
 * and NOT a stale reference (e.g., changelog data, comment about history).
 */
const ALLOWLISTED_LINE_PATTERNS = [
  /version:\s*'v\d/,                    // changelog releases array entries
  /Version bump to v\d/,               // changelog descriptions about past bumps  
  /Bumped.*version.*from v\d/,          // changelog descriptions about past bumps
  /Bounced version references to v\d/,  // changelog descriptions about past bumps
  /bumped.*to v\d/i,                   // changelog description variants
  /from.*v\d+\.\d+.*to.*v\d+\.\d+/i,  // "from vX.Y to vX.Y" migration notes
  /serializer_version/,                // abapGit XML version attributes
  /abapGit version/,                   // abapGit XML version attributes
  /^\s*\*.*\(v\d+\.\d+/,              // JSDoc comment headers: "* Module Name (v1.X.0)"
  /^\s*\/\/\s*v\d+\.\d+/,             // Code history comments: "// v1.9.0: Feature name"
  /predate\s+v\d/,                     // Historical notes: "may predate v1.10.0"
];

/** Extract the semver-like version without 'v' prefix for flexible matching */
const VERSION_BARE = APP_VERSION.replace(/^v/, '');
const VERSION_MAJOR_MINOR = VERSION_BARE.split('.').slice(0, 2).join('.');

/**
 * Recursively collect all files matching the scan extensions.
 */
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  
  if (!fs.existsSync(dir)) return results;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, .next, and other build artifacts
      if (['node_modules', '.next', '.git', 'dist'].includes(entry.name)) continue;
      results.push(...collectFiles(fullPath));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  
  return results;
}

/**
 * Check if a line match is allowlisted (i.e., intentionally contains an old version).
 */
function isAllowlistedLine(line: string): boolean {
  return ALLOWLISTED_LINE_PATTERNS.some(pattern => pattern.test(line));
}

test.describe('Version Drift Guard', () => {

  test('APP_VERSION follows expected format', () => {
    expect(APP_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  test('package.json version matches APP_VERSION', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'package.json'), 'utf8'));
    expect(`v${pkg.version}`).toBe(APP_VERSION);
  });

  test('no stale hardcoded version strings in source files', () => {
    /**
     * Strategy: Find all "vX.Y.Z" patterns where X.Y doesn't match the
     * current major.minor. This catches cases where a version was bumped 
     * but display strings weren't updated.
     * 
     * We check for ANY version pattern that:
     * 1. Looks like a Clean-Core.io version (v1.X.Y format)
     * 2. Does NOT match the current APP_VERSION
     * 3. Is NOT in an allowlisted file or context
     */
    const staleFindings: Array<{ file: string; line: number; content: string; version: string }> = [];
    
    // Pattern matches "v1.X.Y" format — our version scheme
    const VERSION_PATTERN = /v1\.\d+\.\d+/g;
    
    for (const dir of SCAN_DIRS) {
      const files = collectFiles(path.resolve(ROOT, dir));
      
      for (const filePath of files) {
        // Skip allowlisted files entirely
        if (ALLOWLISTED_FILES.has(filePath)) continue;
        
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Skip allowlisted line patterns
          if (isAllowlistedLine(line)) continue;
          
          let match;
          while ((match = VERSION_PATTERN.exec(line)) !== null) {
            const foundVersion = match[0];
            
            // Only flag if it's NOT the current version
            if (foundVersion !== APP_VERSION) {
              staleFindings.push({
                file: path.relative(ROOT, filePath),
                line: i + 1,
                content: line.trim().substring(0, 120),
                version: foundVersion,
              });
            }
          }
        }
      }
    }
    
    if (staleFindings.length > 0) {
      const report = staleFindings
        .map(f => `  ${f.file}:${f.line} → found "${f.version}" (expected "${APP_VERSION}")\n    ${f.content}`)
        .join('\n\n');
      
      expect(staleFindings, 
        `\n\n🚨 VERSION DRIFT DETECTED!\n\n` +
        `Found ${staleFindings.length} hardcoded version string(s) that don't match APP_VERSION (${APP_VERSION}).\n` +
        `These were likely missed during the last version bump.\n\n` +
        `Fix: Replace hardcoded versions with APP_VERSION import, or update the string literal.\n\n` +
        `${report}\n\n` +
        `If these are intentional (e.g., historical references), add the file or line pattern to the allowlist in version-drift-guard.spec.ts.\n`
      ).toHaveLength(0);
    }
  });

  test('CHANGELOG.md has an entry for the current version', () => {
    const changelog = fs.readFileSync(path.resolve(ROOT, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain(`[${APP_VERSION}]`);
  });

  test('changelog page has an entry for the current version', () => {
    const changelogPage = fs.readFileSync(
      path.resolve(ROOT, 'app/(app)/changelog/page.tsx'), 
      'utf8'
    );
    expect(changelogPage).toContain(`version: '${APP_VERSION}'`);
  });

  test('current changelog entry has the Latest tag', () => {
    const changelogPage = fs.readFileSync(
      path.resolve(ROOT, 'app/(app)/changelog/page.tsx'), 
      'utf8'
    );
    
    // Find the first release entry — it should be the current version with 'Latest' tag
    const firstVersionMatch = changelogPage.match(/version:\s*'(v[\d.]+)'/);
    const firstTagMatch = changelogPage.match(/tag:\s*'(\w+)'/);
    
    expect(firstVersionMatch?.[1]).toBe(APP_VERSION);
    expect(firstTagMatch?.[1]).toBe('Latest');
  });
});
