import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { verifyRequestAuth } from '@/lib/firebase-admin';

const execAsync = promisify(exec);

interface TestRunResult {
  id: string;
  name: string;
  status: 'Passed' | 'Failed';
  message?: string;
}

function parseTapOutput(stdout: string): TestRunResult[] {
  const results: TestRunResult[] = [];
  const lines = stdout.split('\n');
  
  // Look for lines like:
  // "ok 1 - TC_01: name"
  // "not ok 2 - TC_02: name"
  const testLineRegex = /^(ok|not ok)\s+\d+\s+-\s+([A-Za-z0-9_]+):?\s*(.*)$/;
  
  let currentResult: TestRunResult | null = null;
  let inErrorBlock = false;
  let errorMessageLines: string[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(testLineRegex);
    
    if (match) {
      // Save error message for previous failed test
      if (currentResult && currentResult.status === 'Failed' && errorMessageLines.length > 0) {
        currentResult.message = errorMessageLines.join(' ').replace(/\s+/g, ' ').trim();
      }
      
      const status = match[1] === 'ok' ? 'Passed' : 'Failed';
      const id = match[2];
      const name = match[3] || id;
      
      currentResult = {
        id,
        name,
        status,
        message: status === 'Passed' ? 'Verified by Node.js Test Runner' : 'Test assertion failed'
      };
      results.push(currentResult);
      inErrorBlock = false;
      errorMessageLines = [];
    } else if (currentResult && currentResult.status === 'Failed') {
      if (trimmed.startsWith('error:')) {
        inErrorBlock = true;
        errorMessageLines.push(trimmed.replace(/^error:\s*/, ''));
      } else if (inErrorBlock && (trimmed.startsWith('stack:') || trimmed.startsWith('---') || trimmed.startsWith('...'))) {
        inErrorBlock = false;
      } else if (inErrorBlock) {
        errorMessageLines.push(trimmed);
      }
    }
  }
  
  // Save last failure's error message
  if (currentResult && currentResult.status === 'Failed' && errorMessageLines.length > 0) {
    currentResult.message = errorMessageLines.join(' ').replace(/\s+/g, ' ').trim();
  }
  
  return results;
}

export async function POST(req: Request) {
  // ── AUTH CHECK (Befund 1 fix) ──────────────────────────────
  const decodedToken = await verifyRequestAuth(req);
  if (!decodedToken) {
    return NextResponse.json(
      { output: '', error: 'Authentication required.', exitCode: 1 },
      { status: 401 }
    );
  }

  const { tests, projectId, code, selectedTestIds, s4Environment, s4Config } = await req.json();
  
  // ── INPUT SANITISATION (Befund 1 fix: command injection + path traversal) ──
  const sanitizedProjectId = (projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!sanitizedProjectId) {
    return NextResponse.json(
      { output: '', error: 'Invalid project ID.', exitCode: 1 },
      { status: 400 }
    );
  }

  // Use a project-relative directory for tests
  const testDir = path.join(process.cwd(), 'tmp', 'tests', sanitizedProjectId);
  
  try {
    await fs.mkdir(testDir, { recursive: true });
    const testPath = path.join(testDir, 'test.ts');
    
    // Write application files (Modular vs Legacy Monolithic)
    let filesParsed = false;
    if (code) {
      try {
        const parsed = JSON.parse(code);
        if (Array.isArray(parsed) && parsed.every(f => typeof f.path === 'string' && typeof f.content === 'string')) {
          for (const file of parsed) {
            // ── PATH TRAVERSAL PROTECTION (Befund 1 fix) ──
            const safePath = file.path.replace(/\.\./g, '').replace(/^[\/\\]+/, '');
            const filePath = path.join(testDir, safePath);
            if (!filePath.startsWith(testDir)) continue; // skip path traversal attempts
            
            const dirPath = path.dirname(filePath);
            await fs.mkdir(dirPath, { recursive: true });
            
            let safeContent = file.content;
            if (file.path.endsWith('.ts') || file.path.endsWith('.js')) {
              safeContent = safeContent.replace(/app\.listen/g, '((...args: any[]) => ({ close: () => {} }))');
              
              if (file.path !== 'test.ts') {
                safeContent = "// @ts-nocheck\n" + safeContent;
              }
            }
            await fs.writeFile(filePath, safeContent);
          }
          filesParsed = true;
          console.log(`[TestRunner] Mounted modular project structure for ${sanitizedProjectId} with ${parsed.length} files.`);
        }
      } catch (e) {
        // Not JSON - fallback to legacy flat app
      }
    }
    
    if (!filesParsed && code) {
      // Legacy flat file setup
      const appPath = path.join(testDir, 'app.ts');
      const safeAppCode = code.replace(/app\.listen/g, '((...args: any[]) => ({ close: () => {} }))');
      await fs.writeFile(appPath, "// @ts-nocheck\n" + safeAppCode);
    }
    
    // Write the test code
    const testCode = (tests && tests.code) ? tests.code : (tests && tests.spec) ? tests.spec : null;
    if (testCode) {
      await fs.writeFile(testPath, testCode);
    } else {
      throw new Error("No test code provided in the project data. Please click 'Regenerate Tests' to create a Node.js test suite.");
    }
    
    // Write a tsconfig.json to ensure correct compiler options
    const tsconfigPath = path.join(testDir, 'tsconfig.json');
    await fs.writeFile(tsconfigPath, JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "CommonJS",
        moduleResolution: "node",
        esModuleInterop: true,
        skipLibCheck: true,
        strict: false,
        experimentalDecorators: true,
        emitDecoratorMetadata: true
      },
      include: ["**/*.ts"]
    }));
    
    // Identify binary paths to avoid npx relying on global package.json context
    const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
    
    // Build test execution command with selection filters and TAP reporter
    let options = '--test --test-reporter=tap';
    if (selectedTestIds && Array.isArray(selectedTestIds) && selectedTestIds.length > 0) {
      const pattern = selectedTestIds.map((id: string) => id.replace(/[^A-Za-z0-9_]/g, '')).filter(Boolean).join('|');
      if (pattern) {
        options += ` --test-name-pattern="${pattern}"`;
      }
    }
    
    const command = `"${tsxBin}" ${options} "${testPath}"`;
    
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    
    try {
      console.log(`[TestRunner] Executing tests for project ${sanitizedProjectId} in ${testDir}. Command: ${command}`);
      const result = await execAsync(command, { 
        cwd: testDir, 
        timeout: 15000,
        // ── ENV SANITISATION (Befund 1 fix: no more ...process.env) ──
        env: { 
          PATH: process.env.PATH || '',
          SYSTEMROOT: process.env.SYSTEMROOT || '',   // needed on Windows
          NODE_PATH: path.join(process.cwd(), 'node_modules'),
          NODE_ENV: 'test',
          ...(s4Environment === 'live' && s4Config ? {
            S4_TENANT_URL: s4Config.url || '',
            S4_USERNAME: s4Config.username || '',
            S4_PASSWORD: s4Config.password || '',
            S4_AUTH_TYPE: s4Config.authType || 'basic'
          } : {})
        } 
      });
      stdout = result.stdout;
      stderr = result.stderr;
      console.log(`[TestRunner] Tests passed for ${sanitizedProjectId}`);
    } catch (err: any) {
      stdout = err.stdout || '';
      stderr = err.stderr || err.message;
      exitCode = err.code || 1;
      console.error(`[TestRunner] Tests failed for ${sanitizedProjectId}:`, stderr);
    } finally {
      // Cleanup temporary test directory
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.error('[TestRunner] Cleanup error:', cleanupErr);
      }
    }
    
    const testResults = parseTapOutput(stdout);
    return NextResponse.json({ output: stdout, error: stderr, exitCode, testResults });
  } catch (err: any) {
    console.error('Test Runner API Error:', err);
    return NextResponse.json({ 
      output: '', 
      error: err.message || 'Internal Server Error during test execution',
      exitCode: 1 
    }, { status: 500 });
  }
}
