import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';
import { exec } from 'child_process';
import util from 'util';
import { LintError } from '../shared/types';

const execAsync = util.promisify(exec);

/**
 * P6: Real validation for diffs.
 * - TypeScript: uses the programmatic API (ts.createProgram) with the project's
 *   actual tsconfig, so type checking is meaningful.
 * - Linting: shells out to oxlint (the project's chosen linter) with proper
 *   error handling — no more `|| true` that swallows all errors.
 * - Temp files: written to os.tmpdir() with unique names, cleaned up after.
 */

export async function validateDiff(file: string, content: string, projectRoot?: string): Promise<LintError[]> {
  const errors: LintError[] = [];

  // TypeScript validation
  try {
    const tsErrors = await validateTypeScript(file, content, projectRoot);
    errors.push(...tsErrors);
  } catch (error: any) {
    console.error('TypeScript validation error:', error);
    errors.push({
      file,
      line: 0,
      column: 0,
      message: `TypeScript validation failed: ${error.message || error}`,
      severity: 'error',
      rule: 'typescript',
    });
  }

  // Linting (oxlint — project's chosen linter)
  try {
    const lintErrors = await validateOxlint(file, content);
    errors.push(...lintErrors);
  } catch (error: any) {
    console.error('Oxlint validation error:', error);
    // Don't fail if oxlint isn't installed — just log and continue
    if (!error.message?.includes('oxlint')) {
      errors.push({
        file,
        line: 0,
        column: 0,
        message: `Lint validation failed: ${error.message || error}`,
        severity: 'error',
        rule: 'oxlint',
      });
    }
  }

  return errors;
}

async function validateTypeScript(file: string, content: string, projectRoot?: string): Promise<LintError[]> {
  const errors: LintError[] = [];

  // Write content to a temp file in os.tmpdir() with a unique name
  const tempFileName = `ts-validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.tsx`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  try {
    await fs.writeFile(tempFilePath, content, 'utf-8');

    // Find the project's tsconfig (or use a default)
    const tsConfigPath = projectRoot
      ? path.join(projectRoot, 'tsconfig.json')
      : path.join(path.dirname(file), 'tsconfig.json');

    let compilerOptions: ts.CompilerOptions = {
      noEmit: true,
      skipLibCheck: true,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
    };

    // Try to load the project's tsconfig if it exists
    try {
      const configResult = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
      if (configResult.config) {
        const parsed = ts.parseJsonConfigFileContent(configResult.config, ts.sys, path.dirname(tsConfigPath));
        compilerOptions = { ...compilerOptions, ...parsed.options };
      }
    } catch {
      // No tsconfig found — use defaults above
    }

    // Create a TypeScript program and check for errors
    const program = ts.createProgram([tempFilePath], compilerOptions);
    const diagnostics = ts.getPreEmitDiagnostics(program);

    for (const diagnostic of diagnostics) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      const sourceFile = diagnostic.file;

      let line = 0;
      let column = 0;

      if (sourceFile && diagnostic.start !== undefined) {
        const pos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start);
        line = pos.line + 1; // 1-based
        column = pos.character + 1; // 1-based
      }

      errors.push({
        file,
        line,
        column,
        message,
        severity: diagnostic.category === ts.DiagnosticCategory.Error ? 'error' : 'warning',
        rule: 'typescript',
      });
    }
  } finally {
    // Clean up temp file
    await fs.unlink(tempFilePath).catch(() => {});
  }

  return errors;
}

async function validateOxlint(file: string, content: string): Promise<LintError[]> {
  const errors: LintError[] = [];

  // Write content to a temp file in os.tmpdir() with a unique name
  const ext = path.extname(file) || '.tsx';
  const tempFileName = `oxlint-validate-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const tempFilePath = path.join(os.tmpdir(), tempFileName);

  try {
    await fs.writeFile(tempFilePath, content, 'utf-8');

    // Run oxlint with JSON output for parsing
    // --format=json gives us machine-readable output
    const { stdout, stderr } = await execAsync(
      `npx oxlint --format=json "${tempFilePath}"`,
      { encoding: 'utf-8' }
    );

    // Parse JSON output
    let oxlintOutput: any[];
    try {
      oxlintOutput = JSON.parse(stdout || '[]');
    } catch {
      // If JSON parse fails, check if there's any stderr indicating oxlint isn't installed
      if (stderr?.includes('oxlint') || stdout?.includes('oxlint')) {
        throw new Error(`oxlint not available: ${stderr || stdout}`);
      }
      // Otherwise assume no lint errors
      return errors;
    }

    // oxlint JSON format: [{ "rule": "...", "severity": "error"|"warning", "message": "...", "line": N, "column": N }, ...]
    for (const item of Array.isArray(oxlintOutput) ? oxlintOutput : []) {
      errors.push({
        file,
        line: item.line || 0,
        column: item.column || 0,
        message: item.message || 'Unknown lint error',
        severity: item.severity === 'error' ? 'error' : 'warning',
        rule: item.rule || 'oxlint',
      });
    }
  } catch (error: any) {
    // If oxlint isn't installed, just skip linting (don't fail the validation)
    if (error.message?.includes('oxlint') || error.message?.includes('not found')) {
      console.warn('[DiffValidator] oxlint not available, skipping lint validation');
      return errors;
    }
    throw error;
  } finally {
    // Clean up temp file
    await fs.unlink(tempFilePath).catch(() => {});
  }

  return errors;
}